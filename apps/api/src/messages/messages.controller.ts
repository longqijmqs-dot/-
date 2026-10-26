import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  type CursorResult,
  type Message,
  type MessageListQuery,
  MessageListQuerySchema,
  type SendMessageInput,
  SendMessageSchema,
} from '@app/contract';
import type { Request, Response } from 'express';
// ⚠️ 必须是值导入，不能写 `import type`：
// 构造函数参数的类会被 emitDecoratorMetadata 写进元数据供 Nest 做依赖注入，
// 而 `import type` 在编译期被完全擦除，Nest 会把它当成 Function 而注入失败
// （报错形如：Nest can't resolve dependencies of the MessagesController (..., ?)）。
import { ClsService } from 'nestjs-cls';
import { getRequestId } from '../common/request-context';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { zodToOpenApiSchema } from '../common/zod-openapi';
import type { RequestUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { MessagesService } from './messages.service';

@ApiTags('消息')
@ApiBearerAuth()
@Controller('conversations/:conversationId/messages')
export class MessagesController {
  constructor(
    private readonly messages: MessagesService,
    private readonly cls: ClsService,
  ) {}

  @Get()
  @ApiOperation({ summary: '历史消息（游标分页，时间升序）' })
  @ApiParam({ name: 'conversationId', description: '会话 id', schema: { type: 'string' } })
  @ApiQuery({ name: 'limit', required: false, schema: { type: 'integer', minimum: 1, maximum: 100 }, description: '本页条数，默认 30' })
  @ApiQuery({ name: 'before', required: false, schema: { type: 'integer', minimum: 1 }, description: '游标：只返回该消息 id 之前（更早）的消息' })
  list(
    @CurrentUser() user: RequestUser,
    @Param('conversationId') conversationId: string,
    @Query(new ZodValidationPipe(MessageListQuerySchema)) query: MessageListQuery,
  ): Promise<CursorResult<Message>> {
    return this.messages.listHistory(user.id, conversationId, query);
  }

  /**
   * 发送消息并流式接收回复。
   *
   * 这里用 `@Res()`（不 passthrough），因为响应不是一次性 JSON，
   * 而是由 service 持续写入的事件流。
   */
  @Post()
  @ApiOperation({ summary: '发送消息，SSE 流式返回 AI 回复' })
  @ApiProduces('text/event-stream')
  @ApiParam({ name: 'conversationId', description: '会话 id', schema: { type: 'string' } })
  @ApiBody({ schema: zodToOpenApiSchema(SendMessageSchema) })
  async send(
    @CurrentUser() user: RequestUser,
    @Param('conversationId') conversationId: string,
    @Body(new ZodValidationPipe(SendMessageSchema)) input: SendMessageInput,
    @Res() res: Response,
    @Req() _req: Request,
  ): Promise<void> {
    await this.messages.send({
      userId: user.id,
      conversationId,
      input,
      requestId: getRequestId(this.cls),
      res,
    });
  }
}
