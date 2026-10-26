import pino from 'pino';

/**
 * 结构化日志。
 *
 * 三条铁律：
 * 1. 永远输出 JSON（生产被采集器解析），本地想好看就开 pino-pretty
 * 2. 敏感字段一律脱敏，密码不能进日志——出了事日志是要给人看的
 * 3. requestId 必须带上，否则报错时无法把多行日志串成「一次请求」
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      '*.password',
      'passwordHash',
      '*.passwordHash',
      'accessToken',
      '*.accessToken',
      'refreshToken',
      '*.refreshToken',
    ],
    censor: '***',
  },
  transport:
    process.env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss.l' } }
      : undefined,
});
