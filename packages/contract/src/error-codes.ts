/**
 * 业务错误码 —— 前后端共用的唯一来源。
 *
 * 为什么不直接用 HTTP 状态码？
 *   HTTP 只会说「401 未授权」，但前端需要区分「令牌过期（该静默续期）」和
 *   「账号被禁用（该直接踢下线）」。两者都是 401，行为却相反。
 *   所以：HTTP 表达「哪一类错」，业务码表达「具体是哪一个错」。
 *
 * 分段规则（见 design.md D3）：
 *   0      成功
 *   10xxx  参数校验
 *   20xxx  认证（未登录/过期/刷新无效/账号禁用）
 *   30xxx  授权（不是本人资源/角色不足）
 *   40xxx  资源（不存在/冲突）
 *   42xxx  限流
 *   50xxx  服务端
 *
 * ⚠️ 码值一经发布，永远不再复用给别的含义。新增能力只能追加新码。
 */
export const ErrorCode = {
  OK: 0,

  VALIDATION_FAILED: 10001,

  UNAUTHORIZED: 20001,
  TOKEN_EXPIRED: 20002,
  REFRESH_INVALID: 20003,
  ACCOUNT_DISABLED: 20004,

  NOT_OWNER: 30001,
  ROLE_FORBIDDEN: 30002,

  NOT_FOUND: 40401,
  EMAIL_CONFLICT: 40901,

  RATE_LIMITED: 42901,

  INTERNAL_ERROR: 50000,
  UPSTREAM_ERROR: 50002,
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * 面向用户的中文兜底文案。
 * 前端优先展示这里的文案，而不是后端返回的 message —— 避免同一错误在不同接口
 * 出现不同措辞。后端 message 仅用于开发期排查。
 */
export const ERROR_MESSAGES: Readonly<Record<number, string>> = Object.freeze({
  [ErrorCode.OK]: '成功',
  [ErrorCode.VALIDATION_FAILED]: '请求参数有误，请检查后重试',
  [ErrorCode.UNAUTHORIZED]: '请先登录',
  [ErrorCode.TOKEN_EXPIRED]: '登录状态已过期，正在为你续期',
  [ErrorCode.REFRESH_INVALID]: '登录已失效，请重新登录',
  [ErrorCode.ACCOUNT_DISABLED]: '账号已被禁用，请联系管理员',
  [ErrorCode.NOT_OWNER]: '无权访问该资源',
  [ErrorCode.ROLE_FORBIDDEN]: '当前角色无权执行此操作',
  [ErrorCode.NOT_FOUND]: '资源不存在或已被删除',
  [ErrorCode.EMAIL_CONFLICT]: '该邮箱已被注册',
  [ErrorCode.RATE_LIMITED]: '请求过于频繁，请稍后再试',
  [ErrorCode.INTERNAL_ERROR]: '服务开小差了，请稍后重试',
  [ErrorCode.UPSTREAM_ERROR]: 'AI 服务暂时不可用，请稍后重试',
});

/** 取错误码对应的中文文案；未登记的码走通用兜底。 */
export function messageFor(code: number): string {
  return ERROR_MESSAGES[code] ?? '操作失败，请稍后重试';
}

/** 判断一个业务码是否属于认证类（20xxx）。 */
export function isAuthCode(code: number): boolean {
  return code >= 20000 && code < 30000;
}
