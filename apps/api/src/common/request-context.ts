import type { ClsService } from 'nestjs-cls';

/** 请求上下文里存 requestId 的键名 */
export const REQUEST_ID_KEY = 'requestId';

/** 从请求上下文中取 requestId；理论上不会为空，兜底给 unknown 方便排查。 */
export function getRequestId(cls: ClsService): string {
  return cls.get<string>(REQUEST_ID_KEY) ?? 'unknown';
}
