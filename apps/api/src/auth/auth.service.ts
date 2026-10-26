import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { hash, verify } from '@node-rs/bcrypt';
import { Prisma, type Role, type User } from '@prisma/client';
import type { SignOptions } from 'jsonwebtoken';
import {
  ErrorCode,
  type LoginInput,
  type PublicUser,
  type RegisterInput,
  type RoleCode,
} from '@app/contract';
import { AppError } from '../common/app-error';
import { parseDurationToSeconds } from '../common/duration';
import { logger } from '../common/logger';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import type { AccessTokenPayload, RefreshTokenPayload } from './auth.types';

type UserWithRole = User & { role: Role };

export interface IssuedTokens {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshTtlSeconds: number;
}

export interface LoginOutcome extends IssuedTokens {
  user: PublicUser;
}

@Injectable()
export class AuthService {
  private readonly rounds: number;
  private readonly accessSecret: string;
  private readonly refreshSecret: string;
  private readonly accessTtl: string;
  private readonly refreshTtl: string;

  /** 用于防「通过响应时间判断邮箱是否存在」的假哈希，懒加载一次 */
  private dummyHash?: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {
    this.rounds = this.config.get<number>('BCRYPT_ROUNDS') ?? 12;
    this.accessSecret = this.config.get<string>('JWT_ACCESS_SECRET') ?? '';
    this.refreshSecret = this.config.get<string>('JWT_REFRESH_SECRET') ?? '';
    this.accessTtl = this.config.get<string>('JWT_ACCESS_TTL') ?? '15m';
    this.refreshTtl = this.config.get<string>('JWT_REFRESH_TTL') ?? '7d';
  }

  // ---------------------------------------------------------------- 注册

  async register(input: RegisterInput): Promise<PublicUser> {
    const role = await this.prisma.role.findUnique({ where: { code: 'user' } });
    if (!role) {
      throw new AppError(ErrorCode.INTERNAL_ERROR, 500, '系统角色未初始化，请先执行 pnpm db:seed');
    }

    const passwordHash = await hash(input.password, this.rounds);

    try {
      const user = await this.prisma.user.create({
        data: {
          email: input.email,
          passwordHash,
          nickname: input.nickname ?? null,
          roleId: role.id,
        },
        include: { role: true },
      });
      logger.info({ userId: String(user.id) }, '新用户注册');
      return toPublicUser(user);
    } catch (error) {
      // 并发注册同一邮箱时，唯一索引会抛 P2002——这比先查再插更可靠
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw AppError.conflict(ErrorCode.EMAIL_CONFLICT);
      }
      throw error;
    }
  }

  // ---------------------------------------------------------------- 登录

  async login(input: LoginInput): Promise<LoginOutcome> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
      include: { role: true },
    });

    // 用户不存在时也跑一次哈希比对，让响应耗时与「密码错误」一致，
    // 否则攻击者能靠计时探测出哪些邮箱已注册
    if (!user) {
      await this.consumeDummyHash(input.password);
      throw invalidCredentials();
    }

    const passwordOk = await verify(input.password, user.passwordHash);
    if (!passwordOk) {
      throw invalidCredentials();
    }

    if (user.status !== 1) {
      throw AppError.unauthorized(ErrorCode.ACCOUNT_DISABLED);
    }

    const tokens = await this.issueTokens(user);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    logger.info({ userId: String(user.id) }, '用户登录成功');
    return { ...tokens, user: toPublicUser(user) };
  }

  // ---------------------------------------------------------------- 刷新

  async refresh(rawRefreshToken: string | undefined): Promise<LoginOutcome> {
    if (!rawRefreshToken) {
      throw AppError.unauthorized(ErrorCode.REFRESH_INVALID);
    }

    let payload: RefreshTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<RefreshTokenPayload>(rawRefreshToken, {
        secret: this.refreshSecret,
      });
    } catch {
      throw AppError.unauthorized(ErrorCode.REFRESH_INVALID);
    }

    if (payload.type !== 'refresh' || !payload.jti) {
      throw AppError.unauthorized(ErrorCode.REFRESH_INVALID);
    }

    const userId = await this.redis.getRefreshTokenUserId(payload.jti);

    // 白名单里没有这张票据 → 要么已登出，要么是「旧票据被重放」
    if (!userId || userId !== payload.sub) {
      logger.warn({ userId: payload.sub, jti: payload.jti }, '检测到 refresh token 复用，吊销该用户全部票据');
      await this.redis.revokeAllRefreshTokens(payload.sub);
      throw AppError.unauthorized(ErrorCode.REFRESH_INVALID);
    }

    const user = await this.prisma.user.findUnique({
      where: { id: BigInt(userId) },
      include: { role: true },
    });

    if (!user || user.status !== 1) {
      await this.redis.revokeAllRefreshTokens(userId);
      throw AppError.unauthorized(ErrorCode.ACCOUNT_DISABLED);
    }

    // 轮换：旧票据立刻作废，再签新的
    await this.redis.deleteRefreshToken(payload.jti, userId);
    const tokens = await this.issueTokens(user);

    return { ...tokens, user: toPublicUser(user) };
  }

  // ---------------------------------------------------------------- 登出

  async logout(rawRefreshToken: string | undefined): Promise<void> {
    if (!rawRefreshToken) {
      return; // 幂等：没票据也返回成功
    }
    try {
      const payload = await this.jwt.verifyAsync<RefreshTokenPayload>(rawRefreshToken, {
        secret: this.refreshSecret,
      });
      if (payload.jti) {
        await this.redis.deleteRefreshToken(payload.jti, payload.sub);
      }
    } catch {
      // 票据本身无效就没有「吊销」可言，静默成功
    }
  }

  // ---------------------------------------------------------------- 当前用户

  async me(userId: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: BigInt(userId) },
      include: { role: true },
    });
    if (!user) {
      throw AppError.notFound(ErrorCode.NOT_FOUND, '用户不存在');
    }
    return toPublicUser(user);
  }

  // ---------------------------------------------------------------- 内部

  private async issueTokens(user: UserWithRole): Promise<IssuedTokens> {
    const userId = String(user.id);
    const jti = randomUUID();

    const accessPayload: AccessTokenPayload = {
      sub: userId,
      role: user.role.code as RoleCode,
      type: 'access',
    };
    const refreshPayload: RefreshTokenPayload = { sub: userId, jti, type: 'refresh' };

    const accessToken = await this.jwt.signAsync(accessPayload, {
      secret: this.accessSecret,
      expiresIn: this.accessTtl as SignOptions['expiresIn'],
    });
    const refreshToken = await this.jwt.signAsync(refreshPayload, {
      secret: this.refreshSecret,
      expiresIn: this.refreshTtl as SignOptions['expiresIn'],
    });

    const refreshTtlSeconds = parseDurationToSeconds(this.refreshTtl);
    await this.redis.saveRefreshToken(jti, userId, refreshTtlSeconds);

    return {
      accessToken,
      expiresIn: parseDurationToSeconds(this.accessTtl),
      refreshToken,
      refreshTtlSeconds,
    };
  }

  private async consumeDummyHash(password: string): Promise<void> {
    this.dummyHash ??= hash('dummy-password-for-timing-equalisation', this.rounds);
    try {
      await verify(password, await this.dummyHash);
    } catch {
      // 仅为了消耗时间，结果无所谓
    }
  }
}

function invalidCredentials(): AppError {
  return AppError.unauthorized(ErrorCode.UNAUTHORIZED, '邮箱或密码不正确');
}

function toPublicUser(user: UserWithRole): PublicUser {
  return {
    id: String(user.id),
    email: user.email,
    nickname: user.nickname,
    role: user.role.code as RoleCode,
    status: user.status,
    createdAt: user.createdAt.toISOString(),
  };
}
