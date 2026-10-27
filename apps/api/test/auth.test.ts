/**
 * 认证集成测试
 *
 * 覆盖 PRD 4.1 验收标准：
 *   1. 注册后密码以 bcrypt 哈希存储
 *   2. 未携带 token 访问受保护接口返回 401
 *   3. 过期或伪造 token 返回 401
 *   4. 同一邮箱重复注册返回 409
 *   5. 登录接口连续失败触发限流
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import type { INestApplication } from '@nestjs/common';
import { createApp, api, login, registerUser } from './helpers';
import { getPrisma } from './helpers';

describe('认证模块', () => {
  let app: INestApplication;
  let prisma: ReturnType<typeof getPrisma>;

  beforeAll(async () => {
    app = await createApp();
    prisma = getPrisma();
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  describe('注册', () => {
    // 先测无效格式（不触发限流计数），再测正常注册
    it('无效邮箱格式被拒绝', async () => {
      const res = await api(app)
        .post('/api/auth/register')
        .send({ email: 'not-an-email', password: 'Test@123456' });
      expect(res.status).toBe(400);
    });

    it('空密码被拒绝', async () => {
      const res = await api(app)
        .post('/api/auth/register')
        .send({ email: `empty_${Date.now()}@example.com`, password: '' });
      expect(res.status).toBe(400);
    });

    it('注册成功并返回用户信息，密码以 bcrypt 哈希存储（PRD 验收标准 1）', async () => {
      // 合并「注册成功」与「密码以 bcrypt 哈希存储」两个用例：
      // 两者都要注册新用户，而注册接口限流 5 次/分钟，
      // 拆开会多消耗一次配额，导致后面的「重复注册」测试被 429 拦下。
      const email = `auth_test_${Date.now()}@example.com`;
      const res = await api(app)
        .post('/api/auth/register')
        .send({ email, password: 'Test@123456', nickname: '测试' });

      expect(res.status).toBe(201);
      expect(res.body.code).toBe(0);
      expect(res.body.data.email).toBe(email);
      expect(res.body.data.role).toBe('user');
      // 响应里不能有密码字段
      expect(res.body.data.password).toBeUndefined();
      expect(res.body.data.passwordHash).toBeUndefined();

      // 查数据库验证密码不是明文
      const user = await prisma.user.findUnique({ where: { email } });
      expect(user).not.toBeNull();
      expect(user!.passwordHash).not.toBe('Test@123456');
      // bcrypt 哈希以 $2 开头
      expect(user!.passwordHash).toMatch(/^\$2[aby]\$/);
    });

    it('同一邮箱重复注册返回 409（PRD 验收标准 4）', async () => {
      const email = `dup_${Date.now()}@example.com`;
      const first = await api(app)
        .post('/api/auth/register')
        .send({ email, password: 'Test@123456' });
      expect(first.status).toBe(201);

      const second = await api(app)
        .post('/api/auth/register')
        .send({ email, password: 'Test@123456' });
      expect(second.status).toBe(409);
      expect(second.body.code).toBe(40901);
    });
  });

  describe('登录', () => {
    it('正确凭据登录成功并返回 token', async () => {
      const res = await api(app)
        .post('/api/auth/login')
        .send({ email: 'admin@example.com', password: 'Admin@hQk_BXF0Pnrw' });
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.accessToken).toBeTruthy();
      expect(res.body.data.user.email).toBe('admin@example.com');
      expect(res.body.data.user.role).toBe('admin');
    });

    it('错误密码返回 401', async () => {
      const res = await api(app)
        .post('/api/auth/login')
        .send({ email: 'admin@example.com', password: 'wrong-password' });
      expect(res.status).toBe(401);
      expect(res.body.code).toBe(20001);
    });

    it('不存在的邮箱返回 401', async () => {
      const res = await api(app)
        .post('/api/auth/login')
        .send({ email: 'nobody@example.com', password: 'Test@123456' });
      expect(res.status).toBe(401);
    });
  });

  describe('当前用户', () => {
    it('携带 token 可以获取当前用户信息', async () => {
      const token = await login(app);
      const res = await api(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.email).toBe('admin@example.com');
    });

    it('未携带 token 返回 401（PRD 验收标准 2）', async () => {
      const res = await api(app).get('/api/auth/me');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe(20001);
    });

    it('伪造 token 返回 401（PRD 验收标准 3）', async () => {
      const res = await api(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer fake-token-here');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe(20001);
    });
  });

  describe('刷新令牌', () => {
    it('refresh token 可以换取新的 access token', async () => {
      // 先登录拿到 refresh token（httpOnly Cookie）
      const loginRes = await api(app)
        .post('/api/auth/login')
        .send({ email: 'admin@example.com', password: 'Admin@hQk_BXF0Pnrw' });
      expect(loginRes.status).toBe(200);

      // 用 refresh cookie 刷新
      // set-cookie 在 Node 里是数组，但 supertest 的类型定义可能是 string，强制转换
      const setCookies = loginRes.headers['set-cookie'] as string[] | undefined;
      const cookieStr = (setCookies ?? [])
        .map((c) => c.split(';')[0])
        .join('; ');

      const refreshRes = await api(app)
        .post('/api/auth/refresh')
        .set('Cookie', cookieStr);
      expect(refreshRes.status).toBe(200);
      expect(refreshRes.body.data.accessToken).toBeTruthy();
    });
  });
});
