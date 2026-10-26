import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { LoginInput, PublicUser, RegisterInput } from '@app/contract';
import { authApi } from '../api/auth';
import { refreshSession, type Session } from '../api/http';
import { accessToken } from '../api/token';

/**
 * 认证状态。
 *
 * 三个字段就够了：
 *   user        当前用户（null = 未登录）
 *   accessToken 在 token.ts 里（内存），不落本地存储
 *   bootstrapped 是否已尝试过「页面刷新后静默恢复」，防止重复请求
 */
export const useAuthStore = defineStore('auth', () => {
  const user = ref<PublicUser | null>(null);
  const bootstrapped = ref(false);

  const isLoggedIn = computed(() => accessToken.value !== null && user.value !== null);
  const isAdmin = computed(() => user.value?.role === 'admin');

  function applySession(session: Session): void {
    accessToken.value = session.accessToken;
    user.value = session.user;
  }

  function clear(): void {
    accessToken.value = null;
    user.value = null;
  }

  /**
   * 页面刷新后恢复登录态：
   * 内存里的 token 没了，但 httpOnly Cookie 还在 → 换一个新的 access token。
   * 失败（Cookie 过期/被吊销）就保持未登录，页面照常显示。
   */
  async function bootstrap(): Promise<void> {
    if (bootstrapped.value) {
      return;
    }
    bootstrapped.value = true;
    const session = await refreshSession();
    if (session) {
      applySession(session);
    }
  }

  async function login(input: LoginInput): Promise<void> {
    applySession(await authApi.login(input));
  }

  async function register(input: RegisterInput): Promise<void> {
    await authApi.register(input);
  }

  async function logout(): Promise<void> {
    try {
      await authApi.logout();
    } finally {
      // 无论后端是否成功，本地必须清空，否则用户会被"卡"在登录态
      clear();
    }
  }

  return { user, bootstrapped, isLoggedIn, isAdmin, bootstrap, login, register, logout, clear };
});
