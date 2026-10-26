import { ErrorCode, ERROR_MESSAGES, isAuthCode, messageFor } from '../error-codes';

describe('错误码表', () => {
  it('码值全局唯一', () => {
    const values = Object.values(ErrorCode);
    expect(new Set(values).size).toBe(values.length);
  });

  it('每个错误码都有中文文案', () => {
    for (const code of Object.values(ErrorCode)) {
      if (!ERROR_MESSAGES[code]) {
        throw new Error(`错误码 ${code} 缺少文案`);
      }
    }
  });

  it('各段码值落在约定区间内', () => {
    const inRange = (code: number, min: number, max: number) => code >= min && code < max;
    expect(ErrorCode.OK).toBe(0);
    expect(inRange(ErrorCode.VALIDATION_FAILED, 10000, 20000)).toBe(true);
    expect(inRange(ErrorCode.UNAUTHORIZED, 20000, 30000)).toBe(true);
    expect(inRange(ErrorCode.TOKEN_EXPIRED, 20000, 30000)).toBe(true);
    expect(inRange(ErrorCode.REFRESH_INVALID, 20000, 30000)).toBe(true);
    expect(inRange(ErrorCode.ACCOUNT_DISABLED, 20000, 30000)).toBe(true);
    expect(inRange(ErrorCode.NOT_OWNER, 30000, 40000)).toBe(true);
    expect(inRange(ErrorCode.ROLE_FORBIDDEN, 30000, 40000)).toBe(true);
    expect(inRange(ErrorCode.NOT_FOUND, 40000, 50000)).toBe(true);
    expect(inRange(ErrorCode.EMAIL_CONFLICT, 40000, 50000)).toBe(true);
    expect(inRange(ErrorCode.RATE_LIMITED, 42000, 43000)).toBe(true);
    expect(inRange(ErrorCode.INTERNAL_ERROR, 50000, 60000)).toBe(true);
  });

  it('认证类判定只认 20xxx', () => {
    expect(isAuthCode(ErrorCode.TOKEN_EXPIRED)).toBe(true);
    expect(isAuthCode(ErrorCode.ROLE_FORBIDDEN)).toBe(false);
    expect(isAuthCode(ErrorCode.OK)).toBe(false);
  });

  it('未登记的错误码返回通用兜底文案', () => {
    expect(messageFor(99999)).toBe('操作失败，请稍后重试');
    expect(messageFor(ErrorCode.EMAIL_CONFLICT)).toBe('该邮箱已被注册');
  });
});
