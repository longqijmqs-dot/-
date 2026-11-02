import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfjsLib = require('pdf-parse/lib/pdf.js/v2.0.550/build/pdf.js');

/** 送给模型前，单个附件最多抽取的字符数（超出截断） */
const MAX_EXTRACT_CHARS = 8000;

/** 文本类 MIME：直接按 UTF-8 读 */
const TEXT_MIME_PREFIXES = ['text/'];
const TEXT_MIME_EXACT = new Set(['application/json', 'application/xml']);

/** 二进制魔数：命中说明不是文本，直接拒绝抽取（避免把乱码喂给模型） */
const BINARY_MAGIC: Array<[Buffer, string]> = [
  [Buffer.from([0x25, 0x50, 0x44, 0x46]), 'pdf'], // %PDF
  [Buffer.from([0x50, 0x4b, 0x03, 0x04]), 'zip/office'], // PK..
  [Buffer.from([0x89, 0x50, 0x4e, 0x47]), 'png'],
  [Buffer.from([0xff, 0xd8, 0xff]), 'jpeg'],
  [Buffer.from([0x47, 0x49, 0x46, 0x38]), 'gif'],
  [Buffer.from([0x1f, 0x8b]), 'gzip'],
];

/**
 * 文件存储服务。
 *
 * 职责：
 *   1. 把上传的文件保存到本地磁盘（uploads/attachments/）
 *   2. 文件名用 UUID 重命名，避免冲突和中文乱码
 *   3. 返回访问 URL（相对路径，前端拼域名）
 *
 * 为什么不存数据库？
 *   文件本身存磁盘，数据库只存引用（id, name, size, mimeType, url）。
 *   这样数据库小、备份快，文件可以单独清理。
 */
@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);
  private readonly uploadsDir: string;

  constructor(private readonly config: ConfigService) {
    // uploads 目录默认在仓库根（apps/api/src/uploads 往上三级）。
    // 用 __dirname 推导而不是相对路径 './uploads'：
    // 相对路径依赖进程 cwd，从项目根启动和从 apps/api 启动会落到两个不同目录，
    // 换种启动方式文件就「凭空消失」——这种 bug 极难排查。
    // 需要自定义时用环境变量 UPLOADS_DIR 覆盖（绝对路径）。
    const configured = this.config.get<string>('UPLOADS_DIR');
    this.uploadsDir = configured
      ? path.resolve(configured)
      : path.resolve(__dirname, '..', '..', '..', '..', 'uploads');
  }

  /**
   * 保存文件到磁盘，返回附件信息。
   *
   * @param buffer 文件内容（二进制）
   * @param originalName 原始文件名（用于显示，不用于存储）
   * @param mimeType MIME 类型（image/png, application/pdf 等）
   * @returns 附件信息（id, name, size, mimeType, url）
   */
  async saveFile(
    buffer: Buffer,
    originalName: string,
    mimeType: string,
  ): Promise<{ id: string; name: string; size: number; mimeType: string; url: string }> {
    // 生成 UUID 作为文件 id（也是文件名）
    const id = crypto.randomUUID();
    // 保留原始扩展名，避免文件类型丢失
    const ext = path.extname(originalName) || '';
    const filename = `${id}${ext}`;
    const dir = path.join(this.uploadsDir, 'attachments');

    // 确保目录存在
    await fs.mkdir(dir, { recursive: true });

    // 写入文件
    const filePath = path.join(dir, filename);
    await fs.writeFile(filePath, buffer);

    this.logger.log(`文件已保存: ${filename} (${buffer.length} bytes)`);

    // 返回相对路径（前端拼域名访问）。
    // 必须带 /api 前缀：后端设了全局前缀 api（见 main.ts），
    // 前端 vite 也只代理 /api，两边正好对上
    const url = `/api/uploads/attachments/${filename}`;

    return {
      id,
      name: originalName,
      size: buffer.length,
      mimeType,
      url,
    };
  }

  /**
   * 删除文件（用于清理或用户删除消息时）。
   *
   * @param url 文件 URL（如 /uploads/attachments/xxx.png）
   */
  async deleteFile(url: string): Promise<void> {
    // 从 URL 提取文件名
    const filename = path.basename(url);
    const filePath = path.join(this.uploadsDir, 'attachments', filename);

    try {
      await fs.unlink(filePath);
      this.logger.log(`文件已删除: ${filename}`);
    } catch (error) {
      // 文件不存在时忽略（可能已经被删了）
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * 获取文件路径（用于静态文件服务）。
   *
   * @param filename 文件名（UUID + 扩展名）
   * @returns 文件绝对路径
   * @throws NotFoundException 文件不存在
   */
  async getFilePath(filename: string): Promise<string> {
    const filePath = path.join(this.uploadsDir, 'attachments', filename);

    // 安全检查：防止路径遍历攻击（../../etc/passwd）
    const resolved = path.resolve(filePath);
    const uploadsResolved = path.resolve(this.uploadsDir);
    if (!resolved.startsWith(uploadsResolved)) {
      throw new NotFoundException('文件不存在');
    }

    try {
      await fs.access(resolved);
      return resolved;
    } catch {
      throw new NotFoundException('文件不存在');
    }
  }

  /**
   * 抽取附件的文本内容，供 AI 上下文使用。
   *
   * 为什么放在 service 而不是 controller？
   *   这是「业务能力」不是「HTTP 细节」：MessagesService 发消息时也要用。
   *
   * 支持范围（刻意收窄）：
   *   - text/*、application/json、application/xml → 直接 UTF-8 读
   *   - application/pdf → pdf-parse 抽文字
   *   - 其余（图片、Office、压缩包）→ 返回 null，调用方降级为「只告知文件名」
   *
   * 三道防线，避免把垃圾喂给模型：
   *   1. 魔数检测：文件扩展名/声明是文本但内容是二进制（比如把 zip 改名 .txt），
   *      直接拒绝，否则模型会收到一大坨乱码 token，既浪费钱又污染回答
   *   2. 截断：单个附件最多 MAX_EXTRACT_CHARS 字符，防止超长文档撑爆上下文窗口
   *   3. 失败降级：解析抛错时返回 null 并记 warn，绝不让上传功能拖垮发消息
   */
  async extractText(attachment: {
    name: string;
    mimeType: string;
    url: string;
  }): Promise<string | null> {
    const isTextMime =
      TEXT_MIME_PREFIXES.some((p) => attachment.mimeType.startsWith(p)) ||
      TEXT_MIME_EXACT.has(attachment.mimeType);
    const isPdf = attachment.mimeType === 'application/pdf';

    if (!isTextMime && !isPdf) {
      return null;
    }

    let buffer: Buffer;
    try {
      const filename = path.basename(attachment.url);
      const filePath = await this.getFilePath(filename);
      buffer = await fs.readFile(filePath);
    } catch (error) {
      this.logger.warn({ err: error, url: attachment.url }, '读取附件失败，跳过内容抽取');
      return null;
    }

    // 防线 1：魔数检测
    for (const [magic, label] of BINARY_MAGIC) {
      if (buffer.subarray(0, magic.length).equals(magic)) {
        // PDF 走解析分支是合法的；其余二进制一律拒绝
        if (label === 'pdf' && isPdf) {
          break;
        }
        this.logger.warn(
          { name: attachment.name, detected: label, declared: attachment.mimeType },
          '附件声明为文本但内容是二进制，跳过抽取',
        );
        return null;
      }
    }

    try {
      let text: string;
      if (isPdf) {
        text = await extractPdfText(buffer);
      } else {
        text = buffer.toString('utf8');
      }

      // 规整空白：PDF 抽出来的文本常有大量连续空行，浪费 token
      text = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

      if (text.length === 0) {
        return null;
      }

      // 防线 2：截断
      if (text.length > MAX_EXTRACT_CHARS) {
        text = `${text.slice(0, MAX_EXTRACT_CHARS)}\n…（内容过长，已截断，仅展示前 ${MAX_EXTRACT_CHARS} 字）`;
      }
      return text;
    } catch (error) {
      // 防线 3：失败降级
      this.logger.warn({ err: error, name: attachment.name }, '附件内容抽取失败，降级为仅文件名');
      return null;
    }
  }
}

/**
 * 用 pdf.js 抽取 PDF 文本。
 *
 * ⚠️ 为什么直接 require 内嵌的 pdf.js，而不是用 pdf-parse 的默认入口？
 *   pdf-parse 1.1.1 有个坑：它的 `module.exports = Pdf` 只在第一次调用时
 *   解析正常，第二次起返回空文本（内部 worker 复用导致状态串了）。
 *   实测：同一进程连续调用 4 次，第 1 次成功、第 2~4 次返回 ""。
 *   直接用 pdf.js 的 getDocument 每次新建文档实例，就没有这个问题。
 *
 * @param buffer PDF 原始字节
 * @returns 抽出的文本（未规整），失败会抛错由上层降级
 */
async function extractPdfText(buffer: Buffer): Promise<string> {
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer), verbosity: 0 }).promise;

  try {
    let out = '';
    for (let page = 1; page <= doc.numPages; page++) {
      const content = await doc.getPage(page);
      const textContent = await content.getTextContent();
      out += textContent.items.map((item: { str: string }) => item.str).join(' ') + '\n';
    }
    return out;
  } finally {
    await doc.destroy();
  }
}
