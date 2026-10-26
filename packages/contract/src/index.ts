/**
 * 契约包入口。
 *
 * 前端 `import { ErrorCode } from '@app/contract'`，
 * 后端 `import { ok, fail } from '@app/contract'`，
 * 两边看到的是同一份定义 —— 改一处，另一侧立刻在类型检查时报错。
 */
// 注意：这里的相对导入必须带 .js 扩展名。
// TypeScript 会把它映射到 .ts 源码编译；产出的 ESM 里保留 .js，
// 这样 Node 的 ESM 解析器（比 Vite 严格）才能找到文件。
export * from './error-codes.js';
export * from './envelope.js';
export * from './pagination.js';
export * from './auth.js';

/**
 * SSE 事件命名空间（占位）。
 * 本变更不实现，等 chat-stream 变更时在这里补 DeltaEvent / DoneEvent / ErrorEvent
 * 的 zod schema，前端解析器与后端序列化器共用。
 */
