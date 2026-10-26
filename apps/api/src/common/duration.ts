/**
 * 把 '15m' / '7d' / '3600s' 这类时长字符串转成秒。
 *
 * 为什么需要它？JWT 的 expiresIn 和 Redis 的 TTL 是两套单位：
 * 前者认 '15m'，后者认秒。如果两处各写一遍常量，早晚会出现
 * 「token 15 分钟过期，但 Redis 记了 15 秒」这种事故。
 */
export function parseDurationToSeconds(input: string | number): number {
  if (typeof input === 'number') {
    return input;
  }

  const match = /^(\d+)([smhd])$/i.exec(input.trim());
  if (!match) {
    throw new Error(`无法解析时长："${input}"（支持 30s / 15m / 2h / 7d）`);
  }

  const amountText = match[1];
  const unitText = match[2];
  if (amountText === undefined || unitText === undefined) {
    throw new Error(`无法解析时长："${input}"`);
  }

  const unit = unitText.toLowerCase();
  const multiplier = unit === 's' ? 1 : unit === 'm' ? 60 : unit === 'h' ? 3600 : 86_400;
  return Number(amountText) * multiplier;
}
