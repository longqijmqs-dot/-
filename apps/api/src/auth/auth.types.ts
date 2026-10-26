import type { RoleCode } from '@app/contract';
import type { Request } from 'express';

/** 通过鉴权后挂在 request 上的用户信息（只放后续判断需要的最小字段） */
export interface RequestUser {
  id: string;
  role: RoleCode;
}

export interface AuthenticatedRequest extends Request {
  user: RequestUser;
}

/** access token 载荷。type 字段用于防止「拿 refresh token 当 access token 用」。 */
export interface AccessTokenPayload {
  sub: string;
  role: RoleCode;
  type: 'access';
  iat?: number;
  exp?: number;
}

/** refresh token 载荷。jti 是这张票据的唯一编号，Redis 里按它建白名单。 */
export interface RefreshTokenPayload {
  sub: string;
  jti: string;
  type: 'refresh';
  iat?: number;
  exp?: number;
}
