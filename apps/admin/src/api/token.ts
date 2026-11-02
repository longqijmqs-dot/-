import { ref } from 'vue';

/** 内存里的 access token，不落 localStorage */
export const accessToken = ref<string | null>(null);

/** 401 时的回调，由 store 注册 */
let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(fn: () => void): void {
  onUnauthorized = fn;
}

export function notifyUnauthorized(): void {
  accessToken.value = null;
  onUnauthorized?.();
}
