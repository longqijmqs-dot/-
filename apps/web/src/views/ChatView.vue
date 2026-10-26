<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { authApi } from '../api/auth';
import { ApiError } from '../api/http';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const router = useRouter();

const probe = ref<{ ok: boolean; text: string } | null>(null);
const probing = ref(false);

async function verifySession(): Promise<void> {
  probing.value = true;
  probe.value = null;
  try {
    const user = await authApi.me();
    probe.value = { ok: true, text: `GET /auth/me 成功 · ${user.email} · role=${user.role}` };
  } catch (error) {
    const apiError = error as ApiError;
    probe.value = {
      ok: false,
      text: `失败 code=${apiError.code} requestId=${apiError.requestId ?? '-'}`,
    };
  } finally {
    probing.value = false;
  }
}

async function handleLogout(): Promise<void> {
  await auth.logout();
  await router.replace('/login');
}
</script>

<template>
  <div class="page">
    <header class="bar">
      <div class="left">
        <span class="mark">AI</span>
        <span class="wordmark">对话平台</span>
      </div>
      <div class="right">
        <span class="user">{{ auth.user?.nickname || auth.user?.email }}</span>
        <span class="role">{{ auth.user?.role }}</span>
        <button class="ghost" type="button" @click="handleLogout">退出</button>
      </div>
    </header>

    <main class="body">
      <section class="card">
        <p class="eyebrow">SESSION</p>
        <h1>登录态已建立</h1>
        <p class="lead">
          这一步验证的是前后端契约闭环：access token 在内存、refresh token 在 httpOnly Cookie、
          401 会自动静默续期。对话功能属于下一阶段（SSE 流式），这里先留一个自检入口。
        </p>

        <dl class="meta">
          <div>
            <dt>用户</dt>
            <dd>{{ auth.user?.email }}</dd>
          </div>
          <div>
            <dt>角色</dt>
            <dd>{{ auth.user?.role }}</dd>
          </div>
          <div>
            <dt>令牌存放</dt>
            <dd>内存（localStorage 为空）</dd>
          </div>
        </dl>

        <div class="actions">
          <button class="primary" type="button" :disabled="probing" @click="verifySession">
            {{ probing ? '请求中…' : '调用 /auth/me 自检' }}
          </button>
          <p v-if="probe" class="probe" :class="{ bad: !probe.ok }">{{ probe.text }}</p>
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.page {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--paper);
}

.bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 24px;
  border-bottom: 1px solid var(--line);
  background: rgba(246, 243, 238, 0.9);
  backdrop-filter: blur(6px);
}

.left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.mark {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 7px;
  background: var(--ink);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
}

.wordmark {
  font-size: 13px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ink-soft);
}

.right {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
  color: var(--ink-soft);
}

.role {
  padding: 2px 8px;
  border: 1px solid var(--line-strong);
  border-radius: 999px;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--amber-deep);
}

.ghost {
  border: 1px solid var(--line-strong);
  background: transparent;
  border-radius: 8px;
  padding: 6px 12px;
  cursor: pointer;
  color: var(--ink);
}

.ghost:hover {
  border-color: var(--ink);
}

.body {
  flex: 1;
  display: grid;
  place-items: center;
  padding: 48px 24px;
}

.card {
  width: min(620px, 100%);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 36px;
}

.eyebrow {
  margin: 0 0 12px;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.22em;
  color: var(--amber-deep);
}

h1 {
  margin: 0 0 12px;
  font-size: 26px;
  letter-spacing: -0.01em;
}

.lead {
  margin: 0 0 26px;
  font-size: 14px;
  line-height: 1.75;
  color: var(--ink-soft);
}

.meta {
  display: grid;
  gap: 12px;
  margin: 0 0 28px;
  padding: 18px 0 0;
  border-top: 1px solid var(--line);
}

.meta > div {
  display: grid;
  grid-template-columns: 110px 1fr;
  gap: 12px;
  font-size: 13px;
}

.meta dt {
  color: var(--ink-faint);
}

.meta dd {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--ink);
  word-break: break-all;
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.primary {
  align-self: flex-start;
  height: 42px;
  padding: 0 20px;
  border: none;
  border-radius: 9px;
  background: var(--ink);
  color: #fff;
  font-weight: 600;
  cursor: pointer;
}

.primary:disabled {
  background: #b9b3a8;
  cursor: not-allowed;
}

.probe {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 12px;
  color: #2f7a54;
}

.probe.bad {
  color: var(--danger);
}
</style>
