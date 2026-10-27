import { randomUUID } from 'node:crypto';
import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ClsModule } from 'nestjs-cls';
import type { Request, Response } from 'express';
import { loadEnv } from './config/env';
import { REQUEST_ID_KEY } from './common/request-context';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { AiModule } from './ai/ai.module';
import { ConversationsModule } from './conversations/conversations.module';
import { MessagesModule } from './messages/messages.module';
import { UploadsModule } from './uploads/uploads.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // cwd 是 apps/api；本地可用 .env.local 覆盖，最终回落到仓库根 .env
      envFilePath: ['.env.local', '.env', '../../.env'],
      validate: loadEnv,
    }),

    /**
     * 请求上下文：让 requestId 在任意深度的 service 里都能取到，
     * 不必一层层往下传参。
     */
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
        setup: (cls, req: Request, res: Response) => {
          const incoming = req.headers['x-request-id'];
          const requestId =
            typeof incoming === 'string' && incoming.trim().length > 0
              ? incoming.trim()
              : randomUUID();
          cls.set(REQUEST_ID_KEY, requestId);
          res.setHeader('X-Request-Id', requestId);
        },
      },
    }),

    /**
     * 全局限流：默认 60 次/分钟。
     * 登录/注册在控制器上用 @Throttle 覆盖成 5 次/分钟（见 auth.controller.ts）。
     */
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),

    PrismaModule,
    RedisModule,
    HealthModule,
    AuthModule,
    AiModule,
    ConversationsModule,
    MessagesModule,
    UploadsModule,
  ],
  providers: [
    // 限流放在最前面：让明显超限的请求尽早被拒，不浪费鉴权和数据库开销
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(_consumer: MiddlewareConsumer): void {
    // 目前请求上下文由 ClsModule 的挂载中间件负责，此处留空以便后续加中间件
  }
}
