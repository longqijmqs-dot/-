import type { Response } from 'express';
import {
  formatSseEvent,
  SSE_HEARTBEAT,
  SSE_HEARTBEAT_MS,
  type ServerEvent,
} from '@app/contract';

export interface SseSession {
  send(event: ServerEvent): void;
  end(): void;
  readonly isClosed: boolean;
}

/**
 * 把 Express 响应切换成 SSE 模式。
 *
 * 四个响应头都不是装饰：
 *   Content-Type: text/event-stream  —— 浏览器/代理据此识别为事件流
 *   Cache-Control: no-cache, no-transform —— 禁止中间层缓存或压缩改写
 *   Connection: keep-alive           —— 保持长连接
 *   X-Accel-Buffering: no            —— 让 Nginx 不要缓冲（不加这个，流会被攒成一坨）
 *
 * 心跳每 15 秒一次，防反代把「长时间没数据的连接」当成空闲连接掐掉。
 */
export function openSse(res: Response): SseSession {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // 长连接场景下禁用响应超时（Node 默认无限，这里显式保证）
  res.setTimeout(0);

  const heartbeat = setInterval(() => {
    if (!res.writableEnded) {
      res.write(SSE_HEARTBEAT);
    }
  }, SSE_HEARTBEAT_MS);

  return {
    send(event: ServerEvent): void {
      if (!res.writableEnded) {
        res.write(formatSseEvent(event));
      }
    },
    end(): void {
      clearInterval(heartbeat);
      if (!res.writableEnded) {
        res.end();
      }
    },
    get isClosed(): boolean {
      return res.writableEnded;
    },
  };
}
