import {
  type Conversation,
  type ConversationDetail,
  type CreateConversationInput,
  createSseParser,
  type CursorResult,
  decodeSseEvent,
  type DeltaEvent,
  type DoneEvent,
  type ErrorEvent,
  type Message,
  type MetaEvent,
  messageFor,
  type SendMessageInput,
  type UpdateConversationInput,
} from '@app/contract';
import { ApiError, http, unwrap } from './http';
import { accessToken } from './token';

export const conversationsApi = {
  create(input: CreateConversationInput = {}): Promise<Conversation> {
    return unwrap<Conversation>(http.post('/conversations', input));
  },

  list(page = 1, pageSize = 50): Promise<{ items: Conversation[]; total: number; hasMore: boolean }> {
    return unwrap(http.get('/conversations', { params: { page, pageSize } }));
  },

  detail(id: string): Promise<ConversationDetail> {
    return unwrap<ConversationDetail>(http.get(`/conversations/${id}`));
  },

  update(id: string, input: UpdateConversationInput): Promise<Conversation> {
    return unwrap<Conversation>(http.patch(`/conversations/${id}`, input));
  },

  remove(id: string): Promise<{ ok: true }> {
    return unwrap<{ ok: true }>(http.delete(`/conversations/${id}`));
  },
};

export const messagesApi = {
  history(conversationId: string, params: { limit?: number; before?: string } = {}): Promise<
    CursorResult<Message>
  > {
    return unwrap<CursorResult<Message>>(http.get(`/conversations/${conversationId}/messages`, { params }));
  },
};

export interface StreamHandlers {
  onMeta?: (event: MetaEvent) => void;
  onDelta?: (event: DeltaEvent) => void;
  onDone?: (event: DoneEvent) => void;
  onError?: (event: ErrorEvent) => void;
}

/**
 * 发送消息并消费 SSE 事件流。
 *
 * 两个实现要点：
 *   1. 解析器用契约包里的 `createSseParser` —— 与后端、与单测是同一份代码，
 *      它已经处理了「事件被 TCP 切成两半」的情况。
 *   2. 不用 axios：axios 的 XHR 适配器拿不到增量流，
 *      必须用 fetch + ReadableStream 才能边收边渲染。
 */
export async function sendMessageStream(
  conversationId: string,
  input: SendMessageInput,
  handlers: StreamHandlers,
  signal: AbortSignal,
  retried = false,
): Promise<void> {
  const response = await fetch(`/api/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(accessToken.value ? { authorization: `Bearer ${accessToken.value}` } : {}),
    },
    body: JSON.stringify(input),
    signal,
  });

  // 业务错误（幂等冲突、越权、限流）走普通 JSON 信封
  if (!response.ok || !response.headers.get('content-type')?.includes('text/event-stream')) {
    const envelope = (await response.json().catch(() => null)) as
      | { code: number; message: string; requestId: string }
      | null;

    // access token 过期时静默续期并重试一次（这条路径绕过了 axios 拦截器）
    if (response.status === 401 && envelope?.code === 20002 && !retried) {
      const { refreshSession } = await import('./http');
      const session = await refreshSession();
      if (session) {
        return sendMessageStream(conversationId, input, handlers, signal, true);
      }
    }

    throw new ApiError(
      envelope?.code ?? 50000,
      messageFor(envelope?.code ?? 50000),
      response.status,
      null,
      envelope?.requestId ?? null,
    );
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new ApiError(50000, '响应流不可读', response.status, null, null);
  }

  const decoder = new TextDecoder();
  const parser = createSseParser();

  const dispatch = (rawChunk: string): void => {
    for (const raw of parser.push(rawChunk)) {
      const event = decodeSseEvent(raw);
      if (!event) {
        continue;
      }
      switch (event.event) {
        case 'meta':
          handlers.onMeta?.(event.data);
          break;
        case 'delta':
          handlers.onDelta?.(event.data);
          break;
        case 'done':
          handlers.onDone?.(event.data);
          break;
        case 'error':
          handlers.onError?.(event.data);
          break;
      }
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      dispatch(decoder.decode(value, { stream: true }));
    }
    // 处理最后一段没有以空行结尾的残留
    for (const raw of parser.flush()) {
      const event = decodeSseEvent(raw);
      if (event?.event === 'done') {
        handlers.onDone?.(event.data);
      } else if (event?.event === 'error') {
        handlers.onError?.(event.data);
      }
    }
  } finally {
    reader.cancel().catch(() => undefined);
  }
}
