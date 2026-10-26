import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { logger } from '../common/logger';

/**
 * Redis 封装。
 *
 * 本变更用到三类键：
 *   refresh:{jti}           → userId，含 7 天 TTL（refresh token 白名单）
 *   refresh:user:{userId}   → 该用户当前有效的所有 jti 集合（用于「一键全部下线」）
 *   user:disabled:{userId}  → "1"，账号禁用标记（请求级校验，保证禁用立即生效）
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  readonly client: Redis;

  constructor(config: ConfigService) {
    this.client = new Redis(config.get<string>('REDIS_URL') ?? '', {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      // 连不上时不要用无限重试卡住启动，交给健康检查暴露问题
      retryStrategy: (times) => Math.min(times * 200, 2000),
    });
    this.client.on('error', (error) => {
      logger.error({ err: error }, 'Redis 连接异常');
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.client.connect();
      logger.info('Redis 已连接');
    } catch (error) {
      // 不抛出：Redis 短暂不可用时服务仍应能启动，
      // 具体影响由健康检查和各处的降级逻辑承担（见 design.md D5）
      logger.error({ err: error }, 'Redis 首次连接失败，服务继续启动');
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
    logger.info('Redis 连接已释放');
  }

  async ping(): Promise<boolean> {
    try {
      return (await this.client.ping()) === 'PONG';
    } catch (error) {
      logger.error({ err: error }, 'Redis 健康检查失败');
      return false;
    }
  }

  // ---------- refresh token 白名单 ----------

  async saveRefreshToken(jti: string, userId: string, ttlSeconds: number): Promise<void> {
    const userSetKey = `refresh:user:${userId}`;
    await this.client
      .multi()
      .set(`refresh:${jti}`, userId, 'EX', ttlSeconds)
      .sadd(userSetKey, jti)
      .expire(userSetKey, ttlSeconds)
      .exec();
  }

  async getRefreshTokenUserId(jti: string): Promise<string | null> {
    return this.client.get(`refresh:${jti}`);
  }

  async deleteRefreshToken(jti: string, userId?: string): Promise<void> {
    const pipeline = this.client.multi().del(`refresh:${jti}`);
    if (userId) {
      pipeline.srem(`refresh:user:${userId}`, jti);
    }
    await pipeline.exec();
  }

  /** 吊销该用户全部 refresh token（禁用账号 / 检测到票据复用时调用） */
  async revokeAllRefreshTokens(userId: string): Promise<void> {
    const userSetKey = `refresh:user:${userId}`;
    const jtis = await this.client.smembers(userSetKey);
    const pipeline = this.client.multi();
    for (const jti of jtis) {
      pipeline.del(`refresh:${jti}`);
    }
    pipeline.del(userSetKey);
    await pipeline.exec();
  }

  // ---------- 账号禁用标记 ----------

  async markUserDisabled(userId: string): Promise<void> {
    await this.client.set(`user:disabled:${userId}`, '1');
  }

  async clearUserDisabled(userId: string): Promise<void> {
    await this.client.del(`user:disabled:${userId}`);
  }

  async isUserDisabled(userId: string): Promise<boolean> {
    return (await this.client.get(`user:disabled:${userId}`)) === '1';
  }
}
