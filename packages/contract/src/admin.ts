import { z } from 'zod';

/**
 * 后台管理契约（PRD 4.5 / 7.5）。
 *
 * 管理接口 SHALL 仅 admin 角色可访问（RolesGuard 校验）。
 * 所有管理接口 SHALL 单独限流（比业务接口更严格）。
 */

/** 用户状态：1 启用 / 0 禁用 */
export const UserStatusSchema = z.enum(['active', 'disabled']);
export type UserStatus = z.infer<typeof UserStatusSchema>;

/** 用户列表项（管理接口返回，含角色代码和状态） */
export const AdminUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  nickname: z.string().nullable(),
  /** 角色代码：admin / user */
  roleCode: z.enum(['admin', 'user']),
  status: z.number().int().min(0).max(1),
  lastLoginAt: z.string().nullable(),
  createdAt: z.string(),
});

export type AdminUser = z.infer<typeof AdminUserSchema>;

/** 用户列表响应 */
export const AdminUserListResponseSchema = z.object({
  items: z.array(AdminUserSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});

export type AdminUserListResponse = z.infer<typeof AdminUserListResponseSchema>;

/** 更新用户状态入参 */
export const UpdateUserStatusSchema = z.object({
  /** 1 = 启用，0 = 禁用 */
  status: z.enum(['1', '0']),
});

export type UpdateUserStatusInput = z.infer<typeof UpdateUserStatusSchema>;

/** 更新用户状态响应 */
export const UpdateUserStatusResponseSchema = z.object({
  id: z.string(),
  status: z.number().int(),
});

export type UpdateUserStatusResponse = z.infer<typeof UpdateUserStatusResponseSchema>;

/** 角色列表项 */
export const AdminRoleSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  permissions: z.unknown(),
});

export type AdminRole = z.infer<typeof AdminRoleSchema>;

/** 角色列表响应 */
export const AdminRoleListResponseSchema = z.object({
  items: z.array(AdminRoleSchema),
});

export type AdminRoleListResponse = z.infer<typeof AdminRoleListResponseSchema>;

/** 平台统计 */
export const AdminStatsSchema = z.object({
  userCount: z.number().int().nonnegative(),
  conversationCount: z.number().int().nonnegative(),
  messageCount: z.number().int().nonnegative(),
  aiCallCount: z.number().int().nonnegative(),
});

export type AdminStats = z.infer<typeof AdminStatsSchema>;
