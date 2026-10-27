/**
 * 消息与 SSE 集成测试
 *
 * 覆盖 PRD 4.3 验收标准：
 *   1. 发送消息后 SSE 正常推送
 *   2. 生成完成后消息完整落库
 *   3. 空会话不可直接发送消息
 *   4. SSE 响应头正确
 *
 * 注意：测试用 mock provider（AI_PROVIDER=mock），不需要真实 AI API
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import type { INestApplication } from '@nestjs/common';
import { createApp, api, login, createConversation, getPrisma } from './helpers';

describe('消息与 SSE', () => {
  let app: INestApplication;
  let adminToken: string;
  let prisma: ReturnType<typeof getPrisma>;

  beforeAll(async () => {
    app = await createApp();
    adminToken = await login(app);
    prisma = getPrisma();
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  describe('发送消息', () => {
    it('发送消息后 SSE 返回流式响应', async () => {
      const convId = await createConversation(app, adminToken, 'SSE测试');

      const res = await api(app)
        .post(`/api/conversations/${convId}/messages`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          content: '你好',
          clientMessageId: crypto.randomUUID(),
        });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/event-stream');
    });

    it('生成完成后消息完整落库（PRD 验收标准 2）', async () => {
      const convId = await createConversation(app, adminToken, '落库测试');

      await api(app)
        .post(`/api/conversations/${convId}/messages`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          content: '测试消息',
          clientMessageId: crypto.randomUUID(),
        });

      // 查数据库验证消息已落库
      const messages = await prisma.message.findMany({
        where: { conversationId: BigInt(convId) },
        orderBy: { id: 'asc' },
      });

      expect(messages.length).toBe(2); // user + assistant
      expect(messages[0]!.role).toBe('user');
      expect(messages[0]!.content).toBe('测试消息');
      expect(messages[1]!.role).toBe('assistant');
      expect(messages[1]!.status).toBe('complete');
      expect(messages[1]!.content.length).toBeGreaterThan(0);
    });

    it('空内容被拒绝', async () => {
      const convId = await createConversation(app, adminToken, '空内容测试');

      const res = await api(app)
        .post(`/api/conversations/${convId}/messages`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          content: '   ',
          clientMessageId: crypto.randomUUID(),
        });

      expect(res.status).toBe(400);
    });

    it('缺少 clientMessageId 被拒绝', async () => {
      const convId = await createConversation(app, adminToken, '幂等测试');

      const res = await api(app)
        .post(`/api/conversations/${convId}/messages`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ content: '没有幂等键' });

      expect(res.status).toBe(400);
    });

    it('幂等：相同 clientMessageId 不产生重复消息', async () => {
      const convId = await createConversation(app, adminToken, '幂等去重');
      const clientMessageId = crypto.randomUUID();

      // 第一次发送
      await api(app)
        .post(`/api/conversations/${convId}/messages`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ content: '测试幂等', clientMessageId });

      // 第二次发送（相同 clientMessageId）
      const res2 = await api(app)
        .post(`/api/conversations/${convId}/messages`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ content: '测试幂等', clientMessageId });

      // 应该返回冲突
      expect(res2.status).toBe(409);

      // 数据库里只有一条该 clientMessageId 的用户消息
      const dupMessages = await prisma.message.findMany({
        where: { conversationId: BigInt(convId), clientMessageId },
      });
      expect(dupMessages.length).toBe(1);
    });
  });

  describe('历史消息', () => {
    it('返回分页的历史消息', async () => {
      const convId = await createConversation(app, adminToken, '历史消息测试');

      // 发送几条消息
      for (let i = 0; i < 3; i++) {
        await api(app)
          .post(`/api/conversations/${convId}/messages`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            content: `消息${i}`,
            clientMessageId: crypto.randomUUID(),
          });
      }

      const res = await api(app)
        .get(`/api/conversations/${convId}/messages?limit=10`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBeGreaterThan(0);

      // 按时间升序排列
      const ids = res.body.data.items.map((m: { id: string }) => BigInt(m.id));
      for (let i = 1; i < ids.length; i++) {
        expect(ids[i]).toBeGreaterThan(ids[i - 1]);
      }
    });

    it('游标分页：用 before 获取更早的消息', async () => {
      const convId = await createConversation(app, adminToken, '游标分页测试');

      // 发几条消息
      for (let i = 0; i < 5; i++) {
        await api(app)
          .post(`/api/conversations/${convId}/messages`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            content: `消息${i}`,
            clientMessageId: crypto.randomUUID(),
          });
      }

      // 第一次：取前 3 条
      const first = await api(app)
        .get(`/api/conversations/${convId}/messages?limit=3`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(first.body.data.items.length).toBe(3);
      expect(first.body.data.nextCursor).toBeTruthy();

      // 第二次：用游标取更早的
      const second = await api(app)
        .get(`/api/conversations/${convId}/messages?limit=3&before=${first.body.data.nextCursor}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(second.body.data.items.length).toBeGreaterThan(0);

      // 第二次的消息 ID 应该比第一次的小（更早的）
      const firstIds = first.body.data.items.map((m: { id: string }) => BigInt(m.id));
      const secondIds = second.body.data.items.map((m: { id: string }) => BigInt(m.id));
      // Math.min 不接受 BigInt，手动取最小值
      const firstMin = firstIds.reduce((min: bigint, id: bigint) => (id < min ? id : min), firstIds[0]!);
      for (const id2 of secondIds) {
        expect(id2).toBeLessThan(firstMin);
      }
    });
  });

  describe('越权保护', () => {
    it('用户 A 不能向用户 B 的会话发消息', async () => {
      // 创建用户 B 和会话
      const userB = await api(app)
        .post('/api/auth/register')
        .send({
          email: `msg_user_b_${Date.now()}@example.com`,
          password: 'Test@123456',
        });
      const userBToken = (await api(app)
        .post('/api/auth/login')
        .send({ email: userB.body.data.email, password: 'Test@123456' }))
        .body.data.accessToken;

      const convRes = await api(app)
        .post('/api/conversations')
        .set('Authorization', `Bearer ${userBToken}`)
        .send({ title: 'B的会话' });
      const convId = convRes.body.data.id;

      // 用户 A（admin）尝试发消息
      const res = await api(app)
        .post(`/api/conversations/${convId}/messages`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          content: '恶意消息',
          clientMessageId: crypto.randomUUID(),
        });

      expect(res.status).toBe(403);
    });
  });
});
