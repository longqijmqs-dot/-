import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth.types';

/**
 * 取当前登录用户：`@CurrentUser() user: RequestUser`
 *
 * 相比在每个控制器里手写 `req.user`，好处是类型明确，且拼错时编译期就报错。
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.user;
  },
);
