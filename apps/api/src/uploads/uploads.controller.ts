import {
  Controller,
  Get,
  Logger,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import multer from 'multer';
import { ErrorCode } from '@app/contract';
import { AppError } from '../common/app-error';
import { Public } from '../auth/decorators/public.decorator';
import { UploadsService } from './uploads.service';

/**
 * 允许上传的 MIME 类型。
 *
 * ⚠️ 这份白名单必须和前端 ChatComposer.vue 里 <input accept> 保持一致。
 * 之前的教训：前端 accept 写了 .csv 和 image/*，后端白名单却只列了
 * 4 种图片格式和几种文本格式。用户选个 .bmp 或 .csv 就被后端 400 拒绝，
 * 而前端又把错误提示藏起来了 —— 表现成「点了上传完全没反应」。
 *
 * 策略：图片整个 image/* 放行（前端 accept 也是 image/*），
 *      其余用明确的扩展名/类型清单。
 */
const ALLOWED_MIME_TYPES = new Set([
  // 文档
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/csv',
  // 代码与结构化文本
  'text/javascript',
  'text/typescript',
  'application/json',
  'text/html',
  'text/css',
  'text/xml',
  'application/xml',
  // Office（accept 里虽未列出，但用户常拖拽，放行更友好）
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  // 压缩包
  'application/zip',
  'application/x-zip-compressed', // Windows Chrome 对 .zip 有时报这个
  'application/x-7z-compressed',
  'application/gzip',
]);

function isAllowedMimeType(mimeType: string): boolean {
  // image/* 全放行：前端 accept 就是 image/*，逐条列举必然漏
  // （漏一个就变成「点了没反应」，这种 bug 极难排查）
  if (mimeType.startsWith('image/')) {
    return true;
  }
  return ALLOWED_MIME_TYPES.has(mimeType);
}

/**
 * 文件上传控制器。
 *
 * 接口：
 *   POST /api/uploads  → 上传文件，返回附件信息（需要登录，走全局 JwtAuthGuard）
 *   GET  /api/uploads/attachments/:filename → 访问文件（公开，见下方说明）
 *
 * 鉴权说明：
 *   项目里 JwtAuthGuard 是全局注册的（见 auth.module.ts 的 APP_GUARD），
 *   所以 POST 上传「默认就要登录」，不需要（也不能）再加 @UseGuards(JwtAuthGuard)——
 *   加了反而会让 Nest 在本模块里局部解析 JwtService，因缺依赖而启动崩溃。
 *   GET 取文件标了 @Public()：因为消息气泡里的 <img src> 和下载链接
 *   是浏览器直接发起的，没法带 Authorization 头。文件名是 UUID，
 *   猜不到别人的文件，安全性可接受（这也是业界常见做法，如聊天软件的图床）。
 *
 * 为什么用 memoryStorage？
 *   multer 有两种存储：diskStorage（直接写磁盘）和 memoryStorage（存内存）。
 *   我们用 memoryStorage，因为：
 *     1. 文件先存内存，校验通过后再由 UploadsService 写磁盘
 *     2. 如果校验失败（类型不对、太大），直接丢弃，不会留垃圾文件
 *     3. 内存存储更灵活，方便后续加图片压缩、水印等处理
 *
 * 限制：
 *   - 最大 10MB（防止大文件撑爆内存）
 *   - 只允许常见类型（图片、PDF、文本、代码）
 */
@ApiTags('文件上传')
@ApiBearerAuth()
@Controller('uploads')
export class UploadsController {
  private readonly logger = new Logger(UploadsController.name);

  constructor(private readonly uploadsService: UploadsService) {}

  /**
   * 上传文件。
   *
   * 请求：multipart/form-data，字段名 "file"
   * 响应：{ id, name, size, mimeType, url }
   */
  @Post()
  @ApiOperation({ summary: '上传文件（图片/PDF/文本/代码），返回附件信息' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: '要上传的文件（最大 10MB）',
        },
      },
      required: ['file'],
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: multer.memoryStorage(),
      /**
       * 中文文件名修复（不加这行必踩）。
       *
       * busboy（multer 底层解析 multipart 的库）默认按 latin1 解码 filename，
       * 而浏览器发来的是 UTF-8。结果「王.pdf」的字节 E7 8E 8B 被逐字节当成
       * 三个 latin1 字符，落库后变成 çç»è¾.pdf 这种乱码。
       * defParamCharset 会透传给 busboy，让它按 UTF-8 解码。
       */
      defParamCharset: 'utf8',
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
      },
      fileFilter: (_req, file, callback) => {
        const ok = isAllowedMimeType(file.mimetype);
        if (ok) {
          callback(null, true);
        } else {
          // 必须用 AppError 而不是 BadRequestException：
          // 全局过滤器的 resolveHttp 会把 Nest 异常的消息统一替换成
          // 「请求参数有误」，用户就看不到「到底是哪种类型不支持」。
          // AppError 走 resolve 的第一个分支，message 原样透传。
          callback(
            AppError.badRequest(
              ErrorCode.VALIDATION_FAILED,
              `不支持的文件类型：${file.mimetype}`,
            ),
            false,
          );
        }
      },
    }),
  )
  @Throttle({ default: { limit: 20, ttl: 60_000 } }) // 每分钟 20 次，防止滥用
  // 类型来自 @types/multer 注入的全局 Express.Multer.File
  // 注意：`import multer from 'multer'` 是默认导入，不能写 multer.File（那是命名空间成员）
  async upload(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      // 同样用 AppError：让「没有收到文件」这句人话能真正传到前端，
      // 否则全局过滤器会把它替换成笼统的「请求参数有误」
      throw AppError.badRequest(ErrorCode.VALIDATION_FAILED, '没有收到文件');
    }

    this.logger.log(`收到上传: ${file.originalname} (${file.size} bytes, ${file.mimetype})`);

    // 保存到磁盘
    const attachment = await this.uploadsService.saveFile(file.buffer, file.originalname, file.mimetype);

    this.logger.log(`上传成功: ${attachment.url}`);

    return attachment;
  }

  /**
   * 访问文件（静态文件服务）。
   *
   * 为什么不直接用 Express 的 static 中间件？
   *   因为我们要：
   *     1. 安全检查（防止路径遍历）
   *     2. 统一的错误处理（文件不存在返回 404）
   *     3. 后续可能加访问统计、权限控制
   */
  @Get('attachments/:filename')
  @Public()
  @ApiOperation({ summary: '访问上传的文件（公开：浏览器 <img> 和下载链接无法带 token）' })
  async getFile(@Param('filename') filename: string, @Res() res: Response) {
    const filePath = await this.uploadsService.getFilePath(filename);

    // 根据扩展名设置 Content-Type
    const ext = filename.split('.').pop()?.toLowerCase();
    const mimeTypes: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      svg: 'image/svg+xml',
      pdf: 'application/pdf',
      txt: 'text/plain',
      md: 'text/markdown',
      json: 'application/json',
      js: 'text/javascript',
      ts: 'text/typescript',
      html: 'text/html',
      css: 'text/css',
      xml: 'application/xml',
    };

    const contentType = mimeTypes[ext ?? ''] ?? 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // 缓存 1 年（UUID 文件名不会变）

    // 用 Node.js 的 fs 流式读取，避免大文件撑爆内存
    const { createReadStream } = await import('node:fs');
    const stream = createReadStream(filePath);
    stream.pipe(res);
  }
}
