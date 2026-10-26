import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { ok, type Envelope } from '@app/contract';
import type { ClsService } from 'nestjs-cls';
import { type Observable, map } from 'rxjs';
import { getRequestId } from './request-context';

/**
 * 统一响应拦截器：把控制器返回的裸数据包进信封。
 *
 * 控制器里只管 `return { id: '1' }`，信封由这里统一加，好处是：
 * - 不会出现「这个接口包了、那个接口忘了」
 * - requestId 一定是同一次请求的
 *
 * 注意：文件流、SSE 这类非 JSON 响应不能走这里（它们直接操作 res）。
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, Envelope<T>> {
  constructor(private readonly cls: ClsService) {}

  intercept(_context: ExecutionContext, next: CallHandler<T>): Observable<Envelope<T>> {
    return next.handle().pipe(map((data) => ok(data, getRequestId(this.cls))));
  }
}
