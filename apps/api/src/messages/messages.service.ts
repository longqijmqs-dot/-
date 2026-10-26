import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Message as MessageRow } from '@prisma/client';
import {
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

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conversations: ConversationsService,
    private readonly config: ConfigService,
    @Inject(AI_PROVIDER) private readonly ai: AiProvider,
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
    return rows
      .reverse()
      .filter((row) => row.role === 'user' || row.role === 'assistant')
      .map((row) => ({ role: row.role as 'user' | 'assistant', content: row.content }));
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
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
  };
}
