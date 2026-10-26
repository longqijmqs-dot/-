<script setup lang="ts">
import { nextTick, ref } from 'vue';

const props = defineProps<{ streaming: boolean; disabled: boolean }>();
const emit = defineEmits<{ send: [text: string]; stop: [] }>();

const text = ref('');
const inputRef = ref<HTMLTextAreaElement | null>(null);

function resize(): void {
  const el = inputRef.value;
  if (!el) {
    return;
  }
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
}

function submit(): void {
  const value = text.value.trim();
  if (!value || props.streaming || props.disabled) {
    return;
  }
  emit('send', value);
  text.value = '';
  void nextTick(resize);
}

function onKeydown(event: KeyboardEvent): void {
  // Enter 发送，Shift+Enter 换行（中文输入法组字时不能拦）
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
    <div class="box">
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
