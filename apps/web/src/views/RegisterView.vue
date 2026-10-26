<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { ApiError } from '../api/http';
import AuthShell from '../components/AuthShell.vue';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const router = useRouter();

const email = ref('');
const password = ref('');
const confirm = ref('');
const nickname = ref('');
const loading = ref(false);
const banner = ref('');
const fieldErrors = ref<Record<string, string>>({});

const disabled = computed(
  () =>
    loading.value ||
    email.value.trim() === '' ||
    password.value === '' ||
    confirm.value === '' ||
    Object.keys(fieldErrors.value).length > 0,
);

/** 本地校验：能当场发现的错，不要浪费一次网络请求 */
function validate(): boolean {
  const errors: Record<string, string> = {};

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {
    errors.email = '邮箱格式不正确';
  }
  if (password.value.length < 8) {
    errors.password = '密码至少 8 位';
  } else if (password.value.length > 64) {
    errors.password = '密码最多 64 位';
  }
  if (confirm.value !== password.value) {
    errors.confirm = '两次输入的密码不一致';
  }
  if (nickname.value.trim().length > 64) {
    errors.nickname = '昵称最多 64 字';
  }

  fieldErrors.value = errors;
  return Object.keys(errors).length === 0;
}

async function submit(): Promise<void> {
  banner.value = '';
  if (!validate()) {
    return;
  }

  loading.value = true;
  try {
    await auth.register({
      email: email.value.trim(),
      password: password.value,
      ...(nickname.value.trim() ? { nickname: nickname.value.trim() } : {}),
    });
    // 注册成功后直接登录，少一步操作
    await auth.login({ email: email.value.trim(), password: password.value });
    await router.replace('/chat');
  } catch (error) {
    const apiError = error as ApiError;
    if (apiError.code === 40901) {
      fieldErrors.value = { email: '该邮箱已被注册' };
    } else if (apiError.code === 10001) {
      const data = apiError.data as { errors?: { field: string; message: string }[] } | null;
      const next: Record<string, string> = {};
      for (const item of data?.errors ?? []) {
        next[item.field] = item.message;
      }
      fieldErrors.value = next;
    }
    banner.value = apiError.message || '注册失败，请稍后重试';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <AuthShell title="创建账号" subtitle="需要邮箱与密码，其余都可以之后再补。">
    <form class="auth-form" novalidate @submit.prevent="submit">
      <label class="field">
        <span>邮箱</span>
        <input
          v-model="email"
          type="email"
          autocomplete="email"
          placeholder="you@example.com"
          :aria-invalid="Boolean(fieldErrors.email)"
          @blur="fieldErrors.email && validate()"
        />
        <em v-if="fieldErrors.email">{{ fieldErrors.email }}</em>
      </label>

      <label class="field">
        <span>密码</span>
        <input
          v-model="password"
          type="password"
          autocomplete="new-password"
          placeholder="8–64 位"
          :aria-invalid="Boolean(fieldErrors.password)"
        />
        <em v-if="fieldErrors.password">{{ fieldErrors.password }}</em>
      </label>

      <label class="field">
        <span>确认密码</span>
        <input
          v-model="confirm"
          type="password"
          autocomplete="new-password"
          placeholder="再输一次"
          :aria-invalid="Boolean(fieldErrors.confirm)"
        />
        <em v-if="fieldErrors.confirm">{{ fieldErrors.confirm }}</em>
      </label>

      <label class="field">
        <span>昵称（可选）</span>
        <input v-model="nickname" type="text" autocomplete="nickname" placeholder="怎么称呼你" />
        <em v-if="fieldErrors.nickname">{{ fieldErrors.nickname }}</em>
      </label>

      <p v-if="banner" class="banner" role="alert">{{ banner }}</p>

      <button class="submit" type="submit" :disabled="disabled">
        <span v-if="loading" class="spinner" aria-hidden="true" />
        {{ loading ? '创建中…' : '创建账号' }}
      </button>
    </form>

    <p class="alt">
      已经有账号？
      <RouterLink to="/login">直接登录</RouterLink>
    </p>
  </AuthShell>
</template>
