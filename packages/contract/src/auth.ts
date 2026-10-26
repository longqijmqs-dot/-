import { z } from 'zod';

/**
 * 认证相关契约。
 *
 * 注意一件事：refresh token 不在这里，也永远不会出现在任何响应体里。
 * 它只通过 httpOnly Cookie 下发，前端 JS 读不到 —— 这是 design.md D4 的决定。
 */

export const RoleCodeSchema = z.enum(['admin', 'user']);
export type RoleCode = z.infer<typeof RoleCodeSchema>;

export const RegisterSchema = z.object({
  // trim + toLowerCase：邮箱不区分大小写，从入口就统一，
  // 避免出现 Alice@x.com 和 alice@x.com 两个账号
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, '请填写邮箱')
    .max(255)
    .email('邮箱格式不正确'),
  password: z
    .string()
    .min(8, '密码至少 8 位')
    .max(64, '密码最多 64 位'),
  nickname: z.string().trim().min(1).max(64, '昵称最多 64 字').optional(),
});

export type RegisterInput = z.infer<typeof RegisterSchema>;

export const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().min(1, '请填写邮箱').email('邮箱格式不正确'),
  password: z.string().min(1, '请填写密码').max(64),
});

export type LoginInput = z.infer<typeof LoginSchema>;

/** 对外暴露的用户信息：有 id/email/nickname/role，永远没有 passwordHash。 */
export const PublicUserSchema = z.object({
  // bigint 在 JSON 里会有精度问题，统一序列化成字符串
  id: z.string(),
  email: z.string(),
  nickname: z.string().nullable(),
  role: RoleCodeSchema,
  status: z.number().int(),
  createdAt: z.string(),
});

export type PublicUser = z.infer<typeof PublicUserSchema>;

/**
 * 登录成功的 data。
 * expiresIn 是 access token 的剩余秒数，前端据此提前续期（不要等真的过期）。
 */
export const LoginResultSchema = z.object({
  accessToken: z.string().min(1),
  expiresIn: z.number().int().positive(),
  user: PublicUserSchema,
});

export type LoginResult = z.infer<typeof LoginResultSchema>;

export const RefreshResultSchema = z.object({
  accessToken: z.string().min(1),
  expiresIn: z.number().int().positive(),
});

export type RefreshResult = z.infer<typeof RefreshResultSchema>;
