/**
 * 后台管理集成测试
 *
 * 覆盖 PRD 4.5 验收标准：
 *   1. 非 admin 角色访问管理接口返回 403
 *   2. 禁用用户后，其已签发的 token 访问接口立即返回 401
 *   3. 用户列表搜索与分页生效
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import type { INestApplication } from '@nestjs/common';
import { createApp, api, login, registerUser } from './helpers';

describe('后台管理', () => {
  let app: INestApplication;
  let adminToken: string;
  let userToken: string;
  let userEmail: string;

  beforeAll(async () => {
    app = await createApp();
    adminToken = await login(app);

    const user = await registerUser(app);
    userToken = user.token;
    userEmail = user.email;
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('权限校验', () => {
    it('非 admin 访问用户列表返回 403（PRD 验收标准 1）', async () => {
      const res = await api(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${userToken}`);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe(30002);
    });

    it('非 admin 访问角色列表返回 403', async () => {
      const res = await api(app)
        .get('/api/admin/roles')
        .set('Authorization', `Bearer ${userToken}`);
      expect(res.status).toBe(403);
    });

    it('非 admin 访问统计返回 403', async () => {
      const res = await api(app)
        .get('/api/admin/stats')
        .set('Authorization', `Bearer ${userToken}`);
      expect(res.status).toBe(403);
    });

    it('非 admin 禁用用户返回 403', async () => {
      const res = await api(app)
        .patch('/api/admin/users/1/status?status=0')
        .set('Authorization', `Bearer ${userToken}`);
      expect(res.status).toBe(403);
    });

    it('未登录访问管理接口返回 401', async () => {
      const res = await api(app).get('/api/admin/users');
      expect(res.status).toBe(401);
    });
  });

  describe('用户列表', () => {
    it('admin 可以获取用户列表', async () => {
      const res = await api(app)
        .get('/api/admin/users?page=1&pageSize=10')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.items).toBeInstanceOf(Array);
      expect(res.body.data.total).toBeGreaterThanOrEqual(1);
    });

    it('按邮箱搜索生效（PRD 验收标准 3）', async () => {
      const res = await api(app)
        .get(`/api/admin/users?keyword=${encodeURIComponent(userEmail)}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(1);
      expect(res.body.data.items[0].email).toBe(userEmail);
    });

    it('按昵称搜索生效', async () => {
      const res = await api(app)
        .get('/api/admin/users?keyword=admin')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.total).toBeGreaterThanOrEqual(1);
    });

    it('分页参数生效', async () => {
      const res = await api(app)
        .get('/api/admin/users?page=1&pageSize=2')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBeLessThanOrEqual(2);
    });
  });

  describe('禁用/启用用户', () => {
    it('admin 可以禁用用户', async () => {
      // 先搜索到目标用户
      const searchRes = await api(app)
        .get(`/api/admin/users?keyword=${encodeURIComponent(userEmail)}`)
        .set('Authorization', `Bearer ${adminToken}`);
      const userId = searchRes.body.data.items[0].id;

      const res = await api(app)
        .patch(`/api/admin/users/${userId}/status?status=0`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe(0);
    });

    it('禁用后该用户 token 立即失效（PRD 验收标准 2）', async () => {
      // 先搜索到目标用户
      const searchRes = await api(app)
        .get(`/api/admin/users?keyword=${encodeURIComponent(userEmail)}`)
        .set('Authorization', `Bearer ${adminToken}`);
      const userId = searchRes.body.data.items[0].id;

      // 禁用
      await api(app)
        .patch(`/api/admin/users/${userId}/status?status=0`)
        .set('Authorization', `Bearer ${adminToken}`);

      // 被禁用用户访问接口
      const res = await api(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${userToken}`);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe(20004); // 账号禁用
    });

    it('admin 可以重新启用用户', async () => {
      const searchRes = await api(app)
        .get(`/api/admin/users?keyword=${encodeURIComponent(userEmail)}`)
        .set('Authorization', `Bearer ${adminToken}`);
      const userId = searchRes.body.data.items[0].id;

      const res = await api(app)
        .patch(`/api/admin/users/${userId}/status?status=1`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe(1);
    });

    it('admin 不能禁用自己', async () => {
      const res = await api(app)
        .patch('/api/admin/users/1/status?status=0')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(400);
    });
  });

  describe('角色列表', () => {
    it('返回角色列表', async () => {
      const res = await api(app)
        .get('/api/admin/roles')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBeGreaterThanOrEqual(2);

      const codes = res.body.data.items.map((r: { code: string }) => r.code);
      expect(codes).toContain('admin');
      expect(codes).toContain('user');
    });
  });

  describe('平台统计', () => {
    it('返回统计数据', async () => {
      const res = await api(app)
        .get('/api/admin/stats')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.userCount).toBeGreaterThanOrEqual(1);
      expect(res.body.data.conversationCount).toBeGreaterThanOrEqual(0);
      expect(res.body.data.messageCount).toBeGreaterThanOrEqual(0);
      expect(res.body.data.aiCallCount).toBeGreaterThanOrEqual(0);
    });
  });
});
