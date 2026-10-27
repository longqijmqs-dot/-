import {
  type AdminUser,
  type AdminUserListResponse,
  type AdminRole,
  type AdminRoleListResponse,
  type AdminStats,
} from '@app/contract';
import { unwrap, http } from './http';

/**
 * 后台管理 API（PRD 7.5）。
 *
 * 所有接口仅 admin 角色可访问，服务端由 RolesGuard 校验。
 * 前端路由守卫（requiresAdmin）做第一层拦截，服务端做第二层。
 */
export const adminApi = {
  /** 用户列表（分页 + 搜索） */
  listUsers(params: { page?: number; pageSize?: number; keyword?: string } = {}): Promise<AdminUserListResponse> {
    return unwrap<AdminUserListResponse>(http.get('/admin/users', { params }));
  },

  /** 启用/禁用用户 */
  updateUserStatus(userId: string, status: 0 | 1): Promise<{ id: string; status: number }> {
    return unwrap<{ id: string; status: number }>(
      http.patch(`/admin/users/${userId}/status`, {}, { params: { status: String(status) } }),
    );
  },

  /** 角色列表 */
  listRoles(): Promise<AdminRoleListResponse> {
    return unwrap<AdminRoleListResponse>(http.get('/admin/roles'));
  },

  /** 平台统计 */
  getStats(): Promise<AdminStats> {
    return unwrap<AdminStats>(http.get('/admin/stats'));
  },
};
