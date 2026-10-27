import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UploadsService } from '../uploads/uploads.service';
import { AppError } from '../common/app-error';
import { ErrorCode } from '@app/contract';
import * as path from 'node:path';

/**
 * 文件管理服务（PRD 4.4 / 7.4）。
 *
 * 职责：
 *   1. 文件列表（分页 + 会话过滤 + 归属校验）
 *   2. 文件下载/预览（归属校验 + 流式返回）
 *   3. 文件删除（先删磁盘再删记录）
 *   4. 上传时创建 File 表记录
 *
 * 与 UploadsService 的关系：
 *   - UploadsService 负责磁盘读写（saveFile/deleteFile/extractText）
 *   - FilesService 负责数据库元数据管理 + 业务逻辑
 *   - 上传流程：UploadsController → UploadsService.saveFile（磁盘）→ FilesService.createRecord（数据库）
 */
@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
    private readonly config: ConfigService,
  ) {}

  /**
   * 上传时创建 File 表记录。
   *
   * @param userId 上传者 ID
   * @param conversationId 可选，关联会话 ID
   * @param attachment 附件信息（由 UploadsService.saveFile 返回）
   * @returns File 表记录 ID（BigInt 转 string）
   */
  async createRecord(
    userId: string,
    conversationId: string | null,
    attachment: { id: string; name: string; size: number; mimeType: string; url: string },
  ): Promise<string> {
    const record = await this.prisma.file.create({
      data: {
        userId: BigInt(userId),
        conversationId: conversationId ? BigInt(conversationId) : null,
        originalName: attachment.name,
        storedName: path.basename(attachment.url),
        url: attachment.url,
        sizeBytes: attachment.size,
        mimeType: attachment.mimeType,
      },
    });
    return String(record.id);
  }

  /**
   * 按 ID 获取单个文件的完整 DTO。
   *
   * 上传接口写库后调用它返回完整 File 记录，
   * 而不是只返回附件信息（缺 userId / originalName / sizeBytes 等字段）。
   */
  async getFileById(fileId: string) {
    const record = await this.prisma.file.findUnique({
      where: { id: BigInt(fileId) },
    });

    if (!record) {
      throw new NotFoundException('文件不存在');
    }

    return this.toFileDto(record);
  }

  /**
   * 文件列表（分页 + 会话过滤）。
   *
   * @param userId 当前用户 ID（用于归属校验）
   * @param query 分页参数和可选的会话过滤
   */
  async listFiles(
    userId: string,
    query: { page: number; pageSize: number; conversationId?: string },
  ) {
    const where: Prisma.FileWhereInput = { userId: BigInt(userId) };

    // 按会话过滤（可选）
    if (query.conversationId) {
      where.conversationId = BigInt(query.conversationId);
    }

    // 分页：先查总数，再查当前页
    const [total, items] = await Promise.all([
      this.prisma.file.count({ where }),
      this.prisma.file.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    // 转换 BigInt → string（JSON 安全）
    return {
      items: items.map((f) => this.toFileDto(f)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /**
   * 获取文件用于下载/预览。
   *
   * 归属校验：只有文件所有者（或 admin）才能下载。
   *
   * @param fileId 文件 ID
   * @param requesterId 请求者 ID
   * @returns 文件元数据 + 磁盘路径 + Content-Disposition
   */
  async getFileForDownload(
    fileId: string,
    requesterId: string,
    isAdmin: boolean,
  ): Promise<{
    record: { id: string; originalName: string; storedName: string; mimeType: string; url: string };
    diskPath: string;
    contentDisposition: 'inline' | 'attachment';
  }> {
    const record = await this.prisma.file.findUnique({
      where: { id: BigInt(fileId) },
    });

    if (!record) {
      throw new NotFoundException('文件不存在');
    }

    // 归属校验：不是所有者且不是 admin → 403
    const isOwner = String(record.userId) === requesterId;
    if (!isOwner && !isAdmin) {
      throw AppError.forbidden(ErrorCode.NOT_OWNER, '无权访问该文件');
    }

    // 获取磁盘路径
    const diskPath = await this.uploads.getFilePath(record.storedName);

    // 判断是在线预览还是强制下载
    // 图片和 PDF 支持在线预览，其他类型强制下载
    const isPreviewable =
      record.mimeType.startsWith('image/') || record.mimeType === 'application/pdf';
    const contentDisposition = isPreviewable ? 'inline' : 'attachment';

    return {
      record: {
        id: String(record.id),
        originalName: record.originalName,
        storedName: record.storedName,
        mimeType: record.mimeType,
        url: record.url,
      },
      diskPath,
      contentDisposition,
    };
  }

  /**
   * 删除文件。
   *
   * 顺序：先删磁盘，再删记录。
   * 如果磁盘删除失败（文件不存在等），仍然继续删记录（磁盘文件可能是孤儿，
   * 后续可以通过扫描任务清理）。
   *
   * @param fileId 文件 ID
   * @param requesterId 请求者 ID
   * @param isAdmin 是否 admin
   */
  async deleteFile(fileId: string, requesterId: string, isAdmin: boolean): Promise<void> {
    const record = await this.prisma.file.findUnique({
      where: { id: BigInt(fileId) },
    });

    if (!record) {
      throw new NotFoundException('文件不存在');
    }

    // 归属校验
    const isOwner = String(record.userId) === requesterId;
    if (!isOwner && !isAdmin) {
      throw AppError.forbidden(ErrorCode.NOT_OWNER, '无权删除该文件');
    }

    // 先删磁盘
    try {
      await this.uploads.deleteFile(record.url);
      this.logger.log(`磁盘文件已删除: ${record.storedName}`);
    } catch (error) {
      // 磁盘删除失败不阻塞记录删除（可能是孤儿文件，后续扫描清理）
      this.logger.warn(
        { err: error, storedName: record.storedName },
        '磁盘文件删除失败，继续删除数据库记录',
      );
    }

    // 再删记录
    await this.prisma.file.delete({ where: { id: BigInt(fileId) } });
    this.logger.log(`文件记录已删除: id=${fileId}`);
  }

  /** 转换 Prisma File 记录为 DTO（BigInt → string） */
  private toFileDto(f: {
    id: bigint;
    userId: bigint;
    conversationId: bigint | null;
    originalName: string;
    storedName: string;
    url: string;
    sizeBytes: bigint;
    mimeType: string;
    createdAt: Date;
  }) {
    return {
      id: String(f.id),
      userId: String(f.userId),
      conversationId: f.conversationId ? String(f.conversationId) : null,
      originalName: f.originalName,
      storedName: f.storedName,
      url: f.url,
      sizeBytes: Number(f.sizeBytes),
      mimeType: f.mimeType,
      createdAt: f.createdAt.toISOString(),
    };
  }
}
