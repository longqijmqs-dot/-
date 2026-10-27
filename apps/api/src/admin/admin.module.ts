import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

/**
 * 后台管理模块（PRD 7.5）。
 *
 * 提供用户管理、角色列表、平台统计能力。
 * 所有接口通过 RolesGuard 限制仅 admin 角色可访问。
 */
@Module({
  imports: [PrismaModule, RedisModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
