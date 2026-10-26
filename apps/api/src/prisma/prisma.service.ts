import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { logger } from '../common/logger';

/**
 * Prisma 客户端封装。
 *
 * 用 Nest 的生命周期钩子管理连接：启动时连、退出时断。
 * 不这么做的话，容器重启/热更新时连接会一直挂着，MySQL 侧很快打满
 * `max_connections`——这是开发期最常见的「越跑越卡」原因。
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super();
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    logger.info('数据库已连接');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    logger.info('数据库连接已释放');
  }

  /** 健康检查用：能跑通一条最轻的查询就算健康 */
  async ping(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      logger.error({ err: error }, '数据库健康检查失败');
      return false;
    }
  }
}
