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
  if (!el) {
    return;
  }
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
}

/** 点击回形针按钮 → 触发隐藏的文件选择器 */
function triggerFilePick(): void {
  fileInputRef.value?.click();
}

/** 用户选了文件 → 立刻上传到后端 → 拿到 Attachment 放进预览区 */
async function onFileSelected(event: Event): Promise<void> {
  const target = event.target as HTMLInputElement;
  const files = target.files;
  if (!files || files.length === 0) {
    return;
  }

  // 限制最多 5 个附件（和契约一致）
  const remaining = 5 - attachments.value.length;
  const picked = Array.from(files);
  const toUpload = picked.slice(0, remaining);

  // 收集所有失败原因：原来的写法每次 catch 都覆盖 uploadError，
  // 传 3 个文件全失败时用户只看到最后一个的报错，另外两个静默消失
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
    // 单个文件 10MB 限制（和后端一致，提前拦掉省一次往返）
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

  // 清空 input，否则选同一个文件不会触发 change 事件
  target.value = '';
  uploading.value = false;
  uploadError.value = errors.length > 0 ? errors.join('；') : null;
}

function removeAttachment(index: number): void {
  attachments.value.splice(index, 1);
}

function submit(): void {
  const value = text.value.trim();
  if (!value || props.streaming || props.disabled) {
    return;
  }
  // 把附件一起发给父组件
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
    <!--
      错误提示必须放在 attachments 判断之外！

      踩过的坑：原来这个 div 嵌在 `v-if="attachments.length > 0"` 里面。
      第一个文件就上传失败时 attachments 是空数组，提示框根本不渲染，
      用户看到的是「点了上传完全没反应」，而控制台里明明有 400 错误。
      这类「错误被 UI 吞掉」的 bug 极难排查，务必让失败路径永远可见。
    -->
    <div v-if="uploadError" class="upload-error" role="alert">
      <span>{{ uploadError }}</span>
      <button type="button" class="dismiss" @click="uploadError = null">知道了</button>
    </div>

    <!-- 附件预览区：在输入框上方，有附件时才显示 -->
    <div v-if="attachments.length > 0" class="preview-strip">
      <div v-for="(att, index) in attachments" :key="att.id" class="preview-chip">
        <!-- 图片：显示缩略图 -->
        <img v-if="isImage(att.mimeType)" :src="att.url" :alt="att.name" class="thumb" />
        <!-- 非图片：显示文件图标 + 名称 -->
        <div v-else class="file-icon">📄</div>
        <span class="file-name" :title="att.name">{{ att.name }}</span>
        <span class="file-size">{{ formatFileSize(att.size) }}</span>
        <button type="button" class="remove" @click="removeAttachment(index)" aria-label="移除附件">
          ×
        </button>
      </div>
    </div>

    <div class="box">
      <!--
        隐藏的文件选择器。
        accept 只是「选择框里的默认过滤」，用户仍可切到「所有文件」，
        所以后端白名单才是真正的关卡，两边要保持一致。
      -->
      <input
        ref="fileInputRef"
        type="file"
        class="hidden-file"
        multiple
        accept="image/*,.pdf,.txt,.md,.csv,.json,.js,.ts,.html,.css,.xml,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.7z,.gz"
        @change="onFileSelected"
      />

      <!-- 回形针按钮：触发文件选择 -->
      <button
        type="button"
        class="attach"
        :disabled="uploading || disabled"
        :title="uploading ? '上传中…' : '添加附件（最多 5 个，单个 ≤ 10MB）'"
        @click="triggerFilePick"
      >
        <span v-if="uploading" class="attach-icon spinning" aria-hidden="true">⏳</span>
        <span v-else class="attach-icon" aria-hidden="true">📎</span>
      </button>

      <textarea
        ref="inputRef"
        v-model="text"
        rows="1"
        placeholder="说点什么… （Enter 发送，Shift + Enter 换行）"
        :disabled="disabled"
        @input="resize"
        @keydown="onKeydown"
      />

      <button v-if="streaming" class="stop" type="button" @click="emit('stop')">停止生成</button>
      <button v-else class="send" type="button" :disabled="disabled || !text.trim()" @click="submit">
        发送
      </button>
    </div>

    <p class="tip">回复由 AI 生成，可能存在错误，请自行核实。</p>
  </div>
</template>

<style scoped>
.composer {
  padding: 12px 24px 18px;
  border-top: 1px solid var(--line);
  background: var(--paper);
}

.preview-strip {
  max-width: 820px;
  margin: 0 auto 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.preview-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  font-size: 12px;
  max-width: 200px;
}

.thumb {
  width: 28px;
  height: 28px;
  object-fit: cover;
  border-radius: 5px;
  flex: 0 0 28px;
}

.file-icon {
  font-size: 16px;
  flex: 0 0 20px;
  text-align: center;
}

.file-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ink);
}

.file-size {
  color: var(--ink-faint);
  font-size: 11px;
  flex: 0 0 auto;
}

.remove {
  border: none;
  background: none;
  color: var(--ink-faint);
  cursor: pointer;
  font-size: 16px;
  padding: 0 2px;
  line-height: 1;
}

.remove:hover {
  color: var(--danger);
}

.upload-error {
  max-width: 820px;
  margin: 0 auto 8px;
  padding: 9px 12px;
  border: 1px solid rgba(179, 38, 30, 0.35);
  border-left: 3px solid var(--danger);
  border-radius: 8px;
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

.upload-error .dismiss:hover {
  opacity: 0.7;
}

.box {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  max-width: 820px;
  margin: 0 auto;
  padding: 8px 8px 8px 14px;
  border: 1px solid var(--line-strong);
  border-radius: 14px;
  background: var(--surface);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.box:focus-within {
  border-color: var(--amber);
  box-shadow: 0 0 0 3px rgba(211, 154, 44, 0.14);
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
  border-radius: 8px;
  cursor: pointer;
  display: grid;
  place-items: center;
  font-size: 18px;
  color: var(--ink-soft);
  transition: background 0.12s ease;
}

.attach:hover:not(:disabled) {
  background: rgba(0, 0, 0, 0.05);
}

.attach:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.attach-icon {
  display: inline-block;
}

/* 上传中让沙漏轻微摆动，给用户「正在处理」的反馈 */
.attach-icon.spinning {
  animation: tick 1s ease-in-out infinite;
}

@keyframes tick {
  0%,
  100% {
    opacity: 0.55;
  }
  50% {
    opacity: 1;
  }
}

/* 尊重系统的「减少动态效果」偏好 */
@media (prefers-reduced-motion: reduce) {
  .attach-icon.spinning {
    animation: none;
    opacity: 0.8;
  }
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
  color: var(--ink);
}

textarea::placeholder {
  color: var(--ink-faint);
}

.send,
.stop {
  flex: 0 0 auto;
  height: 36px;
  padding: 0 16px;
  border-radius: 9px;
  border: none;
  font-size: 13.5px;
  font-weight: 600;
  cursor: pointer;
}

.send {
  background: var(--ink);
  color: #fff;
}

.send:disabled {
  background: #b9b3a8;
  cursor: not-allowed;
}

.stop {
  background: transparent;
  border: 1px solid var(--line-strong);
  color: var(--ink);
}

.stop:hover {
  border-color: var(--danger);
  color: var(--danger);
}

.tip {
  max-width: 820px;
  margin: 8px auto 0;
  font-size: 11.5px;
  color: var(--ink-faint);
  text-align: center;
}
</style>
