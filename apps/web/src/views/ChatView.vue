<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import type { Attachment } from '@app/contract';
import ChatComposer from '../components/ChatComposer.vue';
import ConversationSidebar from '../components/ConversationSidebar.vue';
import MessageBubble from '../components/MessageBubble.vue';
import { useAuthStore } from '../stores/auth';
import { useChatStore } from '../stores/chat';

const auth = useAuthStore();
const chat = useChatStore();
const router = useRouter();

const scroller = ref<HTMLElement | null>(null);
const composerRef = ref<InstanceType<typeof ChatComposer> | null>(null);
const sidebarOpen = ref(false);

onMounted(async () => {
  await chat.loadConversations();
  await scrollToBottom();
});

// 新消息 / 流式增量都保持贴底，但用户往上翻时不打扰
let stickToBottom = true;
function onScroll(): void {
  const el = scroller.value;
  if (!el) {
    return;
  }
  stickToBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
}

async function scrollToBottom(): Promise<void> {
  await nextTick();
  const el = scroller.value;
  if (el) {
    el.scrollTop = el.scrollHeight;
  }
}

watch(
  () => chat.currentMessages.map((m) => m.content.length).join(','),
  () => {
    if (stickToBottom) {
      void scrollToBottom();
    }
  },
);

watch(
  () => chat.currentId,
  async () => {
    stickToBottom = true;
    await scrollToBottom();
    composerRef.value?.focus();
  },
);

async function handleSend(text: string, attachments: Attachment[]): Promise<void> {
  stickToBottom = true;
  await chat.sendMessage(text, attachments);
}

async function handleLogout(): Promise<void> {
  await auth.logout();
  await router.replace('/login');
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}
</script>

<template>
  <div class="app">
    <header class="topbar">
      <div class="left">
        <button class="burger" type="button" aria-label="切换会话列表" @click="sidebarOpen = !sidebarOpen">
          ☰
        </button>
        <span class="mark">AI</span>
        <span class="wordmark">对话平台</span>
        <span v-if="chat.currentConversation" class="conv-title">
          / {{ chat.currentConversation.title }}
        </span>
      </div>
      <div class="right">
        <span class="user">{{ auth.user?.nickname || auth.user?.email }}</span>
        <span class="role">{{ auth.user?.role }}</span>
        <button class="ghost" type="button" @click="handleLogout">退出</button>
      </div>
    </header>

    <div class="body">
      <ConversationSidebar :class="{ 'mobile-open': sidebarOpen }" @click="sidebarOpen = false" />

      <main class="main">
        <div ref="scroller" class="scroller" @scroll="onScroll">
          <div v-if="chat.currentMessages.length === 0 && !chat.loadingMessages" class="welcome">
            <p class="eyebrow">NEW CONVERSATION</p>
            <h1>从这里开始</h1>
            <p class="lead">问一个问题、贴一段代码，或者让它帮你理清思路。</p>
            <p class="hint">当前模型：正文由后端 AI 适配器提供，可随时切换 mock / deepseek。</p>
          </div>

          <template v-else>
            <div class="load-older">
              <button
                v-if="chat.messages[chat.currentId ?? ''] && chat.messages[chat.currentId ?? '']!.length > 0"
                type="button"
                :disabled="chat.loadingMessages"
                @click="chat.loadOlder()"
              >
                {{ chat.loadingMessages ? '加载中…' : '加载更早的消息' }}
              </button>
            </div>

            <div class="messages">
              <div v-for="message in chat.currentMessages" :key="message.id" class="row">
                <MessageBubble :message="message" />
                <time class="stamp">{{ formatTime(message.createdAt) }}</time>
              </div>
            </div>
          </template>
        </div>

        <div v-if="chat.error" class="error" role="alert">
          <span>{{ chat.error }}</span>
          <button type="button" @click="chat.clearError()">知道了</button>
        </div>

        <ChatComposer
          ref="composerRef"
          :streaming="chat.isStreaming"
          :disabled="!chat.currentId"
          @send="handleSend"
          @stop="chat.stopStreaming()"
        />
      </main>
    </div>
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--paper);
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  border-bottom: 1px solid var(--line);
  background: rgba(246, 243, 238, 0.92);
  backdrop-filter: blur(6px);
}

.left,
.right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.burger {
  display: none;
  border: 1px solid var(--line-strong);
  background: transparent;
  border-radius: 7px;
  width: 30px;
  height: 30px;
  cursor: pointer;
}

.mark {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 7px;
  background: var(--ink);
  color: #fff;
  font-size: 10.5px;
  font-weight: 700;
}

.wordmark {
  font-size: 12.5px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ink-soft);
}

.conv-title {
  font-size: 13px;
  color: var(--ink-faint);
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.right {
  font-size: 13px;
  color: var(--ink-soft);
}

.role {
  padding: 2px 8px;
  border: 1px solid var(--line-strong);
  border-radius: 999px;
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: var(--amber-deep);
}

.ghost {
  border: 1px solid var(--line-strong);
  background: transparent;
  border-radius: 8px;
  padding: 5px 11px;
  cursor: pointer;
  color: var(--ink);
}

.body {
  flex: 1;
  display: flex;
  min-height: 0;
}

.main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.scroller {
  flex: 1;
  overflow-y: auto;
  padding: 28px 24px 8px;
}

.welcome {
  max-width: 620px;
  margin: 12vh auto 0;
  text-align: left;
}

.eyebrow {
  margin: 0 0 12px;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.22em;
  color: var(--amber-deep);
}

.welcome h1 {
  margin: 0 0 12px;
  font-size: 30px;
  letter-spacing: -0.01em;
}

.lead {
  margin: 0 0 10px;
  font-size: 15px;
  line-height: 1.7;
  color: var(--ink-soft);
}

.hint {
  font-size: 12.5px;
  color: var(--ink-faint);
}

.load-older {
  display: flex;
  justify-content: center;
  padding: 4px 0 16px;
}

.load-older button {
  border: 1px solid var(--line);
  background: transparent;
  border-radius: 999px;
  padding: 5px 14px;
  font-size: 12px;
  color: var(--ink-soft);
  cursor: pointer;
}

.load-older button:hover:not(:disabled) {
  border-color: var(--ink);
  color: var(--ink);
}

.messages {
  max-width: 820px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding-bottom: 24px;
}

.row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.row:has(.user) {
  align-items: flex-end;
}

.stamp {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--ink-faint);
  padding: 0 4px;
}

.error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  max-width: 820px;
  width: calc(100% - 48px);
  margin: 0 auto 8px;
  padding: 9px 12px;
  border-radius: 9px;
  background: var(--danger-bg);
  color: var(--danger);
  font-size: 13px;
}

.error button {
  border: none;
  background: none;
  color: inherit;
  font-size: 12px;
  text-decoration: underline;
  cursor: pointer;
}

.mobile-open {
  position: fixed;
  z-index: 20;
  top: 51px;
  bottom: 0;
  left: 0;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18);
}

@media (max-width: 880px) {
  .burger {
    display: inline-grid;
    place-items: center;
  }

  .conv-title {
    display: none;
  }

  .scroller {
    padding: 18px 14px 8px;
  }
}
</style>
