import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ClsService } from 'nestjs-cls';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { logger } from './common/logger';
import { TransformInterceptor } from './common/transform.interceptor';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: false });
  const config = app.get(ConfigService);
  const cls = app.get(ClsService);

  app.setGlobalPrefix('api');

  // refresh token 走 httpOnly Cookie，必须解析 cookie
  app.use(cookieParser());

  app.enableCors({
    origin: config.get<string>('CORS_ORIGIN'),
    credentials: true,
  });

  app.useGlobalInterceptors(new TransformInterceptor(cls));
  app.useGlobalFilters(new AllExceptionsFilter(cls));

  // 优雅退出：收到 SIGTERM 时触发 onModuleDestroy，释放连接
  app.enableShutdownHooks();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('AI 对话平台 API')
    .setDescription('统一响应结构 { code, message, data, requestId }；认证使用 Bearer access token')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = config.get<number>('PORT') ?? 3000;
  await app.listen(port);
  logger.info({ port, docs: `http://localhost:${port}/api/docs` }, 'API 已启动');
}

bootstrap().catch((error: unknown) => {
  // 注意顺序：pino 是异步缓冲写，若先 process.exit 会把日志丢掉。
  // 用同步的 console.error 兜底，保证启动失败时一定能看到原因。
  console.error('[bootstrap] API 启动失败：', error);
  logger.fatal({ err: error }, 'API 启动失败');
  process.exitCode = 1;
  // 给 pino 一点时间把 fatal 写出去
  setTimeout(() => process.exit(1), 100);
});
