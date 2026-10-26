import { LoginSchema, PublicUserSchema, RegisterSchema } from '../auth';

describe('注册契约', () => {
  it('邮箱被去空格并统一为小写', () => {
    const parsed = RegisterSchema.parse({ email: '  Alice@Example.COM  ', password: '12345678' });
    expect(parsed.email).toBe('alice@example.com');
  });

  it('密码 7 位被拒绝', () => {
    const result = RegisterSchema.safeParse({ email: 'a@b.com', password: '1234567' });
    expect(result.success).toBe(false);
  });

  it('密码 8 位刚好通过', () => {
    expect(RegisterSchema.safeParse({ email: 'a@b.com', password: '12345678' }).success).toBe(true);
  });

  it('密码 65 位被拒绝', () => {
    expect(RegisterSchema.safeParse({ email: 'a@b.com', password: 'x'.repeat(65) }).success).toBe(false);
  });

  it('邮箱格式非法被拒绝', () => {
    expect(RegisterSchema.safeParse({ email: 'not-an-email', password: '12345678' }).success).toBe(false);
  });

  it('昵称可省略', () => {
    expect(RegisterSchema.safeParse({ email: 'a@b.com', password: '12345678' }).success).toBe(true);
  });
});

describe('登录契约', () => {
  it('邮箱同样被规范化', () => {
    expect(LoginSchema.parse({ email: ' Bob@X.com ', password: 'p' }).email).toBe('bob@x.com');
  });

  it('空密码被拒绝（登录不校验长度，交给服务端比对）', () => {
    expect(LoginSchema.safeParse({ email: 'a@b.com', password: '' }).success).toBe(false);
  });
});

describe('用户信息契约', () => {
  it('输出结构里没有 passwordHash 字段', () => {
    const parsed = PublicUserSchema.parse({
      id: '1',
      email: 'a@b.com',
      nickname: null,
      role: 'user',
      status: 1,
      createdAt: '2026-10-26T00:00:00.000Z',
      passwordHash: 'should-be-stripped',
    });
    expect(parsed).not.toHaveProperty('passwordHash');
  });

  it('角色只能是 admin 或 user', () => {
    const base = { id: '1', email: 'a@b.com', nickname: null, status: 1, createdAt: 'x' };
    expect(PublicUserSchema.safeParse({ ...base, role: 'admin' }).success).toBe(true);
    expect(PublicUserSchema.safeParse({ ...base, role: 'superadmin' }).success).toBe(false);
  });
});
