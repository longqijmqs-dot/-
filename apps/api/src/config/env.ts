import { z } from 'zod';

/**
 * 环境变量校验。
 *
 * 为什么要在启动时校验，而不是用到时再说？
 * 因为「少配一个 JWT 密钥」这类问题，如果拖到第一次登录才暴露，你会以为是业务 bug；
 * 而启动时直接退出、并打印缺了哪个变量，30 秒就能定位。
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_URL: z.string().min(1, '缺少数据库连接串'),
  REDIS_URL: z.string().min(1, '缺少 Redis 连接串'),

  JWT_ACCESS_SECRET: z.string().min(32, 'access token 密钥至少 32 位'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string().min(32, 'refresh token 密钥至少 32 位'),
  JWT_REFRESH_TTL: z.string().default('7d'),

  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),

  CORS_ORIGIN: z.string().default('http://localhost:5173'),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(raw: Record<string, unknown>): Env {
  const parsed = EnvSchema.safeParse(raw);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`环境变量校验失败，请检查 .env：\n${details}`);
  }
  return parsed.data;
}
