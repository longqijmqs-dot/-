import { z } from 'zod';
import { ERROR_MESSAGES, ErrorCode, messageFor } from './error-codes.js';

/**
 * 统一响应信封 —— 所有 JSON 接口的响应都长这个样子。
 *
 *   { code, message, data, requestId }
 *
 * code = 0 表示成功，data 装业务数据；失败时 data 为 null。
 * requestId 是这次请求的「快递单号」：用户截图报错时，拿它去日志里一搜就能
 * 找到那一次请求的完整现场。
 */
export interface Envelope<T> {
  code: number;
  message: string;
  data: T | null;
  requestId: string;
}

/**
 * 生成一个「校验信封」的 zod schema。
 * 前端拿它校验后端响应，后端拿它写 Swagger 文档 —— 两边共用同一份定义。
 */
export function createEnvelopeSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    code: z.number().int(),
    message: z.string().min(1),
    data: dataSchema.nullable(),
    requestId: z.string().min(1),
  });
}

/** 任意数据的信封（用于校验未知结构的响应）。 */
export const AnyEnvelopeSchema = createEnvelopeSchema(z.unknown());

/** 成功时 data 一定非空 —— 用类型守卫把它收窄，前端就不用到处写 `data!`。 */
export function isSuccess<T>(env: Envelope<T>): env is Envelope<T> & { code: 0; data: T } {
  return env.code === ErrorCode.OK && env.data !== null;
}

/** 后端构造成功响应。 */
export function ok<T>(data: T, requestId: string, message: string = ERROR_MESSAGES[ErrorCode.OK]!): Envelope<T> {
  return { code: ErrorCode.OK, message, data, requestId };
}

/** 后端构造失败响应；message 不传则取错误码登记的中文文案。 */
export function fail<T = never>(
  code: number,
  requestId: string,
  message?: string,
  data: T | null = null,
): Envelope<T> {
  return { code, message: message ?? messageFor(code), data, requestId };
}
