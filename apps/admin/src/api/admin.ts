import {
  type AdminUser,
  type AdminUserListResponse,
  type AdminRole,
  type AdminRoleListResponse,
  type AdminStats,
} from '@app/contract';
import { unwrap, http } from './http';

export const adminApi = {
  listUsers(params: { page?: number; pageSize?: number; keyword?: string } = {}): Promise<AdminUserListResponse> {
    return unwrap<AdminUserListResponse>(http.get('/admin/users', { params }));
  },

  updateUserStatus(userId: string, status: 0 | 1): Promise<{ id: string; status: number }> {
    return unwrap<{ id: string; status: number }>(
      http.patch(`/admin/users/${userId}/status`, {}, { params: { status: String(status) } }),
    );
  },

  listRoles(): Promise<AdminRoleListResponse> {
    return unwrap<AdminRoleListResponse>(http.get('/admin/roles'));
  },

  getStats(): Promise<AdminStats> {
    return unwrap<AdminStats>(http.get('/admin/stats'));
  },
};
