<script setup lang="ts">
import { ref } from 'vue';
import type { Conversation } from '@app/contract';
import { useChatStore } from '../stores/chat';

const chat = useChatStore();

const editingId = ref<string | null>(null);
const editingTitle = ref('');
const creating = ref(false);

async function handleCreate(): Promise<void> {
  if (creating.value) return;
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
  if (!id || !title) return;
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
      <button class="new" type="button" :disabled="creating" @click="handleCreate">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        <span>新对话</span>
      </button>
    </div>

    <div v-if="chat.loadingConversations" class="hint">加载中…</div>

    <div v-else-if="chat.conversations.length === 0" class="empty">
      还没有对话
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
        </div>
        <div class="time">{{ formatTime(conversation.updatedAt) }}</div>
      </li>
    </ul>
  </aside>
</template>

<style scoped>
.sidebar {
  display: flex;
  flex-direction: column;
  width: var(--sidebar-width);
  flex: 0 0 var(--sidebar-width);
  background: var(--bg-sidebar);
  border-right: 1px solid var(--border);
  min-height: 0;
}

.head {
  padding: 12px 12px;
}

/* 新建对话按钮——ChatGPT 风格，边框按钮 */
.new {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border);
  background: var(--bg);
  border-radius: var(--radius);
  font-size: 13px;
  cursor: pointer;
  color: var(--text);
  transition: border-color 0.12s ease;
}

.new:hover:not(:disabled) {
  border-color: var(--border-hover);
}

.new:disabled {
  opacity: 0.6;
  cursor: progress;
}

.hint,
.empty {
  padding: 20px 16px;
  font-size: 13px;
  color: var(--text-tertiary);
  text-align: center;
}

.list {
  list-style: none;
  margin: 0;
  padding: 4px 8px 12px;
  overflow-y: auto;
  flex: 1;
}

.list li {
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background 0.1s ease;
}

.list li:hover {
  background: var(--bg-hover);
}

.list li.active {
  background: var(--bg-active);
}

.row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.title {
  font-size: 13.5px;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.time {
  font-size: 11px;
  color: var(--text-tertiary);
  flex: 0 0 auto;
}

.rename {
  width: 100%;
  font-size: 13px;
  padding: 3px 6px;
  border: 1px solid var(--accent);
  border-radius: var(--radius-sm);
  background: var(--bg);
  outline: none;
}
</style>
