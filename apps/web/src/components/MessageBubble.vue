<script setup lang="ts">
import { computed } from 'vue';
import type { Attachment, Message } from '@app/contract';
import { renderMarkdown } from '../utils/markdown';
import { isImage, formatFileSize } from '../api/upload';

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

const hasAttachments = computed(() => props.message.attachments && props.message.attachments.length > 0);
</script>

<template>
  <div class="bubble" :class="isAssistant ? 'assistant' : 'user'">
    <div class="meta">
      <span class="who">{{ isAssistant ? (message.model ?? 'AI') : '我' }}</span>
      <span v-if="statusLabel" class="status" :class="message.status">{{ statusLabel }}</span>
      <span v-if="message.tokenCount" class="tokens">{{ message.tokenCount }} tokens</span>
    </div>

    <!-- 附件区：在内容上方显示 -->
    <div v-if="hasAttachments" class="attachments">
      <div v-for="att in message.attachments" :key="att.id" class="attachment">
        <!-- 图片：显示缩略图，点击看大图 -->
        <a v-if="isImage(att.mimeType)" :href="att.url" target="_blank" rel="noopener" class="image-link">
          <img :src="att.url" :alt="att.name" class="image-preview" />
        </a>
        <!-- 非图片：显示文件信息 + 下载链接 -->
        <a v-else :href="att.url" :download="att.name" class="file-link">
          <span class="file-icon" aria-hidden="true">📄</span>
          <span class="file-name">{{ att.name }}</span>
          <span class="file-size">{{ formatFileSize(att.size) }}</span>
        </a>
      </div>
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

.attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}

.attachment {
  border-radius: 10px;
  overflow: hidden;
}

.image-link {
  display: block;
}

.image-preview {
  max-width: 200px;
  max-height: 200px;
  object-fit: cover;
  border-radius: 10px;
  border: 1px solid var(--line);
  transition: transform 0.15s ease;
}

.image-preview:hover {
  transform: scale(1.02);
}

.file-link {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.03);
  text-decoration: none;
  color: var(--ink);
  font-size: 13px;
  transition: background 0.12s ease;
}

.file-link:hover {
  background: rgba(0, 0, 0, 0.06);
}

/**
 * 用户气泡是深色底（#1b1f25），上面的附件卡片必须整套换成浅色文字 + 半透明白底。
 * 少了这几条，文件名会是「近黑字贴深底」——渲染出来了但肉眼看不见。
 */
.user .file-link {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.22);
  color: #f3efe7;
}

.user .file-link:hover {
  background: rgba(255, 255, 255, 0.18);
}

.user .file-size {
  color: rgba(243, 239, 231, 0.6);
}

/* 深色气泡里的图片附件，边框也要换成浅色才看得清 */
.user .image-preview {
  border-color: rgba(255, 255, 255, 0.22);
}

.file-icon {
  font-size: 18px;
  line-height: 1;
  flex: 0 0 auto;
}

.file-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 160px;
}

.file-size {
  color: var(--ink-faint);
  font-size: 11px;
  flex: 0 0 auto;
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
