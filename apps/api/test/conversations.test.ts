/**
 * 会话管理集成测试
 *
 * 覆盖 PRD 4.2 验收标准：
 *   1. 会话数据仅本人可见，越权访问他人会话返回 403
 *   2. 列表分页参数生效
 *   3. 归档会话不出现在默认列表
 *   4. 删除会话后列表不再返回
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import type { INestApplication } from '@nestjs/common';
import { createApp, api, login, registerUser, createConversation } from './helpers';

describe('会话管理', () => {
  let app: INestApplication;
  let adminToken: string;
  let user1Token: string;
  let user1Email: string;
  let user2Token: string;
  let user2Email: string;

  beforeAll(async () => {
    app = await createApp();
    adminToken = await login(app);

    const user1 = await registerUser(app);
    user1Token = user1.token;
    user1Email = user1.email;

    const user2 = await registerUser(app);
    user2Token = user2.token;
    user2Email = user2.email;
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('创建会话', () => {
    it('创建成功并返回默认标题', async () => {
      const res = await api(app)
        .post('/api/conversations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      expect(res.status).toBe(201);
      expect(res.body.data.id).toBeTruthy();
      expect(res.body.data.title).toBeTruthy();
    });

    it('可以自定义标题', async () => {
      const res = await api(app)
        .post('/api/conversations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: '我的会话' });
      expect(res.status).toBe(201);
      expect(res.body.data.title).toBe('我的会话');
    });

    it('空标题被拒绝', async () => {
      const res = await api(app)
        .post('/api/conversations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: '' });
      expect(res.status).toBe(400);
    });
  });

  describe('会话列表', () => {
    it('返回分页列表', async () => {
      const res = await api(app)
        .get('/api/conversations?page=1&pageSize=10')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.items).toBeInstanceOf(Array);
      expect(res.body.data.total).toBeGreaterThanOrEqual(0);
      expect(res.body.data.page).toBe(1);
    });

    it('默认不包含已归档会话', async () => {
      // 创建一个会话
      const convRes = await api(app)
        .post('/api/conversations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: '归档测试' });
      const convId = convRes.body.data.id;

      // 归档它
      await api(app)
        .patch(`/api/conversations/${convId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isArchived: true });

      // 列表不应包含已归档的
      const listRes = await api(app)
        .get('/api/conversations')
        .set('Authorization', `Bearer ${adminToken}`);
      const found = listRes.body.data.items.find((c: { id: string }) => c.id === convId);
      expect(found).toBeUndefined();

      // 用 archived=true 可以查到
      const archivedRes = await api(app)
        .get('/api/conversations?archived=true')
        .set('Authorization', `Bearer ${adminToken}`);
      const foundArchived = archivedRes.body.data.items.find((c: { id: string }) => c.id === convId);
      expect(foundArchived).toBeTruthy();
    });
  });

  describe('会话详情', () => {
    it('返回会话元信息和消息统计', async () => {
      const convId = await createConversation(app, adminToken, '详情测试');
      const res = await api(app)
        .get(`/api/conversations/${convId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(convId);
      expect(res.body.data.messageCount).toBe(0);
    });
  });

  describe('重命名', () => {
    it('重命名成功', async () => {
      const convId = await createConversation(app, adminToken, '旧标题');
      const res = await api(app)
        .patch(`/api/conversations/${convId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: '新标题' });
      expect(res.status).toBe(200);
      expect(res.body.data.title).toBe('新标题');
    });
  });

  describe('归档/恢复', () => {
    it('归档后可以恢复', async () => {
      const convId = await createConversation(app, adminToken, '归档恢复测试');

      // 归档
      await api(app)
        .patch(`/api/conversations/${convId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isArchived: true });

      // 恢复
      const res = await api(app)
        .patch(`/api/conversations/${convId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isArchived: false });
      expect(res.status).toBe(200);
      expect(res.body.data.isArchived).toBe(false);
    });
  });

  describe('删除会话', () => {
    it('删除后列表不再返回', async () => {
      const convId = await createConversation(app, adminToken, '删除测试');

      await api(app)
        .delete(`/api/conversations/${convId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      const listRes = await api(app)
        .get('/api/conversations')
        .set('Authorization', `Bearer ${adminToken}`);
      const found = listRes.body.data.items.find((c: { id: string }) => c.id === convId);
      expect(found).toBeUndefined();
    });

    it('删除后详情返回 404', async () => {
      const convId = await createConversation(app, adminToken, '删除后404');
      await api(app)
        .delete(`/api/conversations/${convId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      const res = await api(app)
        .get(`/api/conversations/${convId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(404);
    });
  });

  describe('越权保护', () => {
    it('用户 A 不能查看用户 B 的会话（PRD 验收标准 1）', async () => {
      const convId = await createConversation(app, user2Token, 'B的会话');

      // 用户 A 尝试查看
      const res = await api(app)
        .get(`/api/conversations/${convId}`)
        .set('Authorization', `Bearer ${user1Token}`);
      expect(res.status).toBe(403);
    });

    it('用户 A 不能删除用户 B 的会话', async () => {
      const convId = await createConversation(app, user2Token, 'B的会话-删除');

      const res = await api(app)
        .delete(`/api/conversations/${convId}`)
        .set('Authorization', `Bearer ${user1Token}`);
      expect(res.status).toBe(403);
    });

    it('用户 A 不能重命名用户 B 的会话', async () => {
      const convId = await createConversation(app, user2Token, 'B的会话-重命名');

      const res = await api(app)
        .patch(`/api/conversations/${convId}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ title: '恶意重命名' });
      expect(res.status).toBe(403);
    });
  });
});
