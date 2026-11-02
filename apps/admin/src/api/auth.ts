import { unwrap, http } from './http';
import type { LoginInput, LoginResult, RegisterInput } from '@app/contract';

export const authApi = {
  login(input: LoginInput): Promise<LoginResult> {
    return unwrap<LoginResult>(http.post('/auth/login', input));
  },

  register(input: RegisterInput): Promise<LoginResult> {
    return unwrap<LoginResult>(http.post('/auth/register', input));
  },

  logout(): Promise<void> {
    return unwrap<void>(http.post('/auth/logout'));
  },

  me(): Promise<LoginResult> {
    return unwrap<LoginResult>(http.get('/auth/me'));
  },
};
