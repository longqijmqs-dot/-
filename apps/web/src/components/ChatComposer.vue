<script setup lang="ts">
import { nextTick, ref } from 'vue';
import type { Attachment } from '@app/contract';
import { uploadFile, isImage, formatFileSize } from '../api/upload';

const props = defineProps<{ streaming: boolean; disabled: boolean }>();
const emit = defineEmits<{ send: [text: string, attachments: Attachment[]]; stop: [] }>();

const text = ref('');
const inputRef = ref<HTMLTextAreaElement | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);
const attachments = ref<Attachment[]>([]);
const uploading = ref(false);
const uploadError = ref<string | null>(null);

function resize(): void {
  const el = inputRef.value;
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
}

function triggerFilePick(): void {
  fileInputRef.value?.click();
}

async function onFileSelected(event: Event): Promise<void> {
  const target = event.target as HTMLInputElement;
  const files = target.files;
  if (!files || files.length === 0) return;

  const remaining = 5 - attachments.value.length;
  const picked = Array.from(files);
  const toUpload = picked.slice(0, remaining);

  const errors: string[] = [];

  if (picked.length > remaining) {
    errors.push(`最多 5 个附件，已忽略超出的 ${picked.length - remaining} 个`);
  }
  if (toUpload.length === 0) {
    uploadError.value = errors.join('；');
    target.value = '';
    return;
  }

  uploading.value = true;
  uploadError.value = null;

  for (const file of toUpload) {
    if (file.size > 10 * 1024 * 1024) {
      errors.push(`${file.name}：超过 10MB 上限（${formatFileSize(file.size)}）`);
      continue;
    }
    try {
      const attachment = await uploadFile(file);
      attachments.value.push(attachment);
    } catch (err) {
      errors.push(`${file.name}：${(err as Error).message}`);
    }
  }

  target.value = '';
  uploading.value = false;
  uploadError.value = errors.length > 0 ? errors.join('；') : null;
}

function removeAttachment(index: number): void {
  attachments.value.splice(index, 1);
}

function submit(): void {
  const value = text.value.trim();
  if (!value || props.streaming || props.disabled) return;
  emit('send', value, [...attachments.value]);
  text.value = '';
  attachments.value = [];
  uploadError.value = null;
  void nextTick(resize);
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    submit();
  }
}

defineExpose({
  focus: (): void => inputRef.value?.focus(),
});
</script>

<template>
  <div class="composer">
    <div v-if="uploadError" class="upload-error" role="alert">
      <span>{{ uploadError }}</span>
      <button type="button" class="dismiss" @click="uploadError = null">知道了</button>
    </div>

    <div v-if="attachments.length > 0" class="preview-strip">
      <div v-for="(att, index) in attachments" :key="att.id" class="preview-chip">
        <img v-if="isImage(att.mimeType)" :src="att.url" :alt="att.name" class="thumb" />
        <div v-else class="file-name-only">{{ att.name }}</div>
        <button type="button" class="remove" @click="removeAttachment(index)" aria-label="移除附件">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>

    <div class="box">
      <input
        ref="fileInputRef"
        type="file"
        class="hidden-file"
        multiple
        accept="image/*,.pdf,.txt,.md,.csv,.json,.js,.ts,.html,.css,.xml,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.7z,.gz"
        @change="onFileSelected"
      />

      <!-- 附件按钮——极简图标 -->
      <button
        type="button"
        class="attach"
        :disabled="uploading || disabled"
        title="添加附件"
        @click="triggerFilePick"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
        </svg>
      </button>

      <textarea
        ref="inputRef"
        v-model="text"
        rows="1"
        placeholder="给 AI 发消息…"
        :disabled="disabled"
        @input="resize"
        @keydown="onKeydown"
      />

      <button v-if="streaming" class="stop" type="button" @click="emit('stop')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
        <span>停止</span>
      </button>
      <button v-else class="send" type="button" :disabled="disabled || !text.trim()" @click="submit">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.composer {
  padding: 12px 24px 16px;
  background: var(--bg);
}

.preview-strip {
  max-width: 750px;
  margin: 0 auto 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.preview-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg);
  font-size: 12px;
  max-width: 200px;
}

.thumb {
  width: 24px;
  height: 24px;
  object-fit: cover;
  border-radius: 4px;
  flex: 0 0 24px;
}

.file-name-only {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text);
}

.remove {
  border: none;
  background: none;
  color: var(--text-tertiary);
  cursor: pointer;
  padding: 2px;
  display: flex;
  align-items: center;
}

.remove:hover {
  color: var(--text);
}

.upload-error {
  max-width: 750px;
  margin: 0 auto 8px;
  padding: 8px 12px;
  border: 1px solid rgba(220, 38, 38, 0.2);
  border-left: 3px solid var(--danger);
  border-radius: var(--radius-sm);
  background: var(--danger-bg);
  color: var(--danger);
  font-size: 12.5px;
  line-height: 1.5;
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.upload-error span {
  flex: 1;
  word-break: break-word;
}

.upload-error .dismiss {
  flex: 0 0 auto;
  border: none;
  background: none;
  color: var(--danger);
  font-size: 12px;
  cursor: pointer;
  padding: 0;
  text-decoration: underline;
  text-underline-offset: 2px;
}

/* 输入框——ChatGPT 风格的圆角容器 */
.box {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  max-width: 750px;
  margin: 0 auto;
  padding: 8px 8px 8px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--bg-input);
  transition: border-color 0.15s ease;
}

.box:focus-within {
  border-color: var(--text-tertiary);
}

.hidden-file {
  display: none;
}

.attach {
  flex: 0 0 auto;
  width: 36px;
  height: 36px;
  border: none;
  background: transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  transition: background 0.12s ease;
}

.attach:hover:not(:disabled) {
  background: var(--bg-hover);
  color: var(--text);
}

.attach:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

textarea {
  flex: 1;
  border: none;
  outline: none;
  resize: none;
  background: transparent;
  font-size: 14.5px;
  line-height: 1.65;
  max-height: 200px;
  padding: 6px 0;
  color: var(--text);
}

textarea::placeholder {
  color: var(--text-tertiary);
}

/* 发送按钮——圆形图标按钮，不像 AI 那样用胶囊文字按钮 */
.send,
.stop {
  flex: 0 0 auto;
  width: 36px;
  height: 36px;
  border-radius: var(--radius);
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: opacity 0.12s ease, background 0.12s ease;
}

.send {
  background: var(--text);
  color: #fff;
}

.send:hover:not(:disabled) {
  opacity: 0.85;
}

.send:disabled {
  background: var(--border);
  color: var(--text-tertiary);
  cursor: not-allowed;
}

.stop {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-secondary);
  gap: 4px;
  width: auto;
  padding: 0 14px;
}

.stop:hover {
  border-color: var(--danger);
  color: var(--danger);
}
</style>
