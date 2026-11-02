import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { PublicUser } from '@app/contract';
import { authApi } from '../api/auth';
import { refreshSession, type Session } from '../api/http';
import { accessToken } from '../api/token';

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

  async function login(email: string, password: string): Promise<void> {
    applySession(await authApi.login({ email, password }));
  }

  async function logout(): Promise<void> {
    try {
      await authApi.logout();
    } finally {
      clear();
    }
  }

  return { user, bootstrapped, isLoggedIn, isAdmin, bootstrap, login, logout, clear };
});
