import { z } from 'zod';

/**
 * 分页契约。
 *
 * 两种场景，两种翻页方式，不要混用：
 *
 * 1) 列表（会话、文件、后台用户）：页码翻页 page/pageSize
 *    —— 数据量有限，用户会「跳到第 3 页」。
 *
 * 2) 聊天记录：游标翻页 before/limit
 *    —— 用户永远是「往上翻旧消息」，而且新消息随时插入，用页码会翻页错乱。
 */
export const PageQuerySchema = z.object({
  // coerce：URL 里传过来的是字符串 "2"，先转成数字再校验
  page: z.coerce.number().int().min(1, '页码从 1 开始').default(1),
  pageSize: z.coerce.number().int().min(1).max(100, '每页最多 100 条').default(20),
});

export type PageQuery = z.infer<typeof PageQuerySchema>;

export interface PageResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

/** 由总条数与查询参数算出 hasMore，避免每个列表接口各写一遍。 */
export function buildPageResult<T>(items: T[], total: number, query: PageQuery): PageResult<T> {
  return {
    items,
    page: query.page,
    pageSize: query.pageSize,
    total,
    hasMore: query.page * query.pageSize < total,
  };
}

export const CursorQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  // before 是「从哪条消息往前翻」，首次加载不传
  before: z.coerce.number().int().positive().optional(),
});

export type CursorQuery = z.infer<typeof CursorQuerySchema>;

export interface CursorResult<T> {
  /** 时间升序排列，前端直接渲染，无需再 reverse */
  items: T[];
  /**
   * 下一页的游标；为 null 表示已经到最早一条。
   * 用 string 而不是 number：消息 id 是 BIGINT，超过 2^53 会丢精度。
   */
  nextCursor: string | null;
}
