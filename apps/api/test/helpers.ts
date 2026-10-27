/**
 * 测试辅助函数
 *
 * 集成测试用真实 HTTP 请求打到后端，所以需要：
 *   1. 启动 NestJS 应用实例（supertest 直接打，不走网络端口）
 *   2. 登录拿 token
 *   3. 创建会话、上传文件等前置操作
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import cookieParser from 'cookie-parser';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';
import { TransformInterceptor } from '../src/common/transform.interceptor';

// 测试用数据库连接（global-setup 已创建并跑过迁移）
const TEST_DATABASE_URL =
  'mysql://aichat:jWoTeWGx5I8B2HzCA9nsS5U5@localhost:3306/ai_chat_test';

/** 启动应用实例（supertest 用，不走网络端口） */
export async function createApp(): Promise<INestApplication> {
  // 设置测试环境变量
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.REDIS_URL = 'redis://:EQFB-KdeUKEll8t6NdfW7UK3@localhost:6379';
  process.env.NODE_ENV = 'test';
  process.env.AI_PROVIDER = 'mock';

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');

  // 和 main.ts 保持一致：注册全局中间件、拦截器、过滤器
  // 缺了这些，响应不会包信封 {code,message,data}，错误也不会被统一处理
  const cls = app.get(ClsService);
  app.use(cookieParser());
  app.useGlobalInterceptors(new TransformInterceptor(cls));
  app.useGlobalFilters(new AllExceptionsFilter(cls));

  await app.init();

  return app;
}

/** 获取后端 API 的 supertest 请求函数 */
export function api(app: INestApplication) {
  return request(app.getHttpServer());
}

/** 登录并返回 token */
export async function login(
  app: INestApplication,
  email = 'admin@example.com',
  password = 'Admin@hQk_BXF0Pnrw',
): Promise<string> {
  const res = await api(app).post('/api/auth/login').send({ email, password });
  expect(res.status).toBe(200);
  expect(res.body.code).toBe(0);
  return res.body.data.accessToken;
}

/** 注册一个随机用户 */
export async function registerUser(
  app: INestApplication,
): Promise<{ email: string; password: string; token: string }> {
  const email = `test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@example.com`;
  const password = 'Test@123456';
  const nickname = `测试用户${Math.random().toString(36).slice(2, 6)}`;

  const res = await api(app).post('/api/auth/register').send({ email, password, nickname });
  expect(res.status).toBe(201);

  // 注册后自动登录
  const token = await login(app, email, password);

  return { email, password, token };
}

/** 创建会话 */
export async function createConversation(
  app: INestApplication,
  token: string,
  title = '测试会话',
): Promise<string> {
  const res = await api(app)
    .post('/api/conversations')
    .set('Authorization', `Bearer ${token}`)
    .send({ title });
  expect(res.status).toBe(201);
  return res.body.data.id;
}

/** 获取 Prisma 客户端（测试数据库） */
export function getPrisma(): PrismaClient {
  return new PrismaClient({ datasourceUrl: TEST_DATABASE_URL });
}
