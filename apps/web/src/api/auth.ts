import type { LoginInput, PublicUser, RegisterInput } from '@app/contract';
import { http, type Session, unwrap } from './http';

/**
 * 认证接口。
 * 注意：refresh 不在这里 —— 它由 http.ts 的 refreshSession() 负责，
 * 因为那里要保证「单飞」，不能让业务代码绕过。
 */
export const authApi = {
  login(input: LoginInput): Promise<Session> {
    return unwrap<Session>(http.post('/auth/login', input, { skipAuthRefresh: true }));
  },

  register(input: RegisterInput): Promise<PublicUser> {
    return unwrap<PublicUser>(http.post('/auth/register', input, { skipAuthRefresh: true }));
  },

  logout(): Promise<{ ok: true }> {
    return unwrap<{ ok: true }>(http.post('/auth/logout', undefined, { skipAuthRefresh: true }));
  },

  me(): Promise<PublicUser> {
    return unwrap<PublicUser>(http.get('/auth/me'));
  },
};
