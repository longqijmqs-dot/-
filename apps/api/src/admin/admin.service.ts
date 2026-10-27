import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { AppError } from '../common/app-error';
import { ErrorCode } from '@app/contract';

/**
 * 后台管理服务（PRD 4.5 / 7.5）。
 *
 * 职责：
 *   1. 用户列表（分页 + 搜索）
 *   2. 启用/禁用用户（写 Redis 标记，禁用即时生效）
 *   3. 角色列表
 *   4. 平台统计
 *
 * 禁用语义（PRD 验收标准 2）：
 *   禁用用户后，其已签发的 token 访问接口立即返回 401。
 *   实现方式：JwtAuthGuard 每个请求检查 Redis 的 `user:disabled:{userId}` 标记。
 */
@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * 用户列表（分页 + 搜索）。
   *
   * 搜索匹配邮箱或昵称（LIKE，不区分大小写）。
   * 返回时附带角色代码（通过 Role 表 join）。
   */
  async listUsers(query: { page: number; pageSize: number; keyword?: string }) {
    const where: Prisma.UserWhereInput = {};

    // 关键词搜索：邮箱或昵称包含关键词
    // MySQL 的 utf8mb4_unicode_ci 排序规则本身大小写不敏感，
    // 所以不需要 mode: 'insensitive'（那是 PostgreSQL 的特性）
    if (query.keyword && query.keyword.trim()) {
      const keyword = query.keyword.trim();
      where.OR = [
        { email: { contains: keyword } },
        { nickname: { contains: keyword } },
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        include: { role: true },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    return {
      items: items.map((u) => ({
        id: String(u.id),
        email: u.email,
        nickname: u.nickname,
        roleCode: u.role.code as 'admin' | 'user',
        status: u.status,
        lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
        createdAt: u.createdAt.toISOString(),
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /**
   * 更新用户状态（启用/禁用）。
   *
   * @param targetUserId 目标用户 ID
   * @param status 1 = 启用，0 = 禁用
   * @param adminId 执行操作的 admin ID（用于防止禁用自己）
   */
  async updateUserStatus(
    targetUserId: string,
    status: 0 | 1,
    adminId: string,
  ): Promise<{ id: string; status: number }> {
    // 防止禁用自己
    if (String(targetUserId) === adminId && status === 0) {
      throw AppError.badRequest(ErrorCode.VALIDATION_FAILED, '不允许禁用自己的账号');
    }

    // 验证目标用户存在
    const targetUser = await this.prisma.user.findUnique({
      where: { id: BigInt(targetUserId) },
      select: { id: true, status: true },
    });

    if (!targetUser) {
      throw new NotFoundException('用户不存在');
    }

    // 更新数据库
    await this.prisma.user.update({
      where: { id: BigInt(targetUserId) },
      data: { status },
    });

    // 同步 Redis 标记
    if (status === 0) {
      await this.redis.markUserDisabled(targetUserId);
      await this.redis.revokeAllRefreshTokens(targetUserId); // 同时吊销 refresh token
      this.logger.log(`用户已禁用: ${targetUserId}（Redis 标记已写入）`);
    } else {
      await this.redis.clearUserDisabled(targetUserId);
      this.logger.log(`用户已启用: ${targetUserId}（Redis 标记已清除）`);
    }

    return { id: targetUserId, status };
  }

  /**
   * 角色列表。
   */
  async listRoles() {
    const roles = await this.prisma.role.findMany({
      orderBy: { id: 'asc' },
    });

    return {
      items: roles.map((r) => ({
        id: String(r.id),
        code: r.code,
        name: r.name,
        permissions: r.permissions,
      })),
    };
  }

  /**
   * 平台统计。
   *
   * 用 Prisma 的 count 聚合，不做全表扫描（PRD 性能要求）。
   */
  async getStats() {
    const [userCount, conversationCount, messageCount, aiCallCount] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.conversation.count(),
      this.prisma.message.count(),
      this.prisma.message.count({ where: { role: 'assistant' } }),
    ]);

    return {
      userCount,
      conversationCount,
      messageCount,
      aiCallCount,
    };
  }
}
