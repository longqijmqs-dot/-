import {
  Controller,
  Get,
  Logger,
  Patch,
  Param,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequestUser } from '../auth/auth.types';
import { AdminService } from './admin.service';

/**
 * 后台管理控制器（PRD 7.5）。
 *
 * 接口：
 *   GET    /api/admin/users              用户列表（分页 + 搜索）
 *   PATCH  /api/admin/users/:id/status   启用/禁用用户
 *   GET    /api/admin/roles              角色列表
 *   GET    /api/admin/stats              平台统计
 *
 * 鉴权：
 *   所有接口用 @Roles('admin') 限制仅 admin 角色可访问。
 *   RolesGuard 在 JwtAuthGuard 之后执行（依赖 request.user）。
 *
 * 限流：
 *   管理接口单独限流（30 次/分钟），比业务接口（60 次/分钟）更严格，
 *   防止管理后台被暴力探测。
 */
@ApiTags('后台管理')
@ApiBearerAuth()
@Roles('admin')
@Controller('admin')
@Throttle({ default: { limit: 30, ttl: 60_000 } })
export class AdminController {
  private readonly logger = new Logger(AdminController.name);

  constructor(private readonly adminService: AdminService) {}

  /**
   * 用户列表。
   *
   * GET /api/admin/users?page=1&pageSize=20&keyword=zhang
   */
  @Get('users')
  @ApiOperation({ summary: '用户列表（分页 + 搜索）' })
  @ApiQuery({ name: 'page', required: false, schema: { type: 'integer', minimum: 1, default: 1 } })
  @ApiQuery({ name: 'pageSize', required: false, schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } })
  @ApiQuery({ name: 'keyword', required: false, schema: { type: 'string', description: '搜索邮箱或昵称' } })
  async listUsers(@Query() query: { page?: string; pageSize?: string; keyword?: string }) {
    return this.adminService.listUsers({
      page: Number(query.page ?? 1),
      pageSize: Number(query.pageSize ?? 20),
      keyword: query.keyword,
    });
  }

  /**
   * 更新用户状态（启用/禁用）。
   *
   * PATCH /api/admin/users/:id/status
   * Body: { "status": "0" | "1" }
   *
   * 禁用用户时同步写 Redis 标记，保证已签发的 token 立即失效。
   */
  @Patch('users/:id/status')
  @ApiOperation({ summary: '启用/禁用用户（禁用后 token 立即失效）' })
  async updateUserStatus(
    @Param('id') id: string,
    @Query('status') status: string,
    @CurrentUser() user: RequestUser,
  ) {
    // status 是查询参数（简单方案，后续可改为 body）
    const statusNum = status === '1' ? 1 : 0;
    return this.adminService.updateUserStatus(id, statusNum, String(user.id));
  }

  /**
   * 角色列表。
   *
   * GET /api/admin/roles
   */
  @Get('roles')
  @ApiOperation({ summary: '角色列表' })
  async listRoles() {
    return this.adminService.listRoles();
  }

  /**
   * 平台统计。
   *
   * GET /api/admin/stats
   * 返回：userCount, conversationCount, messageCount, aiCallCount
   */
  @Get('stats')
  @ApiOperation({ summary: '平台统计' })
  async getStats() {
    return this.adminService.getStats();
  }
}
