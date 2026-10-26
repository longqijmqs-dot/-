import { SetMetadata } from '@nestjs/common';
import type { RoleCode } from '@app/contract';

export const ROLES_KEY = 'roles';

/** 限定接口只能由指定角色访问；不写则只要求已登录。 */
export const Roles = (...roles: RoleCode[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);
