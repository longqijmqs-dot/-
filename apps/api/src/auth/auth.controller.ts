import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  type LoginInput,
  LoginSchema,
  type PublicUser,
  type RegisterInput,
  RegisterSchema,
} from '@app/contract';
import type { Response } from 'express';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import type { RequestUser } from './auth.types';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';

/**
 * refresh token 的 Cookie 名。
 * path 限定为 /api/auth：浏览器只会在调用刷新/登出接口时带上它，
 * 其他接口不会携带，减小暴露面。
 */
export const REFRESH_COOKIE = 'refresh_token';
const REFRESH_COOKIE_PATH = '/api/auth';

@ApiTags('认证')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: '注册（邮箱 + 密码），默认分配 user 角色' })
  async register(
    @Body(new ZodValidationPipe(RegisterSchema)) input: RegisterInput,
  ): Promise<PublicUser> {
    return this.authService.register(input);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: '登录：返回 access token，refresh token 写入 httpOnly Cookie' })
  async login(
    @Body(new ZodValidationPipe(LoginSchema)) input: LoginInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ accessToken: string; expiresIn: number; user: PublicUser }> {
    const outcome = await this.authService.login(input);
    this.setRefreshCookie(res, outcome.refreshToken, outcome.refreshTtlSeconds);
    return { accessToken: outcome.accessToken, expiresIn: outcome.expiresIn, user: outcome.user };
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: '刷新 access token（凭 Cookie 中的 refresh token，票据会轮换）' })
  async refresh(
    @Body() _ignored: unknown,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ accessToken: string; expiresIn: number; user: PublicUser }> {
    const raw = readRefreshCookie(res.req as { cookies?: Record<string, string> });
    const outcome = await this.authService.refresh(raw);
    this.setRefreshCookie(res, outcome.refreshToken, outcome.refreshTtlSeconds);
    return { accessToken: outcome.accessToken, expiresIn: outcome.expiresIn, user: outcome.user };
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  @ApiOperation({ summary: '登出：吊销 refresh token 并清除 Cookie（幂等）' })
  async logout(@Res({ passthrough: true }) res: Response): Promise<{ ok: true }> {
    const raw = readRefreshCookie(res.req as { cookies?: Record<string, string> });
    await this.authService.logout(raw);
    res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
    return { ok: true };
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: '当前登录用户信息' })
  async me(@CurrentUser() user: RequestUser): Promise<PublicUser> {
    return this.authService.me(user.id);
  }

  private setRefreshCookie(res: Response, token: string, ttlSeconds: number): void {
    res.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: this.config.get<string>('NODE_ENV') === 'production',
      sameSite: 'lax',
      path: REFRESH_COOKIE_PATH,
      maxAge: ttlSeconds * 1000,
    });
  }
}

function readRefreshCookie(req: { cookies?: Record<string, string> }): string | undefined {
  return req.cookies?.[REFRESH_COOKIE];
}
