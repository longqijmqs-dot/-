<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { ApiError } from '../api/http';
import AuthShell from '../components/AuthShell.vue';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

const email = ref('');
const password = ref('');
const loading = ref(false);
const banner = ref('');
const fieldErrors = ref<Record<string, string>>({});

const disabled = computed(() => loading.value || email.value.trim() === '' || password.value === '');

async function submit(): Promise<void> {
  banner.value = '';
  fieldErrors.value = {};
  loading.value = true;

  try {
    await auth.login({ email: email.value.trim(), password: password.value });
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/chat';
    await router.replace(redirect);
  } catch (error) {
    const apiError = error as ApiError;
    applyFieldErrors(apiError);
    banner.value = apiError.message || '登录失败，请稍后重试';
  } finally {
    loading.value = false;
  }
}

function applyFieldErrors(error: ApiError): void {
  if (error.code !== 10001) {
    return;
  }
  const data = error.data as { errors?: { field: string; message: string }[] } | null;
  const next: Record<string, string> = {};
  for (const item of data?.errors ?? []) {
    next[item.field] = item.message;
  }
  fieldErrors.value = next;
}
</script>

<template>
  <AuthShell title="欢迎回来" subtitle="用注册邮箱登录，继续之前的对话。">
    <form class="auth-form" novalidate @submit.prevent="submit">
      <label class="field">
        <span>邮箱</span>
        <input
          v-model="email"
          type="email"
          autocomplete="email"
          placeholder="you@example.com"
          :aria-invalid="Boolean(fieldErrors.email)"
        />
        <em v-if="fieldErrors.email">{{ fieldErrors.email }}</em>
      </label>

      <label class="field">
        <span>密码</span>
        <input
          v-model="password"
          type="password"
          autocomplete="current-password"
          placeholder="至少 8 位"
          :aria-invalid="Boolean(fieldErrors.password)"
        />
        <em v-if="fieldErrors.password">{{ fieldErrors.password }}</em>
      </label>

      <p v-if="banner" class="banner" role="alert">{{ banner }}</p>

      <button class="submit" type="submit" :disabled="disabled">
        <span v-if="loading" class="spinner" aria-hidden="true" />
        {{ loading ? '登录中…' : '登录' }}
      </button>
    </form>

    <p class="alt">
      还没有账号？
      <RouterLink to="/register">注册一个</RouterLink>
    </p>
  </AuthShell>
</template>
