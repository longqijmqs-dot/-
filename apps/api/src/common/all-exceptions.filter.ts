import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ErrorCode, type Envelope, messageFor } from '@app/contract';
import type { ClsService } from 'nestjs-cls';
import type { Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from './app-error';
import { logger } from './logger';
import { getRequestId } from './request-context';

interface Resolved {
  status: number;
  code: number;
  message: string;
  data: unknown;
}

/**
 * 全局异常过滤器：所有错误（业务异常、框架 404、校验失败、Prisma 错误、未捕获异常）
 * 都从这里出口，保证响应形状永远一致。
 *
 * 最重要的一条：**永远不要把堆栈、SQL、文件路径返回给客户端**。
 * 客户端只拿到「业务码 + 人话」，细节进日志，靠 requestId 关联。
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly cls: ClsService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<{ method?: string; url?: string }>();
    const requestId = getRequestId(this.cls);

    const resolved = this.resolve(exception);
    const body: Envelope<unknown> = {
      code: resolved.code,
      message: resolved.message,
      data: resolved.data,
      requestId,
    };

    const logPayload = {
      requestId,
      method: req.method,
      url: req.url,
      status: resolved.status,
      code: resolved.code,
    };

    if (resolved.status >= 500) {
      logger.error({ ...logPayload, err: serialiseError(exception) }, '请求失败');
    } else if (resolved.status === 429 || resolved.status === 401 || resolved.status === 403) {
      // 认证/限流类失败量大且通常不是 bug，用 warn，避免污染 error 日志
      logger.warn(logPayload, resolved.message);
    } else {
      logger.info(logPayload, '请求被拒绝');
    }

    res.status(resolved.status).json(body);
  }

  private resolve(exception: unknown): Resolved {
    if (exception instanceof AppError) {
      return {
        status: exception.status,
        code: exception.code,
        message: exception.message,
        data: exception.data,
      };
    }

    if (exception instanceof ZodError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        code: ErrorCode.VALIDATION_FAILED,
        message: messageFor(ErrorCode.VALIDATION_FAILED),
        data: {
          errors: exception.issues.map((issue) => ({
            field: issue.path.join('.') || '(root)',
            message: issue.message,
          })),
        },
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.resolvePrisma(exception);
    }

    if (exception instanceof HttpException) {
      return this.resolveHttp(exception);
    }

    // 兜底：未预期异常一律 500，不暴露细节
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ErrorCode.INTERNAL_ERROR,
      message: messageFor(ErrorCode.INTERNAL_ERROR),
      data: null,
    };
  }

  private resolvePrisma(exception: Prisma.PrismaClientKnownRequestError): Resolved {
    switch (exception.code) {
      case 'P2002': // 唯一约束冲突
        return {
          status: HttpStatus.CONFLICT,
          code: ErrorCode.EMAIL_CONFLICT,
          message: messageFor(ErrorCode.EMAIL_CONFLICT),
          data: null,
        };
      case 'P2025': // 记录不存在
        return {
          status: HttpStatus.NOT_FOUND,
          code: ErrorCode.NOT_FOUND,
          message: messageFor(ErrorCode.NOT_FOUND),
          data: null,
        };
      case 'P2003': // 外键约束
        return {
          status: HttpStatus.BAD_REQUEST,
          code: ErrorCode.VALIDATION_FAILED,
          message: messageFor(ErrorCode.VALIDATION_FAILED),
          data: null,
        };
      default:
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          code: ErrorCode.INTERNAL_ERROR,
          message: messageFor(ErrorCode.INTERNAL_ERROR),
          data: null,
        };
    }
  }

  private resolveHttp(exception: HttpException): Resolved {
    const status = exception.getStatus();
    const code = httpStatusToCode(status);
    // Nest 内部异常的 message 可能是对象，这里只取安全的人话
    const raw = exception.getResponse();
    const message =
      status >= 500
        ? messageFor(ErrorCode.INTERNAL_ERROR)
        : typeof raw === 'string'
          ? raw
          : messageFor(code);
    return { status, code, message, data: null };
  }
}

function httpStatusToCode(status: number): number {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return ErrorCode.VALIDATION_FAILED;
    case HttpStatus.UNAUTHORIZED:
      return ErrorCode.UNAUTHORIZED;
    case HttpStatus.FORBIDDEN:
      return ErrorCode.ROLE_FORBIDDEN;
    case HttpStatus.NOT_FOUND:
      return ErrorCode.NOT_FOUND;
    case HttpStatus.CONFLICT:
      return ErrorCode.EMAIL_CONFLICT;
    case HttpStatus.TOO_MANY_REQUESTS:
      return ErrorCode.RATE_LIMITED;
    default:
      return status >= 500 ? ErrorCode.INTERNAL_ERROR : ErrorCode.VALIDATION_FAILED;
  }
}

function serialiseError(exception: unknown): Record<string, unknown> {
  if (exception instanceof Error) {
    return { name: exception.name, message: exception.message, stack: exception.stack };
  }
  return { value: String(exception) };
}
