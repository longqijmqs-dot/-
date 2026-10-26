import { Injectable } from '@nestjs/common';
import type { Conversation as ConversationRow } from '@prisma/client';
import {
  type Conversation,
  type ConversationDetail,
  type ConversationListQuery,
  type CreateConversationInput,
  ErrorCode,
  type PageResult,
  type UpdateConversationInput,
  buildPageResult,
} from '@app/contract';
import { AppError } from '../common/app-error';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ConversationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, input: CreateConversationInput): Promise<Conversation> {
    const row = await this.prisma.conversation.create({
      data: {
        userId: BigInt(userId),
        title: input.title ?? defaultTitle(),
      },
    });
    return toConversation(row);
  }

  async list(userId: string, query: ConversationListQuery): Promise<PageResult<Conversation>> {
    const where = {
      userId: BigInt(userId),
      deletedAt: null,
      isArchived: query.archived,
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.conversation.count({ where }),
      this.prisma.conversation.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    return buildPageResult(rows.map(toConversation), total, query);
  }

  async detail(userId: string, conversationId: string): Promise<ConversationDetail> {
    const row = await this.requireOwned(userId, conversationId);

    const [messageCount, lastMessage] = await this.prisma.$transaction([
      this.prisma.message.count({ where: { conversationId: row.id } }),
      this.prisma.message.findFirst({
        where: { conversationId: row.id },
        orderBy: { id: 'desc' },
        select: { createdAt: true },
      }),
    ]);

    return {
      ...toConversation(row),
      messageCount,
      lastMessageAt: lastMessage?.createdAt.toISOString() ?? null,
    };
  }

  async update(
    userId: string,
    conversationId: string,
    input: UpdateConversationInput,
  ): Promise<Conversation> {
    const row = await this.requireOwned(userId, conversationId);
    const updated = await this.prisma.conversation.update({
      where: { id: row.id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.isArchived !== undefined ? { isArchived: input.isArchived } : {}),
      },
    });
    return toConversation(updated);
  }

  async remove(userId: string, conversationId: string): Promise<{ ok: true }> {
    const row = await this.requireOwned(userId, conversationId);
    // 逻辑删除：消息记录保留，只是不再可达
    await this.prisma.conversation.update({
      where: { id: row.id },
      data: { deletedAt: new Date() },
    });
    return { ok: true };
  }

  /**
   * 归属校验。
   *
   * 分两步查（先按 id 查、再比 userId）是为了区分 404 与 403：
   * 先过滤 userId 的话，别人的会话会一律变成「不存在」，
   * 而 PRD 明确要求越权返回 403。
   */
  async requireOwned(
    userId: string,
    conversationId: string,
  ): Promise<{ id: bigint; userId: bigint; title: string; isArchived: boolean; deletedAt: Date | null; createdAt: Date; updatedAt: Date }> {
    const id = parseId(conversationId);
    const row = await this.prisma.conversation.findUnique({ where: { id } });

    if (!row || row.deletedAt !== null) {
      throw AppError.notFound(ErrorCode.NOT_FOUND, '会话不存在或已删除');
    }
    if (row.userId !== BigInt(userId)) {
      throw AppError.forbidden(ErrorCode.NOT_OWNER);
    }
    return row;
  }

  /** 内部使用：把会话的 updatedAt 推一下，让列表按活跃度排序更自然 */
  async touch(conversationId: bigint): Promise<void> {
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });
  }
}

function parseId(raw: string): bigint {
  try {
    const value = BigInt(raw);
    if (value <= 0n) {
      throw new Error('invalid');
    }
    return value;
  } catch {
    throw AppError.notFound(ErrorCode.NOT_FOUND, '会话不存在');
  }
}

function defaultTitle(): string {
  const now = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `新对话 · ${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

export function toConversation(row: ConversationRow): Conversation {
  return {
    id: String(row.id),
    title: row.title,
    isArchived: row.isArchived,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
