<script setup lang="ts">
import { ref } from 'vue';
import type { Conversation } from '@app/contract';
import { useChatStore } from '../stores/chat';

const chat = useChatStore();

const editingId = ref<string | null>(null);
const editingTitle = ref('');
const creating = ref(false);

async function handleCreate(): Promise<void> {
  if (creating.value) {
    return;
  }
  creating.value = true;
  try {
    await chat.createConversation();
  } finally {
    creating.value = false;
  }
}

function startRename(conversation: Conversation): void {
  editingId.value = conversation.id;
  editingTitle.value = conversation.title;
}

async function commitRename(): Promise<void> {
  const id = editingId.value;
  const title = editingTitle.value.trim();
  editingId.value = null;
  if (!id || !title) {
    return;
  }
  await chat.renameConversation(id, title);
}

async function handleArchive(conversation: Conversation): Promise<void> {
  await chat.archiveConversation(conversation.id);
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return sameDay
    ? `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
    : `${date.getMonth() + 1}/${date.getDate()}`;
}
</script>

<template>
  <aside class="sidebar">
    <div class="head">
      <span class="label">会话</span>
      <button class="new" type="button" :disabled="creating" @click="handleCreate">
        <span aria-hidden="true">＋</span>
        {{ creating ? '创建中' : '新对话' }}
      </button>
    </div>

    <div v-if="chat.loadingConversations" class="hint">加载中…</div>

    <div v-else-if="chat.conversations.length === 0" class="empty">
      <p>还没有会话</p>
      <p class="sub">点「新对话」开始第一段对话</p>
    </div>

    <ul v-else class="list">
      <li
        v-for="conversation in chat.conversations"
        :key="conversation.id"
        :class="{ active: conversation.id === chat.currentId }"
        @click="chat.selectConversation(conversation.id)"
      >
        <div class="row">
          <input
            v-if="editingId === conversation.id"
            v-model="editingTitle"
            class="rename"
            type="text"
            @keydown.enter.prevent="commitRename"
            @keydown.esc.prevent="editingId = null"
            @blur="commitRename"
            @click.stop
          />
          <span v-else class="title">{{ conversation.title }}</span>
          <span class="time">{{ formatTime(conversation.updatedAt) }}</span>
        </div>
        <div class="actions">
          <button type="button" title="重命名" @click.stop="startRename(conversation)">重命名</button>
          <button type="button" title="归档" @click.stop="handleArchive(conversation)">归档</button>
        </div>
      </li>
    </ul>
  </aside>
</template>

<style scoped>
.sidebar {
  display: flex;
  flex-direction: column;
  width: 274px;
  flex: 0 0 274px;
  border-right: 1px solid var(--line);
  background: var(--paper-2);
  min-height: 0;
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 16px 12px;
}

.label {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.2em;
  color: var(--ink-faint);
}

.new {
  border: 1px solid var(--line-strong);
  background: var(--surface);
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 12px;
  cursor: pointer;
  color: var(--ink);
}

.new:hover:not(:disabled) {
  border-color: var(--ink);
}

.new:disabled {
  opacity: 0.6;
  cursor: progress;
}

.hint,
.empty {
  padding: 24px 16px;
  font-size: 13px;
  color: var(--ink-faint);
  text-align: center;
}

.empty p {
  margin: 0 0 6px;
}

.empty .sub {
  font-size: 12px;
  color: var(--ink-faint);
}

.list {
  list-style: none;
  margin: 0;
  padding: 0 8px 16px;
  overflow-y: auto;
  flex: 1;
}

.list li {
  padding: 10px 10px 8px;
  border-radius: 9px;
  cursor: pointer;
  border: 1px solid transparent;
}

.list li:hover {
  background: rgba(255, 255, 255, 0.6);
}

.list li.active {
  background: var(--surface);
  border-color: var(--line-strong);
}

.row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.title {
  font-size: 13.5px;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.time {
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: var(--ink-faint);
  flex: 0 0 auto;
}

.rename {
  width: 100%;
  font-size: 13px;
  padding: 3px 6px;
  border: 1px solid var(--amber);
  border-radius: 6px;
  background: #fff;
}

.actions {
  display: flex;
  gap: 10px;
  margin-top: 6px;
  opacity: 0;
  transition: opacity 0.12s ease;
}

.list li:hover .actions,
.list li.active .actions {
  opacity: 1;
}

.actions button {
  border: none;
  background: none;
  padding: 0;
  font-size: 11.5px;
  color: var(--ink-faint);
  cursor: pointer;
}

.actions button:hover {
  color: var(--amber-deep);
}
</style>
