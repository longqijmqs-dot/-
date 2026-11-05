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
const hasAttachments = computed(() => props.message.attachments && props.message.attachments.length > 0);
</script>

<template>
  <div class="msg" :class="isAssistant ? 'assistant' : 'user'">
    <!-- 附件区 -->
    <div v-if="hasAttachments" class="attachments">
      <div v-for="att in message.attachments" :key="att.id" class="attachment">
        <a v-if="isImage(att.mimeType)" :href="att.url" target="_blank" rel="noopener" class="image-link">
          <img :src="att.url" :alt="att.name" class="image-preview" />
        </a>
        <a v-else :href="att.url" :download="att.name" class="file-link">
          <span class="file-name">{{ att.name }}</span>
          <span class="file-size">{{ formatFileSize(att.size) }}</span>
        </a>
      </div>
    </div>

    <!-- 正在生成 -->
    <div v-if="showTyping" class="typing" aria-label="正在生成">
      <span /><span /><span />
    </div>

    <!-- 消息内容 -->
    <div v-else class="content" v-html="rendered.html" />

    <!-- 流式光标 -->
    <div v-if="message.status === 'streaming' && message.content" class="caret" aria-hidden="true" />
  </div>
</template>

<style scoped>
/* 消息容器——平铺，没有气泡边框 */
.msg {
  font-size: 14.5px;
  line-height: 1.75;
  word-break: break-word;
}

.msg.assistant {
  /* ChatGPT 风格：直接平铺，没有背景没有边框 */
}

.msg.user {
  /* 用户消息：浅灰背景，圆角，靠右 */
  background: var(--bg-user-msg);
  border-radius: var(--radius);
  padding: 10px 16px;
  display: inline-block;
  max-width: 100%;
}

/* 附件 */
.attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}

.attachment {
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.image-link {
  display: block;
}

.image-preview {
  max-width: 200px;
  max-height: 200px;
  object-fit: cover;
  border-radius: var(--radius-sm);
}

.file-link {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg);
  text-decoration: none;
  color: var(--text);
  font-size: 13px;
  transition: background 0.12s ease;
}

.file-link:hover {
  background: var(--bg-hover);
}

/* 用户消息里的附件也要适配深色背景 */
.user .file-link {
  background: rgba(255, 255, 255, 0.6);
  border-color: rgba(0, 0, 0, 0.08);
}

.user .image-preview {
  border-radius: var(--radius-sm);
}

.file-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 160px;
}

.file-size {
  color: var(--text-tertiary);
  font-size: 11px;
  flex: 0 0 auto;
}

/* 代码块 */
.content :deep(pre.md-code) {
  margin: 10px 0;
  padding: 12px 14px;
  border-radius: var(--radius);
  background: var(--bg-code);
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.6;
  overflow-x: auto;
  border: 1px solid var(--border);
}

.content :deep(code) {
  font-family: var(--font-mono);
  font-size: 0.9em;
  background: var(--bg-code);
  padding: 1px 5px;
  border-radius: 4px;
}

.content :deep(a) {
  color: var(--accent);
  text-decoration: underline;
  text-underline-offset: 2px;
}

/* 正在生成动画 */
.typing {
  display: inline-flex;
  gap: 5px;
  padding: 4px 0;
}

.typing span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-tertiary);
  animation: blink 1.2s infinite ease-in-out;
}

.typing span:nth-child(2) {
  animation-delay: 0.18s;
}

.typing span:nth-child(3) {
  animation-delay: 0.36s;
}

@keyframes blink {
  0%, 80%, 100% { opacity: 0.25; transform: translateY(0); }
  40% { opacity: 1; transform: translateY(-2px); }
}

/* 流式光标 */
.caret {
  display: inline-block;
  width: 2px;
  height: 16px;
  margin-left: 2px;
  vertical-align: text-bottom;
  background: var(--text);
  animation: caret 1s steps(2, start) infinite;
}

@keyframes caret {
  to { visibility: hidden; }
}
</style>
