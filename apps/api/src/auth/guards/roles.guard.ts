import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode, type RoleCode } from '@app/contract';
import { AppError } from '../../common/app-error';
import type { AuthenticatedRequest } from '../auth.types';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * 角色守卫。
 *
 * 必须在 JwtAuthGuard 之后执行（它依赖 request.user）。
 * 没有 @Roles() 声明的接口 = 只要登录即可，不做角色限制。
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<RoleCode[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!required.includes(request.user.role)) {
      throw AppError.forbidden(ErrorCode.ROLE_FORBIDDEN);
    }
    return true;
  }
}
