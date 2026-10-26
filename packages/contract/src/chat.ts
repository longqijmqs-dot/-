import { z } from 'zod';

/**
 * 会话与消息的契约。
 *
 * 注意 `id` 一律用 string：数据库里是 BigInt，序列化成 JSON 会丢精度
 * （JS 的 number 只能安全表示到 2^53）。
 */

export const MessageRoleSchema = z.enum(['user', 'assistant']);
export type MessageRole = z.infer<typeof MessageRoleSchema>;

/**
 * 消息状态机：
 *   streaming   —— 正在生成（占位已建，内容还在增长）
 *   complete    —— 正常结束
 *   interrupted —— 客户端断开，保留了已生成的部分
 *   failed      —— 上游出错，保留了已生成的部分
 */
export const MessageStatusSchema = z.enum(['streaming', 'complete', 'interrupted', 'failed']);
export type MessageStatus = z.infer<typeof MessageStatusSchema>;

export const MessageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  role: MessageRoleSchema,
  content: z.string(),
  status: MessageStatusSchema,
  model: z.string().nullable(),
  tokenCount: z.number().int().nullable(),
  clientMessageId: z.string().nullable(),
  createdAt: z.string(),
  finishedAt: z.string().nullable(),
});

export type Message = z.infer<typeof MessageSchema>;

export const ConversationSchema = z.object({
  id: z.string(),
  title: z.string(),
  isArchived: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Conversation = z.infer<typeof ConversationSchema>;

/** 详情比列表多两个统计字段，用于侧栏显示「N 条消息」 */
export const ConversationDetailSchema = ConversationSchema.extend({
  messageCount: z.number().int(),
  lastMessageAt: z.string().nullable(),
});

export type ConversationDetail = z.infer<typeof ConversationDetailSchema>;

export const CreateConversationSchema = z.object({
  title: z.string().trim().min(1, '标题不能为空').max(128, '标题最多 128 字').optional(),
});

export type CreateConversationInput = z.infer<typeof CreateConversationSchema>;

export const UpdateConversationSchema = z
  .object({
    title: z.string().trim().min(1, '标题不能为空').max(128, '标题最多 128 字').optional(),
    isArchived: z.boolean().optional(),
  })
  .refine((value) => value.title !== undefined || value.isArchived !== undefined, {
    message: '至少要提供 title 或 isArchived 之一',
  });

export type UpdateConversationInput = z.infer<typeof UpdateConversationSchema>;

export const ConversationListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  // 查询串里是字符串，转成布尔
  archived: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

export type ConversationListQuery = z.infer<typeof ConversationListQuerySchema>;

/** 历史消息：游标分页，不是页码 */
export const MessageListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  before: z.coerce.number().int().positive().optional(),
});

export type MessageListQuery = z.infer<typeof MessageListQuerySchema>;

export const SendMessageSchema = z.object({
  content: z.string().trim().min(1, '消息不能为空').max(8000, '单条消息最多 8000 字'),
  /**
   * 幂等键：客户端为每条用户消息生成一次 UUID，重试时复用同一个。
   * 后端靠它去重，避免「网络抖动重试 → 两条一样的消息」。
   */
  clientMessageId: z.string().uuid('clientMessageId 必须是 UUID'),
});

export type SendMessageInput = z.infer<typeof SendMessageSchema>;

export const CursorPageSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
  });
