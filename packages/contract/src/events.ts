import { z } from 'zod';

/**
 * SSE 事件协议 —— 前后端共同遵守的唯一格式。
 *
 * 线上真实格式长这样（空行分隔事件）：
 *
 *   event: meta
 *   data: {"messageId":"1024","conversationId":"7","model":"deepseek-chat","requestId":"..."}
 *
 *   event: delta
 *   data: {"text":"你"}
 *
 *   event: done
 *   data: {"messageId":"1024","content":"你好","tokenCount":12,"finishReason":"stop"}
 *
 *   : ping        ← 心跳注释行，解析器会自动忽略
 */

export const SSE_EVENT = {
  META: 'meta',
  DELTA: 'delta',
  DONE: 'done',
  ERROR: 'error',
} as const;

export type SseEventName = (typeof SSE_EVENT)[keyof typeof SSE_EVENT];

/** 第一条事件：告诉前端这条回复对应哪条消息，便于先渲染空气泡 */
export const MetaEventSchema = z.object({
  messageId: z.string(),
  conversationId: z.string(),
  model: z.string(),
  requestId: z.string(),
});

export type MetaEvent = z.infer<typeof MetaEventSchema>;

/** 增量文本：只带新增的几个字，不是全文 */
export const DeltaEventSchema = z.object({
  text: z.string(),
});

export type DeltaEvent = z.infer<typeof DeltaEventSchema>;

/**
 * 结束事件：带完整内容。
 * 前端以它为准，而不是靠自己拼接——这样即使中间丢了某个 delta 也能自愈。
 */
export const DoneEventSchema = z.object({
  messageId: z.string(),
  content: z.string(),
  tokenCount: z.number().int().nullable(),
  finishReason: z.string().nullable(),
});

export type DoneEvent = z.infer<typeof DoneEventSchema>;

/** 错误事件：复用统一业务码，前端可直接用 messageFor(code) 展示 */
export const ErrorEventSchema = z.object({
  code: z.number().int(),
  message: z.string(),
  requestId: z.string(),
});

export type ErrorEvent = z.infer<typeof ErrorEventSchema>;

export type ServerEvent =
  | { event: typeof SSE_EVENT.META; data: MetaEvent }
  | { event: typeof SSE_EVENT.DELTA; data: DeltaEvent }
  | { event: typeof SSE_EVENT.DONE; data: DoneEvent }
  | { event: typeof SSE_EVENT.ERROR; data: ErrorEvent };

/** 后端序列化：一个事件 = event 行 + data 行 + 空行 */
export function formatSseEvent(payload: ServerEvent): string {
  return `event: ${payload.event}\ndata: ${JSON.stringify(payload.data)}\n\n`;
}

/** 心跳注释行：SSE 规范里以 ':' 开头的行是注释，任何解析器都会忽略 */
export const SSE_HEARTBEAT = ': ping\n\n';

/** 心跳间隔（毫秒）：必须小于常见反代的空闲超时（Nginx 默认 60s） */
export const SSE_HEARTBEAT_MS = 15_000;

export interface RawSseEvent {
  event: string;
  data: string;
}

/**
 * 流式 SSE 解析器 —— 前后端共用同一份实现。
 *
 * 为什么必须「流式」而不是一次性 split？
 * 因为 TCP 分片不会尊重事件边界：一个事件可能被切成两半，
 * 也可能一次到达两个事件。必须保留残余 buffer 等下一片。
 */
export function createSseParser(): {
  push: (chunk: string) => RawSseEvent[];
  flush: () => RawSseEvent[];
} {
  let buffer = '';

  function parseBlock(block: string): RawSseEvent | null {
    let event = 'message';
    const dataLines: string[] = [];
    for (const rawLine of block.split('\n')) {
      const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
      if (!line || line.startsWith(':')) {
        continue; // 空行与注释行（心跳）都跳过
      }
      if (line.startsWith('event:')) {
        event = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).replace(/^ /, ''));
      }
    }
    if (dataLines.length === 0) {
      return null;
    }
    return { event, data: dataLines.join('\n') };
  }

  return {
    push(chunk: string): RawSseEvent[] {
      buffer += chunk;
      const events: RawSseEvent[] = [];
      // 事件之间用空行分隔；兼容 \n\n 与 \r\n\r\n
      let index = buffer.search(/\r?\n\r?\n/);
      while (index !== -1) {
        const block = buffer.slice(0, index);
        const separator = /\r?\n\r?\n/.exec(buffer.slice(index))?.[0] ?? '\n\n';
        buffer = buffer.slice(index + separator.length);
        const parsed = parseBlock(block);
        if (parsed) {
          events.push(parsed);
        }
        index = buffer.search(/\r?\n\r?\n/);
      }
      return events;
    },

    flush(): RawSseEvent[] {
      const rest = buffer.trim();
      buffer = '';
      if (!rest) {
        return [];
      }
      const parsed = parseBlock(rest);
      return parsed ? [parsed] : [];
    },
  };
}

/** 把原始事件解码成带类型的服务端事件；未知事件名返回 null（便于忽略扩展字段） */
export function decodeSseEvent(raw: RawSseEvent): ServerEvent | null {
  try {
    const json: unknown = JSON.parse(raw.data);
    switch (raw.event) {
      case SSE_EVENT.META:
        return { event: SSE_EVENT.META, data: MetaEventSchema.parse(json) };
      case SSE_EVENT.DELTA:
        return { event: SSE_EVENT.DELTA, data: DeltaEventSchema.parse(json) };
      case SSE_EVENT.DONE:
        return { event: SSE_EVENT.DONE, data: DoneEventSchema.parse(json) };
      case SSE_EVENT.ERROR:
        return { event: SSE_EVENT.ERROR, data: ErrorEventSchema.parse(json) };
      default:
        return null;
    }
  } catch {
    return null;
  }
}
