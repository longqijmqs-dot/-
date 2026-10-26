import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ErrorCode } from '@app/contract';
import { AppError } from '../../common/app-error';
import { logger } from '../../common/logger';
import { RedisService } from '../../redis/redis.service';
import type { AccessTokenPayload, AuthenticatedRequest } from '../auth.types';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * 认证守卫（全局注册，默认所有接口都要登录）。
 *
 * 校验顺序：
 *   1. 带 @Public() → 直接放行
 *   2. 没有 Bearer token → 401 / 20001
 *   3. 签名不对 → 401 / 20001；过期 → 401 / 20002（前端据此触发静默刷新）
 *   4. 账号被禁用 → 401 / 20004（老师说的「禁用立即生效」就靠这一步）
 *
 * 第 4 步要查 Redis，每个请求多一次往返。
 * 如果 Redis 挂了，宁可放行也不要让全站 401（可用性优先），但要打 error 日志。
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractBearerToken(request.headers.authorization);
    if (!token) {
      throw AppError.unauthorized(ErrorCode.UNAUTHORIZED);
    }

    const payload = await this.verify(token);
    await this.assertNotDisabled(payload.sub);

    request.user = { id: payload.sub, role: payload.role };
    return true;
  }

  private async verify(token: string): Promise<AccessTokenPayload> {
    try {
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      });
      if (payload.type !== 'access') {
        // 防止有人拿 refresh token 直接当 access token 用
        throw AppError.unauthorized(ErrorCode.UNAUTHORIZED);
      }
      return payload;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      if ((error as { name?: string }).name === 'TokenExpiredError') {
        throw AppError.unauthorized(ErrorCode.TOKEN_EXPIRED);
      }
      throw AppError.unauthorized(ErrorCode.UNAUTHORIZED);
    }
  }

  private async assertNotDisabled(userId: string): Promise<void> {
    try {
      if (await this.redis.isUserDisabled(userId)) {
        throw AppError.unauthorized(ErrorCode.ACCOUNT_DISABLED);
      }
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      // Redis 故障：降级放行，避免整站不可用（见 design.md D5）
      logger.error({ err: error, userId }, '禁用状态校验失败，已降级放行');
    }
  }
}

function extractBearerToken(header: string | undefined): string | null {
  if (!header) {
    return null;
  }
  const [scheme, value] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !value) {
    return null;
  }
  return value;
}
