import { z } from 'zod';

/**
 * 文件管理契约（PRD 6.6 / 7.4）。
 *
 * File 表存文件元数据，文件本身在磁盘上。
 * storedName 用 UUID，originalName 只用于展示。
 */

/**
 * File 表记录。
 *
 * 与消息附件（Attachment）的区别：
 *   - Attachment 是消息的一部分，存 JSON 数组，用于展示和 AI 读取
 *   - File 是独立文件管理，存数据库表，用于列表/下载/删除等管理操作
 *   - 两者可以关联：上传时先写 File 表，再把附件引用放进消息
 */
export const FileSchema = z.object({
  id: z.string(),
  userId: z.string(),
  /** 可空：文件可以独立上传，不关联会话 */
  conversationId: z.string().nullable(),
  originalName: z.string(),
  /** UUID + 扩展名，防止冲突和路径遍历 */
  storedName: z.string(),
  /** 访问路径，如 /api/files/<id>/download */
  url: z.string(),
  sizeBytes: z.number().int().positive(),
  mimeType: z.string(),
  createdAt: z.string(),
});

export type File = z.infer<typeof FileSchema>;

/** 文件列表项（列表接口返回，不含文件内容） */
export const FileListItemSchema = FileSchema;

export type FileListItem = z.infer<typeof FileListItemSchema>;

/** 分页文件列表响应 */
export const FileListResponseSchema = z.object({
  items: z.array(FileListItemSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});

export type FileListResponse = z.infer<typeof FileListResponseSchema>;

/** 上传文件响应（与 Attachment 结构一致，但语义不同：这是 File 表记录） */
export const UploadFileResponseSchema = FileSchema;

export type UploadFileResponse = z.infer<typeof UploadFileResponseSchema>;

/** 删除文件响应 */
export const DeleteFileResponseSchema = z.object({
  id: z.string(),
  deleted: z.literal(true),
});

export type DeleteFileResponse = z.infer<typeof DeleteFileResponseSchema>;

/** 下载/预览响应：不返回 JSON，直接流式返回文件内容 */
