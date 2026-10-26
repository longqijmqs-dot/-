import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { Conversation, Message } from '@app/contract';
import { conversationsApi, messagesApi, sendMessageStream } from '../api/chat';
import { ApiError } from '../api/http';

/**
 * 对话状态。
 *
 * 三块数据：
 *   conversations  会话列表
 *   messages       按会话隔离的消息数组（切换会话互不污染）
 *   cursors        每个会话「更早消息」的游标
 *
 * 两个关键机制：
 *   1. 乐观更新：用户消息立刻上屏，不等服务端返回
 *   2. 帧合批：delta 先累积，每个动画帧最多写一次 DOM，
 *      否则一条长回复会把主线程按毫秒级刷爆
 */
export const useChatStore = defineStore('chat', () => {
  const conversations = ref<Conversation[]>([]);
  const currentId = ref<string | null>(null);
  const messages = ref<Record<string, Message[]>>({});
  const cursors = ref<Record<string, string | null>>({});
  const loadingConversations = ref(false);
  const loadingMessages = ref(false);
  const streamingConversationId = ref<string | null>(null);
  const error = ref<string | null>(null);

  const aborters = new Map<string, AbortController>();
  const pendingFrames = new Map<string, number>();

  const currentMessages = computed(() =>
    currentId.value ? (messages.value[currentId.value] ?? []) : [],
  );
  const isStreaming = computed(() => streamingConversationId.value !== null);
  const currentConversation = computed(
    () => conversations.value.find((item) => item.id === currentId.value) ?? null,
  );

  function listOf(conversationId: string): Message[] {
    messages.value[conversationId] ??= [];
    return messages.value[conversationId];
  }

  function findMessage(conversationId: string, messageId: string): Message | undefined {
    return listOf(conversationId).find((item) => item.id === messageId);
  }

  // ---------------------------------------------------------------- 会话

  async function loadConversations(): Promise<void> {
    loadingConversations.value = true;
    try {
      const result = await conversationsApi.list();
      conversations.value = result.items;
      if (!currentId.value && result.items.length > 0) {
        await selectConversation(result.items[0]!.id);
      }
    } catch (err) {
      error.value = (err as ApiError).message;
    } finally {
      loadingConversations.value = false;
    }
  }

  async function createConversation(): Promise<string | null> {
    try {
      const created = await conversationsApi.create({});
      conversations.value = [created, ...conversations.value];
      messages.value[created.id] = [];
      await selectConversation(created.id);
      return created.id;
    } catch (err) {
      error.value = (err as ApiError).message;
      return null;
    }
  }

  async function selectConversation(conversationId: string): Promise<void> {
    // 切走时中断当前流：否则 A 的回复会写进 B 的气泡
    if (streamingConversationId.value && streamingConversationId.value !== conversationId) {
      stopStreaming();
    }
    currentId.value = conversationId;
    error.value = null;

    if (messages.value[conversationId] === undefined) {
      await loadHistory(conversationId);
    }
  }

  async function loadHistory(conversationId: string, before?: string): Promise<void> {
    loadingMessages.value = true;
    try {
      const result = await messagesApi.history(conversationId, {
        limit: 30,
        ...(before ? { before } : {}),
      });
      if (before) {
        // 加载更早：插到顶部，不覆盖已有消息
        messages.value[conversationId] = [...result.items, ...(messages.value[conversationId] ?? [])];
      } else {
        messages.value[conversationId] = result.items;
      }
      cursors.value[conversationId] = result.nextCursor;
    } catch (err) {
      error.value = (err as ApiError).message;
    } finally {
      loadingMessages.value = false;
    }
  }

  async function loadOlder(): Promise<void> {
    const conversationId = currentId.value;
    if (!conversationId) {
      return;
    }
    const cursor = cursors.value[conversationId];
    if (!cursor) {
      return;
    }
    await loadHistory(conversationId, cursor);
  }

  async function renameConversation(conversationId: string, title: string): Promise<void> {
    const updated = await conversationsApi.update(conversationId, { title });
    const index = conversations.value.findIndex((item) => item.id === conversationId);
    if (index >= 0) {
      conversations.value[index] = { ...conversations.value[index]!, title: updated.title };
    }
  }

  async function archiveConversation(conversationId: string): Promise<void> {
    await conversationsApi.update(conversationId, { isArchived: true });
    conversations.value = conversations.value.filter((item) => item.id !== conversationId);
    if (currentId.value === conversationId) {
      currentId.value = conversations.value[0]?.id ?? null;
      if (currentId.value) {
        await loadHistory(currentId.value);
      }
    }
  }

  // ---------------------------------------------------------------- 发消息

  async function sendMessage(content: string): Promise<void> {
    const conversationId = currentId.value;
    const text = content.trim();
    if (!conversationId || !text || isStreaming.value) {
      return;
    }

    const clientMessageId = crypto.randomUUID();
    const now = new Date().toISOString();
    const list = listOf(conversationId);

    // 乐观更新：用户消息立刻上屏
    const optimisticUser: Message = {
      id: `local-${clientMessageId}`,
      conversationId,
      role: 'user',
      content: text,
      status: 'complete',
      model: null,
      tokenCount: null,
      clientMessageId,
      createdAt: now,
      finishedAt: now,
    };
    const placeholder: Message = {
      id: `pending-${clientMessageId}`,
      conversationId,
      role: 'assistant',
      content: '',
      status: 'streaming',
      model: null,
      tokenCount: null,
      clientMessageId: null,
      createdAt: now,
      finishedAt: null,
    };
    list.push(optimisticUser, placeholder);

    const controller = new AbortController();
    aborters.set(conversationId, controller);
    streamingConversationId.value = conversationId;
    error.value = null;

    let assistantId = placeholder.id;
    let accumulated = '';

    const flush = (): void => {
      pendingFrames.delete(assistantId);
      const target = findMessage(conversationId, assistantId);
      if (target) {
        target.content = accumulated;
      }
    };

    const scheduleFlush = (): void => {
      if (pendingFrames.has(assistantId)) {
        return;
      }
      const handle = requestAnimationFrame(flush);
      pendingFrames.set(assistantId, handle);
    };

    try {
      await sendMessageStream(
        conversationId,
        { content: text, clientMessageId },
        {
          onMeta: (meta) => {
            assistantId = meta.messageId;
            const target = findMessage(conversationId, placeholder.id);
            if (target) {
              target.id = meta.messageId;
              target.model = meta.model;
            }
          },
          onDelta: (delta) => {
            accumulated += delta.text;
            scheduleFlush();
          },
          onDone: (done) => {
            accumulated = done.content;
            const target = findMessage(conversationId, assistantId);
            if (target) {
              target.content = done.content;
              target.status = 'complete';
              target.tokenCount = done.tokenCount;
              target.finishedAt = new Date().toISOString();
            }
          },
          onError: (event) => {
            const target = findMessage(conversationId, assistantId);
            if (target) {
              target.status = 'failed';
              target.content = accumulated;
              target.finishedAt = new Date().toISOString();
            }
            error.value = event.message;
          },
        },
        controller.signal,
      );
    } catch (err) {
      const target = findMessage(conversationId, assistantId);
      const aborted = (err as { name?: string }).name === 'AbortError';
      if (target) {
        target.status = aborted ? 'interrupted' : 'failed';
        target.content = accumulated;
        target.finishedAt = new Date().toISOString();
      }
      if (!aborted) {
        error.value = (err as ApiError).message ?? '发送失败';
      }
    } finally {
      aborters.delete(conversationId);
      streamingConversationId.value = null;
      const handle = pendingFrames.get(assistantId);
      if (handle !== undefined) {
        cancelAnimationFrame(handle);
        pendingFrames.delete(assistantId);
      }
    }
  }

  /** 用户主动停止生成（对应 PRD 的流式中断） */
  function stopStreaming(): void {
    const conversationId = streamingConversationId.value;
    if (!conversationId) {
      return;
    }
    aborters.get(conversationId)?.abort();
  }

  function clearError(): void {
    error.value = null;
  }

  return {
    conversations,
    currentId,
    messages,
    loadingConversations,
    loadingMessages,
    streamingConversationId,
    error,
    currentMessages,
    currentConversation,
    isStreaming,
    loadConversations,
    createConversation,
    selectConversation,
    loadOlder,
    renameConversation,
    archiveConversation,
    sendMessage,
    stopStreaming,
    clearError,
  };
});
