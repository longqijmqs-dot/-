import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Message as MessageRow } from '@prisma/client';
import {
  type Attachment,
  type CursorResult,
  ErrorCode,
  messageFor,
  type Message,
  type MessageListQuery,
  type SendMessageInput,
} from '@app/contract';
import type { Response } from 'express';
import {
  AI_PROVIDER,
  AiUpstreamError,
  type AiProvider,
  type ChatTurn,
  type TokenUsage,
} from '../ai/ai.types';
import { AppError } from '../common/app-error';
import { logger } from '../common/logger';
import { openSse } from '../common/sse';
import { PrismaService } from '../prisma/prisma.service';
import { ConversationsService } from '../conversations/conversations.service';
import { UploadsService } from '../uploads/uploads.service';

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conversations: ConversationsService,
    private readonly config: ConfigService,
    @Inject(AI_PROVIDER) private readonly ai: AiProvider,
    private readonly uploads: UploadsService,
  ) {}

  /**
   * 历史消息（游标分页）。
   *
   * 查法是「倒序取 limit+1 条，再反转」：
   *   - 倒序才能用上 (conversation_id, id) 索引并保证取到的是「最近的」
   *   - 多取一条用来判断还有没有更早的
   *   - 反转后返回升序，前端直接按时间渲染
   */
  async listHistory(
    userId: string,
    conversationId: string,
    query: MessageListQuery,
  ): Promise<CursorResult<Message>> {
    const conversation = await this.conversations.requireOwned(userId, conversationId);

    const rows = await this.prisma.message.findMany({
      where: {
        conversationId: conversation.id,
        ...(query.before ? { id: { lt: BigInt(query.before) } } : {}),
      },
      orderBy: { id: 'desc' },
      take: query.limit + 1,
    });

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const oldest = page[page.length - 1];

    return {
      items: [...page].reverse().map(toMessage),
      nextCursor: hasMore && oldest ? String(oldest.id) : null,
    };
  }

  /**
   * 发送消息并以 SSE 返回 AI 回复。
   *
   * 全流程：
   *   1. 归属校验（越权 403）
   *   2. 幂等检查（同 clientMessageId 已存在 → 409）
   *   3. 写用户消息 + 建 assistant 占位（status=streaming）
   *   4. 拼最近 N 条上下文
   *   5. 开流，先发 meta
   *   6. 逐段发 delta，累积文本
   *   7. 收尾：落库（complete/interrupted/failed）→ 发 done 或 error
   */
  async send(params: {
    userId: string;
    conversationId: string;
    input: SendMessageInput;
    requestId: string;
    res: Response;
  }): Promise<void> {
    const { userId, conversationId, input, requestId, res } = params;
    const conversation = await this.conversations.requireOwned(userId, conversationId);

    // 幂等：同一个 clientMessageId 只允许一条用户消息
    const duplicated = await this.prisma.message.findFirst({
      where: { conversationId: conversation.id, clientMessageId: input.clientMessageId },
      select: { id: true },
    });
    if (duplicated) {
      throw AppError.conflict(ErrorCode.MESSAGE_IN_PROGRESS, '这条消息已经发送过了，请勿重复提交');
    }

    const userMessage = await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: 'user',
        content: input.content,
        status: 'complete',
        clientMessageId: input.clientMessageId,
        // 附件引用：前端上传后拿到的 Attachment 数组。
        // Prisma 的 Json 字段直接收 JSON 值（数组/对象），不要 JSON.stringify，
        // 否则会被双重编码成「字符串里套 JSON」
        attachments: input.attachments ?? [],
        finishedAt: new Date(),
      },
    });

    // 先建占位行：这样 meta 事件里就有 messageId，
    // 前端可以立刻渲染空气泡，中断时也知道要标记哪一条
    const assistantMessage = await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: 'assistant',
        content: '',
        status: 'streaming',
        model: this.ai.name,
      },
    });

    const contextLimit = Number(this.config.get<string>('AI_CONTEXT_MESSAGES') ?? 20);
    const turns = await this.buildContext(conversation.id, contextLimit);

    const abortController = new AbortController();
    // 客户端断开（关页面、点停止、切会话）都会触发 close
    res.on('close', () => {
      if (!res.writableEnded) {
        abortController.abort();
      }
    });

    const sse = openSse(res);
    sse.send({
      event: 'meta',
      data: {
        messageId: String(assistantMessage.id),
        conversationId: String(conversation.id),
        model: this.ai.name,
        requestId,
      },
    });

    let accumulated = '';
    let usage: TokenUsage | null = null;
    let status: 'complete' | 'interrupted' | 'failed' = 'complete';
    let finishReason: string | null = null;
    let errorCode: number | null = null;

    try {
      const stream = this.ai.stream({ messages: turns, signal: abortController.signal });
      for await (const piece of stream.text) {
        accumulated += piece;
        sse.send({ event: 'delta', data: { text: piece } });
      }
      usage = await settleUsage(stream.usage, 2_000);

      // 关键：即使 provider 是「安静地结束」，只要信号已 abort 就必须判定为中断，
      // 否则会把半截内容误标成 complete（历史上真实的踩坑点）
      if (abortController.signal.aborted) {
        status = 'interrupted';
        finishReason = 'interrupted';
      } else {
        finishReason = 'stop';
      }
    } catch (error) {
      if (abortController.signal.aborted) {
        status = 'interrupted';
        finishReason = 'interrupted';
      } else {
        status = 'failed';
        finishReason = 'error';
        errorCode = ErrorCode.UPSTREAM_ERROR;
        logger.error(
          { requestId, conversationId: String(conversation.id), err: serialise(error) },
          'AI 生成失败',
        );
        if (error instanceof AiUpstreamError) {
          logger.error({ requestId, upstream: error.message }, '上游错误详情');
        }
      }
    }

    // 落库：只更新一次，不是每个 token 都写
    await this.prisma.message.update({
      where: { id: assistantMessage.id },
      data: {
        content: accumulated,
        status,
        tokenCount: usage?.totalTokens ?? null,
        finishedAt: new Date(),
      },
    });

    await this.conversations.touch(conversation.id).catch(() => undefined);

    if (status === 'complete') {
      sse.send({
        event: 'done',
        data: {
          messageId: String(assistantMessage.id),
          content: accumulated,
          tokenCount: usage?.totalTokens ?? null,
          finishReason,
        },
      });
    } else if (status === 'failed') {
      sse.send({
        event: 'error',
        data: {
          code: errorCode ?? ErrorCode.UPSTREAM_ERROR,
          message: messageFor(errorCode ?? ErrorCode.UPSTREAM_ERROR),
          requestId,
        },
      });
    }
    // status === 'interrupted'：客户端已经走了，没有接收方，不需要终态事件

    sse.end();

    logger.info(
      {
        requestId,
        conversationId: String(conversation.id),
        userMessageId: String(userMessage.id),
        assistantMessageId: String(assistantMessage.id),
        status,
        chars: accumulated.length,
        tokens: usage?.totalTokens ?? null,
      },
      '消息处理结束',
    );
  }

  /** 拼上下文：取最近 N 条已完结消息，反转成时间升序 */
  private async buildContext(conversationId: bigint, limit: number): Promise<ChatTurn[]> {
    const rows = await this.prisma.message.findMany({
      where: { conversationId, status: { in: ['complete', 'interrupted'] }, content: { not: '' } },
      orderBy: { id: 'desc' },
      take: limit,
    });

    const turns: ChatTurn[] = [];
    for (const row of rows.reverse()) {
      if (row.role !== 'user' && row.role !== 'assistant') {
        continue;
      }
      let content = row.content;
      // 用户消息带附件时，把附件文本拼进这一轮上下文，
      // 否则模型只能看到「我上传了文件」这句话，看不到文件里写了什么
      if (row.role === 'user') {
        const attachments = parseAttachments(row);
        if (attachments.length > 0) {
          content = await this.withAttachmentContent(content, attachments);
        }
      }
      turns.push({ role: row.role as 'user' | 'assistant', content });
    }
    return turns;
  }

  /**
   * 把附件内容拼到用户消息文本后面。
   *
   * 为什么不把附件单独做成一条 system/独立 turn？
   *   因为附件是「这条用户消息的一部分」，语义上属于同一次发言。
   *   拼在一起模型才知道「他在问这个文件里的 X」指的是哪段内容。
   *
   * 抽不到内容的附件（图片/Office/压缩包）也要显式告知，
   * 否则模型会像之前那样回答「我没收到任何附件」——它确实没收到，
   * 但用户看到这种回答会以为功能坏了。说清「收到文件但读不了内容」更诚实。
   */
  private async withAttachmentContent(content: string, attachments: Attachment[]): Promise<string> {
    const parts: string[] = [];
    for (const att of attachments) {
      const text = await this.uploads.extractText(att);
      if (text) {
        parts.push(`【附件「${att.name}」的内容】\n${text}`);
      } else {
        parts.push(
          `【附件「${att.name}」】（${att.mimeType} 格式，当前版本暂不支持读取内容，仅知道文件名和大小 ${att.size} 字节）`,
        );
      }
    }
    return `${content}\n\n${parts.join('\n\n')}`;
  }
}

/** usage 可能永远不 resolve（provider 异常路径），这里给个上限 */
async function settleUsage(
  usagePromise: Promise<TokenUsage | null>,
  timeoutMs: number,
): Promise<TokenUsage | null> {
  return Promise.race([
    usagePromise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ]);
}

function serialise(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }
  return { value: String(error) };
}

/**
 * 解析消息行里的附件 JSON。
 *
 * Prisma 的 Json 字段读出来可能是「已解析的数组」或「JSON 字符串」
 * （取决于驱动和写入方式），两种都要兼容；解析失败一律降级为空数组，
 * 绝不能因为一条脏数据让整页历史消息 500。
 */
function parseAttachments(row: { attachments?: unknown }): Attachment[] {
  const raw = row.attachments;
  if (Array.isArray(raw)) {
    return raw as Attachment[];
  }
  if (typeof raw === 'string' && raw.length > 0) {
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as Attachment[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function toMessage(row: MessageRow): Message {
  return {
    id: String(row.id),
    conversationId: String(row.conversationId),
    role: row.role as 'user' | 'assistant',
    content: row.content,
    status: row.status as Message['status'],
    model: row.model,
    tokenCount: row.tokenCount,
    clientMessageId: row.clientMessageId,
    attachments: parseAttachments(row),
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
  };
}
