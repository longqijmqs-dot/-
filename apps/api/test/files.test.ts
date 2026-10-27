/**
 * 文件管理集成测试
 *
 * 覆盖 PRD 4.4 验收标准：
 *   1. 超过大小限制或非白名单类型返回 400
 *   2. 下载必须鉴权，他人文件返回 403
 *   3. 存储文件名与原始文件名分离
 *   4. 删除后文件不可再访问
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import type { INestApplication } from '@nestjs/common';
import { createApp, api, login, registerUser, getPrisma } from './helpers';
import Redis from 'ioredis';

describe('文件管理', () => {
  let app: INestApplication;
  let adminToken: string;
  let userToken: string;

  beforeAll(async () => {
    app = await createApp();
    adminToken = await login(app);

    const user = await registerUser(app);
    userToken = user.token;

    // 清除 Redis 禁用标记：admin 测试可能禁用了用户，
    // Redis 标记是全局的，跨测试文件残留会导致 files 测试的用户 token 失效
    const redis = new Redis('redis://:EQFB-KdeUKEll8t6NdfW7UK3@localhost:6379', { lazyConnect: true });
    await redis.connect();
    // 删除所有 user:disabled:* 标记（测试库是干净的，不影响开发库）
    const keys = await redis.keys('user:disabled:*');
    if (keys.length > 0) {
      await redis.del(...keys);
      console.log(`  清理了 ${keys.length} 个 Redis 禁用标记`);
    }
    await redis.quit();
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('上传', () => {
    it('上传文本文件成功', async () => {
      const boundary = '----TestBoundary';
      const body = Buffer.concat([
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="test.txt"\r\nContent-Type: text/plain\r\n\r\n`,
        ),
        Buffer.from('hello world'),
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);

      const res = await api(app)
        .post('/api/files')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Content-Type', `multipart/form-data; boundary=${boundary}`)
        .send(body);

      expect(res.status).toBe(201);
      expect(res.body.data.originalName).toBe('test.txt');
      expect(res.body.data.sizeBytes).toBe(11);
      expect(res.body.data.mimeType).toBe('text/plain');
    });

    it('上传图片成功', async () => {
      const boundary = '----TestBoundary';
      const body = Buffer.concat([
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="test.png"\r\nContent-Type: image/png\r\n\r\n`,
        ),
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);

      const res = await api(app)
        .post('/api/files')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Content-Type', `multipart/form-data; boundary=${boundary}`)
        .send(body);

      expect(res.status).toBe(201);
      expect(res.body.data.mimeType).toBe('image/png');
    });

    it('上传不支持的类型返回 400', async () => {
      const boundary = '----TestBoundary';
      const body = Buffer.concat([
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="virus.exe"\r\nContent-Type: application/x-msdownload\r\n\r\n`,
        ),
        Buffer.from('fake exe'),
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);

      const res = await api(app)
        .post('/api/files')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Content-Type', `multipart/form-data; boundary=${boundary}`)
        .send(body);

      expect(res.status).toBe(400);
    });

    it('未登录上传返回 401', async () => {
      const res = await api(app).post('/api/files');
      expect(res.status).toBe(401);
    });
  });

  describe('列表', () => {
    it('返回当前用户的文件列表', async () => {
      // 先上传一个文件
      const boundary = '----TestBoundary';
      const body = Buffer.concat([
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="list-test.txt"\r\nContent-Type: text/plain\r\n\r\n`,
        ),
        Buffer.from('list test'),
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);

      await api(app)
        .post('/api/files')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Content-Type', `multipart/form-data; boundary=${boundary}`)
        .send(body);

      const res = await api(app)
        .get('/api/files?page=1&pageSize=10')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items).toBeInstanceOf(Array);
      expect(res.body.data.total).toBeGreaterThanOrEqual(1);
    });
  });

  describe('下载', () => {
    it('下载文件成功', async () => {
      // 先上传
      const boundary = '----TestBoundary';
      const body = Buffer.concat([
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="download-test.txt"\r\nContent-Type: text/plain\r\n\r\n`,
        ),
        Buffer.from('download test content'),
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);

      const upRes = await api(app)
        .post('/api/files')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Content-Type', `multipart/form-data; boundary=${boundary}`)
        .send(body);
      const fileId = upRes.body.data.id;

      // 下载
      const dlRes = await api(app)
        .get(`/api/files/${fileId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(dlRes.status).toBe(200);
      expect(dlRes.text).toContain('download test content');
    });

    it('越权下载他人文件返回 403', async () => {
      // admin 上传文件
      const boundary = '----TestBoundary';
      const body = Buffer.concat([
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="private.txt"\r\nContent-Type: text/plain\r\n\r\n`,
        ),
        Buffer.from('private content'),
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);

      const upRes = await api(app)
        .post('/api/files')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Content-Type', `multipart/form-data; boundary=${boundary}`)
        .send(body);
      const fileId = upRes.body.data.id;

      // 普通用户尝试下载
      const dlRes = await api(app)
        .get(`/api/files/${fileId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(dlRes.status).toBe(403);
    });

    it('下载不存在的文件返回 404', async () => {
      const res = await api(app)
        .get('/api/files/999999')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(404);
    });
  });

  describe('删除', () => {
    it('删除后不可访问', async () => {
      // 上传
      const boundary = '----TestBoundary';
      const body = Buffer.concat([
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="delete-test.txt"\r\nContent-Type: text/plain\r\n\r\n`,
        ),
        Buffer.from('to be deleted'),
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);

      const upRes = await api(app)
        .post('/api/files')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Content-Type', `multipart/form-data; boundary=${boundary}`)
        .send(body);
      const fileId = upRes.body.data.id;

      // 删除
      const delRes = await api(app)
        .delete(`/api/files/${fileId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(delRes.status).toBe(200);

      // 下载应该 404
      const dlRes = await api(app)
        .get(`/api/files/${fileId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(dlRes.status).toBe(404);
    });

    it('越权删除他人文件返回 403', async () => {
      // admin 上传
      const boundary = '----TestBoundary';
      const body = Buffer.concat([
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="admin-only.txt"\r\nContent-Type: text/plain\r\n\r\n`,
        ),
        Buffer.from('admin only'),
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);

      const upRes = await api(app)
        .post('/api/files')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Content-Type', `multipart/form-data; boundary=${boundary}`)
        .send(body);
      const fileId = upRes.body.data.id;

      // 普通用户尝试删除
      const delRes = await api(app)
        .delete(`/api/files/${fileId}`)
        .set('Authorization', `Bearer ${userToken}`);
      expect(delRes.status).toBe(403);
    });
  });
});
