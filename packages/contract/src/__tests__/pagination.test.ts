import { buildPageResult, CursorQuerySchema, PageQuerySchema } from '../pagination';

describe('分页契约', () => {
  it('缺省时 page=1、pageSize=20', () => {
    const parsed = PageQuerySchema.parse({});
    expect(parsed).toEqual({ page: 1, pageSize: 20 });
  });

  it('字符串参数会被转成数字', () => {
    expect(PageQuerySchema.parse({ page: '2', pageSize: '10' })).toEqual({ page: 2, pageSize: 10 });
  });

  it('page=0 被拒绝，而不是静默修正成 1', () => {
    const result = PageQuerySchema.safeParse({ page: '0' });
    expect(result.success).toBe(false);
  });

  it('pageSize 超过 100 被拒绝', () => {
    expect(PageQuerySchema.safeParse({ pageSize: '500' }).success).toBe(false);
  });

  it('pageSize 为非数字被拒绝', () => {
    expect(PageQuerySchema.safeParse({ pageSize: 'abc' }).success).toBe(false);
  });

  it('hasMore 按「还有没有下一页」计算', () => {
    const q = PageQuerySchema.parse({ page: 2, pageSize: 10 });
    expect(buildPageResult(new Array(10).fill(0), 25, q)).toMatchObject({
      page: 2,
      pageSize: 10,
      total: 25,
      hasMore: true,
    });

    const last = PageQuerySchema.parse({ page: 3, pageSize: 10 });
    expect(buildPageResult(new Array(5).fill(0), 25, last).hasMore).toBe(false);
  });

  it('刚好整除时最后一页的 hasMore 为 false', () => {
    const q = PageQuerySchema.parse({ page: 2, pageSize: 10 });
    expect(buildPageResult(new Array(10).fill(0), 20, q).hasMore).toBe(false);
  });
});

describe('游标契约（聊天记录）', () => {
  it('首次加载没有 before，limit 默认 30', () => {
    expect(CursorQuerySchema.parse({})).toEqual({ limit: 30 });
  });

  it('before 接受正整数', () => {
    expect(CursorQuerySchema.parse({ before: '1024' })).toEqual({ limit: 30, before: 1024 });
  });

  it('before 为 0 或负数时拒绝', () => {
    expect(CursorQuerySchema.safeParse({ before: '0' }).success).toBe(false);
    expect(CursorQuerySchema.safeParse({ before: '-5' }).success).toBe(false);
  });
});
