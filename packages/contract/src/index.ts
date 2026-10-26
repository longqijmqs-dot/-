/**
 * 契约包入口。
 *
 * 前端 `import { ErrorCode } from '@app/contract'`，
 * 后端 `import { ok, fail } from '@app/contract'`，
 * 两边看到的是同一份定义 —— 改一处，另一侧立刻在类型检查时报错。
 */
export * from './error-codes';
export * from './envelope';
export * from './pagination';
export * from './auth';

/**
 * SSE 事件命名空间（占位）。
 * 本变更不实现，等 chat-stream 变更时在这里补 DeltaEvent / DoneEvent / ErrorEvent
 * 的 zod schema，前端解析器与后端序列化器共用。
 */
