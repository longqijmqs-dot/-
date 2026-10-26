import axios from 'axios';
import { ref } from 'vue';
import {
  ErrorCode,
  type Envelope,
  type PublicUser,
  messageFor,
} from '@app/contract';
import { accessToken, notifyUnauthorized } from './token';

/**
 * 裸客户端：不带任何拦截器。
 * 专门用于 /auth/refresh —— 如果刷新请求自己也走拦截器，
 * 刷新失败时会再次触发刷新，形成死循环。
 */
export const client = axios.create({
  baseURL: '/api',
  withCredentials: true, // 必须：否则 httpOnly Cookie 不会带上
  timeout: 20_000,
});

/** 业务异常：前端只认 code，不解析 message 字符串 */
export class ApiError extends Error {
  constructor(
    readonly code: number,
    message: string,
    readonly status: number,
    readonly data: unknown,
    readonly requestId: string | null,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface Session {
  accessToken: string;
  expiresIn: number;
  user: PublicUser;
}

interface RetriableConfig {
  __retried?: boolean;
  skipAuthRefresh?: boolean;
}

/** 带拦截器的客户端：业务请求都走这个 */
export const http = axios.create({
  baseURL: '/api',
  withCredentials: true,
  timeout: 20_000,
});

http.interceptors.request.use((config) => {
  if (accessToken.value) {
    config.headers.Authorization = `Bearer ${accessToken.value}`;
  }
  return config;
});

/**
 * 单飞刷新（single-flight）。
 *
 * 场景：三个请求同时收到 401，如果不做处理会并发发起三次刷新；
 * 而后端每次刷新都会轮换票据 —— 第一个成功，后两个拿着已作废的票据，
 * 会被判定为「票据复用」并把该用户全部下线。
 *
 * 所以这里保证：任意时刻只有一个刷新在飞，其余请求复用它。
 */
let refreshInFlight: Promise<Session | null> | null = null;

export function refreshSession(): Promise<Session | null> {
  refreshInFlight ??= doRefresh().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

async function doRefresh(): Promise<Session | null> {
  try {
    const response = await client.post<Envelope<Session>>('/auth/refresh');
    const envelope = response.data;
    if (envelope.code !== 0 || !envelope.data) {
      return null;
    }
    accessToken.value = envelope.data.accessToken;
    return envelope.data;
  } catch {
    return null;
  }
}

http.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    const axiosError = error as {
      config?: RetriableConfig & Record<string, unknown>;
      response?: { status: number; data?: Envelope<unknown> };
    };
    const config = axiosError.config;
    const status = axiosError.response?.status;
    const envelope = axiosError.response?.data;
    const code = envelope?.code;

    // 令牌过期 → 静默刷新后重放一次
    if (
      status === 401 &&
      code === ErrorCode.TOKEN_EXPIRED &&
      config &&
      !config.__retried &&
      !config.skipAuthRefresh
    ) {
      config.__retried = true;
      const session = await refreshSession();
      if (session) {
        return http.request(config);
      }
      notifyUnauthorized();
    } else if (
      status === 401 &&
      (code === ErrorCode.REFRESH_INVALID || code === ErrorCode.ACCOUNT_DISABLED)
    ) {
      notifyUnauthorized();
    }

    throw toApiError(axiosError);
  },
);

function toApiError(axiosError: {
  response?: { status: number; data?: Envelope<unknown> };
  message?: string;
}): ApiError {
  const status = axiosError.response?.status ?? 0;
  const envelope = axiosError.response?.data;
  if (envelope) {
    return new ApiError(
      envelope.code,
      messageFor(envelope.code),
      status,
      envelope.data,
      envelope.requestId,
    );
  }
  // 网络层失败（断网、超时、后端没起）
  return new ApiError(ErrorCode.INTERNAL_ERROR, '网络异常，请检查后端是否已启动', status, null, null);
}

/** 解包信封：成功返回 data，失败抛 ApiError */
export async function unwrap<T>(request: Promise<{ data: Envelope<T> }>): Promise<T> {
  const response = await request;
  const envelope = response.data;
  if (envelope.code !== 0) {
    throw new ApiError(
      envelope.code,
      messageFor(envelope.code),
      200,
      envelope.data,
      envelope.requestId,
    );
  }
  return envelope.data as T;
}

/** 记录最近一次错误，供调试面板/提示使用（可选） */
export const lastError = ref<ApiError | null>(null);
