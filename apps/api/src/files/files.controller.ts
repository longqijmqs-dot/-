import {
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import multer from 'multer';
import { ErrorCode } from '@app/contract';
import { AppError } from '../common/app-error';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequestUser } from '../auth/auth.types';
import { UploadsService } from '../uploads/uploads.service';
import { FilesService } from './files.service';

/**
 * 文件管理控制器（PRD 7.4）。
 *
 * 接口：
 *   POST   /api/files        上传（同时创建 File 表记录）
 *   GET    /api/files        列表（分页 + 会话过滤）
 *   GET    /api/files/:id    下载/预览
 *   DELETE /api/files/:id    删除（先删磁盘再删记录）
 *
 * 鉴权：
 *   所有接口走全局 JwtAuthGuard（需要登录）。
 *   下载/删除额外做归属校验（非所有者 403）。
 */
@ApiTags('文件管理')
@ApiBearerAuth()
@Controller('files')
export class FilesController {
  private readonly logger = new Logger(FilesController.name);

  constructor(
    private readonly filesService: FilesService,
    private readonly uploadsService: UploadsService,
  ) {}

  /**
   * 上传文件。
   *
   * 与旧的 POST /api/uploads 的区别：
   *   - 旧接口只存磁盘，返回附件信息
   *   - 新接口同时写 File 表记录，返回完整的 File DTO
   *   旧接口保留给消息附件使用（附件是消息的一部分，不需要独立管理）
   */
  @Post()
  @ApiOperation({ summary: '上传文件并创建 File 记录' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary', description: '要上传的文件（最大 10MB）' },
        conversationId: { type: 'string', description: '可选，关联会话 ID' },
      },
      required: ['file'],
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: multer.memoryStorage(),
      defParamCharset: 'utf8',
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, callback) => {
        // 复用 UploadsController 的白名单逻辑
        // 简单检查：拒绝明显危险的类型
        const dangerous = ['application/x-msdownload', 'application/x-executable'];
        if (dangerous.includes(file.mimetype)) {
          callback(
            AppError.badRequest(ErrorCode.VALIDATION_FAILED, `不支持的文件类型：${file.mimetype}`),
            false,
          );
        } else {
          callback(null, true);
        }
      },
    }),
  )
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: RequestUser,
  ) {
    if (!file) {
      throw AppError.badRequest(ErrorCode.VALIDATION_FAILED, '没有收到文件');
    }

    // 保存到磁盘
    const attachment = await this.uploadsService.saveFile(
      file.buffer,
      file.originalname,
      file.mimetype,
    );

    // 创建 File 表记录
    const fileId = await this.filesService.createRecord(
      String(user.id),
      null, // 文件管理接口暂不支持关联会话（后续可加）
      attachment,
    );

    return {
      ...attachment,
      id: fileId, // 用 File 表 ID 替换附件 UUID
    };
  }

  /**
   * 文件列表。
   *
   * GET /api/files?page=1&pageSize=20&conversationId=<可选>
   */
  @Get()
  @ApiOperation({ summary: '文件列表（分页 + 会话过滤）' })
  @ApiQuery({ name: 'page', required: false, schema: { type: 'integer', minimum: 1, default: 1 } })
  @ApiQuery({ name: 'pageSize', required: false, schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } })
  @ApiQuery({ name: 'conversationId', required: false, schema: { type: 'string' } })
  async list(@CurrentUser() user: RequestUser, @Query() query: { page?: string; pageSize?: string; conversationId?: string }) {
    return this.filesService.listFiles(String(user.id), {
      page: Number(query.page ?? 1),
      pageSize: Number(query.pageSize ?? 20),
      conversationId: query.conversationId,
    });
  }

  /**
   * 下载/预览文件。
   *
   * 图片和 PDF 支持在线预览（Content-Disposition: inline），
   * 其他类型强制下载（Content-Disposition: attachment）。
   */
  @Get(':id')
  @ApiOperation({ summary: '下载/预览文件' })
  async download(@Param('id') id: string, @CurrentUser() user: RequestUser, @Res() res: Response) {
    const result = await this.filesService.getFileForDownload(id, String(user.id), user.role === 'admin');

    // 设置 Content-Type
    res.setHeader('Content-Type', result.record.mimeType);

    // Content-Disposition：inline 在线预览，attachment 强制下载
    const disposition = result.contentDisposition;
    const filename = encodeURIComponent(result.record.originalName);
    res.setHeader('Content-Disposition', `${disposition}; filename="${filename}"`);

    // 流式返回文件内容
    const { createReadStream } = await import('node:fs');
    const stream = createReadStream(result.diskPath);
    stream.pipe(res);
  }

  /**
   * 删除文件。
   *
   * 顺序：先删磁盘 → 再删记录。
   * 磁盘删除失败不阻塞记录删除（孤儿文件后续扫描清理）。
   */
  @Delete(':id')
  @ApiOperation({ summary: '删除文件（同步清理磁盘）' })
  async remove(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    await this.filesService.deleteFile(id, String(user.id), user.role === 'admin');
    return { id, deleted: true };
  }
}
