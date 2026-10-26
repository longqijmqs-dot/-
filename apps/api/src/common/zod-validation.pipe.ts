import type { PipeTransform } from '@nestjs/common';
import type { ZodSchema } from 'zod';

/**
 * zod 校验管道。
 *
 * 用法：`@Body(new ZodValidationPipe(LoginSchema)) body: LoginInput`
 *
 * 校验失败时 zod 会抛 ZodError，由全局异常过滤器统一翻译成
 * `400 / 10001` + 字段级错误列表。所以这里不需要 try/catch。
 */
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown): unknown {
    return this.schema.parse(value);
  }
}
