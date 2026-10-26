import { messageFor } from '@app/contract';

/**
 * 业务异常。
 *
 * 为什么不直接用 Nest 的 BadRequestException？
 * 因为 Nest 的异常只带 HTTP 状态码，而我们还需要一个**业务码**让前端做分支处理
 * （比如 401 里要区分「令牌过期」和「账号禁用」，两者行为完全相反）。
 *
 * 用法：`throw new AppError(ErrorCode.EMAIL_CONFLICT, 409)`
 *      或 `throw AppError.unauthorized(ErrorCode.TOKEN_EXPIRED)`
 */
export class AppError extends Error {
  constructor(
    readonly code: number,
    readonly status: number,
    message?: string,
    readonly data: unknown = null,
  ) {
    super(message ?? messageFor(code));
    this.name = 'AppError';
  }

  static unauthorized(code: number, message?: string): AppError {
    return new AppError(code, 401, message);
  }

  static forbidden(code: number, message?: string): AppError {
    return new AppError(code, 403, message);
  }

  static notFound(code: number, message?: string): AppError {
    return new AppError(code, 404, message);
  }

  static conflict(code: number, message?: string): AppError {
    return new AppError(code, 409, message);
  }

  static badRequest(code: number, message?: string, data?: unknown): AppError {
    return new AppError(code, 400, message, data ?? null);
  }
}
