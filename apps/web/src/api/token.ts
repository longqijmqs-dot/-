import { ref } from 'vue';

/**
 * access token 只存在内存里（Pinia/Vue ref），**绝不写 localStorage**。
 *
 * 为什么不写 localStorage？因为它可以被任意 JS 读到——一旦页面里有一个 XSS，
 * 攻击者就能把 token 捞走。放内存里最差也就是「刷新页面要重新静默续期」，
 * 而这一步用户是无感的（靠 httpOnly Cookie 里的 refresh token 换）。
 */
export const accessToken = ref<string | null>(null);

type Handler = () => void;

let unauthorizedHandler: Handler | null = null;

/** 由 auth store 注册：刷新失败时清理登录态并回登录页 */
export function setUnauthorizedHandler(handler: Handler | null): void {
  unauthorizedHandler = handler;
}

export function notifyUnauthorized(): void {
  unauthorizedHandler?.();
}
