import { z } from 'zod';
import { createEnvelopeSchema, fail, isSuccess, ok, type Envelope } from '../envelope';
import { ErrorCode } from '../error-codes';

describe('响应信封', () => {
  it('ok() 产出 code 0 且 data 非空', () => {
    const env = ok({ id: '1' }, 'req-1');
    expect(env).toEqual({
      code: 0,
      message: '成功',
      data: { id: '1' },
      requestId: 'req-1',
    });
  });

  it('fail() 默认取错误码登记的中文文案', () => {
    const env = fail(ErrorCode.EMAIL_CONFLICT, 'req-2');
    expect(env.code).toBe(40901);
    expect(env.message).toBe('该邮箱已被注册');
    expect(env.data).toBeNull();
    expect(env.requestId).toBe('req-2');
  });

  it('fail() 可覆盖文案但保留业务码', () => {
    const env = fail(ErrorCode.VALIDATION_FAILED, 'req-3', '邮箱不能为空');
    expect(env.message).toBe('邮箱不能为空');
    expect(env.code).toBe(10001);
  });

  it('schema 能解析合法信封，拒绝缺 requestId 的响应', () => {
    const schema = createEnvelopeSchema(z.object({ id: z.string() }));
    const valid = { code: 0, message: '成功', data: { id: '1' }, requestId: 'r' };
    expect(schema.safeParse(valid).success).toBe(true);

    const missingRequestId = { code: 0, message: '成功', data: { id: '1' } };
    expect(schema.safeParse(missingRequestId).success).toBe(false);
  });

  it('schema 允许失败时 data 为 null', () => {
    const schema = createEnvelopeSchema(z.object({ id: z.string() }));
    const failed = { code: 40401, message: '不存在', data: null, requestId: 'r' };
    expect(schema.safeParse(failed).success).toBe(true);
  });

  it('isSuccess 收窄类型：成功时 data 不再是 null', () => {
    const env: Envelope<{ id: string }> = ok({ id: '7' }, 'r');
    if (isSuccess(env)) {
      // 这一行能通过类型检查，说明收窄生效（data 已不是 null）
      expect(env.data.id).toBe('7');
    } else {
      throw new Error('应当判定为成功');
    }
  });

  it('isSuccess 对失败响应返回 false', () => {
    expect(isSuccess(fail(ErrorCode.UNAUTHORIZED, 'r'))).toBe(false);
  });
});
