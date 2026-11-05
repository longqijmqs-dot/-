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

let stickToBottom = true;
function onScroll(): void {
  const el = scroller.value;
  if (!el) return;
  stickToBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
}

async function scrollToBottom(): Promise<void> {
  await nextTick();
  const el = scroller.value;
  if (el) el.scrollTop = el.scrollHeight;
}

watch(
  () => chat.currentMessages.map((m) => m.content.length).join(','),
  () => {
    if (stickToBottom) void scrollToBottom();
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
    <!-- 极简顶栏——没有边框，没有模糊背景 -->
    <header class="topbar">
      <div class="left">
        <button class="burger" type="button" aria-label="切换会话列表" @click="sidebarOpen = !sidebarOpen">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <span class="wordmark">AI 对话</span>
      </div>
      <div class="right">
        <span class="user">{{ auth.user?.nickname || auth.user?.email }}</span>
        <button class="ghost" type="button" @click="handleLogout">退出</button>
      </div>
    </header>

    <div class="body">
      <ConversationSidebar :class="{ 'mobile-open': sidebarOpen }" @click="sidebarOpen = false" />

      <main class="main">
        <div ref="scroller" class="scroller" @scroll="onScroll">
          <!-- 空状态——左对齐，像 ChatGPT 一样简洁 -->
          <div v-if="chat.currentMessages.length === 0 && !chat.loadingMessages" class="welcome">
            <h1>有什么可以帮你的？</h1>
            <p class="lead">直接在下方输入框开始对话。</p>
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
  background: var(--bg);
}

/* 顶栏——极简，无边框无模糊 */
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--topbar-height);
  padding: 0 16px;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
}

.left,
.right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.burger {
  display: none;
  border: none;
  background: transparent;
  border-radius: var(--radius-sm);
  width: 36px;
  height: 36px;
  cursor: pointer;
  color: var(--text-secondary);
  align-items: center;
  justify-content: center;
}

.burger:hover {
  background: var(--bg-hover);
}

.wordmark {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
}

.right {
  font-size: 13px;
  color: var(--text-secondary);
}

.ghost {
  border: none;
  background: transparent;
  border-radius: var(--radius-sm);
  padding: 6px 12px;
  cursor: pointer;
  color: var(--text-secondary);
  font-size: 13px;
}

.ghost:hover {
  background: var(--bg-hover);
  color: var(--text);
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
  padding: 24px 0 8px;
}

/* 欢迎页——左对齐，干净 */
.welcome {
  max-width: 700px;
  margin: 0 auto;
  padding: 0 32px;
  padding-top: 15vh;
}

.welcome h1 {
  margin: 0 0 12px;
  font-size: 28px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--text);
}

.lead {
  margin: 0;
  font-size: 15px;
  color: var(--text-secondary);
  line-height: 1.6;
}

.load-older {
  display: flex;
  justify-content: center;
  padding: 4px 0 20px;
}

.load-older button {
  border: none;
  background: transparent;
  border-radius: var(--radius-sm);
  padding: 6px 16px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
}

.load-older button:hover:not(:disabled) {
  background: var(--bg-hover);
  color: var(--text);
}

.messages {
  max-width: 750px;
  margin: 0 auto;
  padding: 0 32px;
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding-bottom: 24px;
}

.row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.row.user-row {
  align-items: flex-end;
}

.stamp {
  font-size: 11px;
  color: var(--text-tertiary);
  padding: 0 4px;
}

.error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  max-width: 750px;
  width: calc(100% - 64px);
  margin: 0 auto 8px;
  padding: 10px 14px;
  border-radius: var(--radius);
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
  white-space: nowrap;
}

.mobile-open {
  position: fixed;
  z-index: 20;
  top: var(--topbar-height);
  bottom: 0;
  left: 0;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12);
}

@media (max-width: 880px) {
  .burger {
    display: flex;
  }

  .scroller {
    padding: 16px 0 8px;
  }

  .messages {
    padding: 0 16px;
  }

  .welcome {
    padding: 0 16px;
    padding-top: 10vh;
  }

  .welcome h1 {
    font-size: 22px;
  }
}
</style>
