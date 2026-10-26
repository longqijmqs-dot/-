import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ErrorCode } from '@app/contract';
import { AppError } from '../common/app-error';
import { Public } from '../auth/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@ApiTags('系统')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: '健康检查：返回服务、数据库与 Redis 状态' })
  async check(): Promise<{ status: string; components: Record<string, string> }> {
    const [database, redis] = await Promise.all([this.prisma.ping(), this.redis.ping()]);
    const components = {
      database: database ? 'up' : 'down',
      redis: redis ? 'up' : 'down',
    };

    if (!database || !redis) {
      // 503 + 明确指出是哪个组件挂了，容器探针和人都能立刻看懂
      throw new AppError(ErrorCode.INTERNAL_ERROR, 503, '依赖组件不可用', { components });
    }

    return { status: 'ok', components };
  }
}
