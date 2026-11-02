import axios from 'axios';
import { ref } from 'vue';
import {
  ErrorCode,
  type Envelope,
  type PublicUser,
  messageFor,
} from '@app/contract';
import { accessToken, notifyUnauthorized } from './token';

export const client = axios.create({
  baseURL: '/api',
  withCredentials: true,
  timeout: 20_000,
});

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
        return http.request(config as any);
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
  return new ApiError(ErrorCode.INTERNAL_ERROR, '网络异常，请检查后端是否已启动', status, null, null);
}

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

export const lastError = ref<ApiError | null>(null);
