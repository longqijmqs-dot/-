<script setup lang="ts">
import { computed } from 'vue';
import type { Message } from '@app/contract';
import { renderMarkdown } from '../utils/markdown';

const props = defineProps<{ message: Message }>();

const isAssistant = computed(() => props.message.role === 'assistant');
const rendered = computed(() => renderMarkdown(props.message.content));
const showTyping = computed(
  () => props.message.status === 'streaming' && props.message.content.length === 0,
);
const statusLabel = computed(() => {
  switch (props.message.status) {
    case 'interrupted':
      return '已中断';
    case 'failed':
      return '生成失败';
    case 'streaming':
      return '生成中';
    default:
      return '';
  }
});
</script>

<template>
  <div class="bubble" :class="isAssistant ? 'assistant' : 'user'">
    <div class="meta">
      <span class="who">{{ isAssistant ? (message.model ?? 'AI') : '我' }}</span>
      <span v-if="statusLabel" class="status" :class="message.status">{{ statusLabel }}</span>
      <span v-if="message.tokenCount" class="tokens">{{ message.tokenCount }} tokens</span>
    </div>

    <div v-if="showTyping" class="typing" aria-label="正在生成">
      <span /><span /><span />
    </div>

    <!-- 内容已整体转义后再渲染，不存在注入风险 -->
    <div v-else class="content" v-html="rendered.html" />

    <div v-if="message.status === 'streaming' && message.content" class="caret" aria-hidden="true" />
  </div>
</template>

<style scoped>
.bubble {
  max-width: 720px;
  padding: 14px 16px;
  border-radius: 14px;
  font-size: 14.5px;
  line-height: 1.75;
  word-break: break-word;
}

.bubble.assistant {
  background: var(--surface);
  border: 1px solid var(--line);
}

.bubble.user {
  background: #1b1f25;
  color: #f3efe7;
  border: 1px solid #1b1f25;
  margin-left: auto;
}

.meta {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
  font-family: var(--font-mono);
  font-size: 10.5px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-faint);
}

.user .meta {
  color: rgba(243, 239, 231, 0.55);
}

.status.interrupted {
  color: var(--amber-deep);
}

.status.failed {
  color: var(--danger);
}

.status.streaming {
  color: var(--amber-deep);
}

.tokens {
  opacity: 0.75;
}

.content :deep(pre.md-code) {
  margin: 10px 0;
  padding: 12px 14px;
  border-radius: 10px;
  background: #12151a;
  color: #e6e1d6;
  font-family: var(--font-mono);
  font-size: 12.5px;
  line-height: 1.6;
  overflow-x: auto;
}

.content :deep(pre.md-code[data-streaming='true']) {
  border-left: 2px solid var(--amber);
}

.content :deep(code) {
  font-family: var(--font-mono);
  font-size: 0.92em;
  background: rgba(20, 22, 26, 0.07);
  padding: 1px 5px;
  border-radius: 5px;
}

.user .content :deep(code) {
  background: rgba(255, 255, 255, 0.14);
}

.content :deep(a) {
  color: var(--amber-deep);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.user .content :deep(a) {
  color: #f0c674;
}

.typing {
  display: inline-flex;
  gap: 5px;
  padding: 4px 0;
}

.typing span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ink-faint);
  animation: blink 1.2s infinite ease-in-out;
}

.typing span:nth-child(2) {
  animation-delay: 0.18s;
}

.typing span:nth-child(3) {
  animation-delay: 0.36s;
}

@keyframes blink {
  0%,
  80%,
  100% {
    opacity: 0.25;
    transform: translateY(0);
  }
  40% {
    opacity: 1;
    transform: translateY(-2px);
  }
}

.caret {
  width: 7px;
  height: 15px;
  margin-top: 4px;
  background: var(--amber-deep);
  animation: caret 1s steps(2, start) infinite;
}

@keyframes caret {
  to {
    visibility: hidden;
  }
}
</style>
