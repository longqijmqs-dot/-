<script setup lang="ts">
import { ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();

const email = ref('');
const password = ref('');
const loading = ref(false);
const error = ref<string | null>(null);

async function handleSubmit(): Promise<void> {
  error.value = null;
  loading.value = true;
  try {
    await auth.login(email.value.trim(), password.value);
    const redirect = (route.query.redirect as string) || '/dashboard';
    router.push(redirect);
  } catch (e) {
    error.value = (e as Error).message || '登录失败，请检查邮箱和密码';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="login-page">
    <div class="login-card">
      <div class="logo">
        <span class="logo-icon">🛡</span>
        <h1>管理后台</h1>
        <p class="subtitle">AI 对话平台</p>
      </div>

      <div v-if="error" class="error" role="alert">
        {{ error }}
        <button type="button" @click="error = null">✕</button>
      </div>

      <form class="form" @submit.prevent="handleSubmit">
        <div class="field">
          <label for="email">邮箱</label>
          <input
            id="email"
            v-model="email"
            type="email"
            placeholder="admin@example.com"
            autocomplete="email"
            required
          />
        </div>

        <div class="field">
          <label for="password">密码</label>
          <input
            id="password"
            v-model="password"
            type="password"
            placeholder="请输入密码"
            autocomplete="current-password"
            required
          />
        </div>

        <button type="submit" class="submit" :disabled="loading">
          {{ loading ? '登录中…' : '登录' }}
        </button>
      </form>

      <div class="footer">
        <a href="/" class="link">← 返回对话平台</a>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: var(--bg);
}

.login-card {
  width: 100%;
  max-width: 400px;
  padding: 40px 32px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 16px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.06);
}

.logo {
  text-align: center;
  margin-bottom: 32px;
}

.logo-icon {
  font-size: 36px;
  display: block;
  margin-bottom: 12px;
}

.logo h1 {
  font-size: 22px;
  font-weight: 700;
  color: var(--text);
  margin-bottom: 4px;
}

.subtitle {
  font-size: 13px;
  color: var(--text-tertiary);
}

.error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  margin-bottom: 16px;
  border: 1px solid rgba(179, 38, 30, 0.3);
  border-left: 3px solid var(--danger);
  border-radius: 8px;
  background: var(--danger-bg);
  color: var(--danger);
  font-size: 13px;
}

.error button {
  border: none;
  background: none;
  color: var(--danger);
  cursor: pointer;
  font-size: 14px;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
}

.field input {
  border: 1px solid var(--border-hover);
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 14px;
  background: var(--bg);
  transition: border-color 0.2s;
}

.field input:focus {
  outline: none;
  border-color: var(--accent);
}

.submit {
  border: none;
  border-radius: 8px;
  padding: 12px;
  font-size: 14px;
  font-weight: 600;
  background: var(--text);
  color: #fff;
  cursor: pointer;
  transition: opacity 0.2s;
}

.submit:hover:not(:disabled) {
  opacity: 0.9;
}

.submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.footer {
  text-align: center;
  margin-top: 24px;
}

.link {
  font-size: 13px;
  color: var(--text-tertiary);
  text-decoration: none;
}

.link:hover {
  color: var(--accent);
}
</style>
