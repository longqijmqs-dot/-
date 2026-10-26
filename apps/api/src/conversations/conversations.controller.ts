import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  type Conversation,
  type ConversationDetail,
  ConversationListQuerySchema,
  type ConversationListQuery,
  CreateConversationSchema,
  type CreateConversationInput,
  type PageResult,
  UpdateConversationSchema,
  type UpdateConversationInput,
} from '@app/contract';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { zodToOpenApiSchema } from '../common/zod-openapi';
import type { RequestUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ConversationsService } from './conversations.service';

@ApiTags('会话')
@ApiBearerAuth()
@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Post()
  @ApiOperation({ summary: '创建会话（不传标题则自动生成）' })
  @ApiBody({ schema: zodToOpenApiSchema(CreateConversationSchema) })
  create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(CreateConversationSchema)) input: CreateConversationInput,
  ): Promise<Conversation> {
    return this.conversations.create(user.id, input);
  }

  @Get()
  @ApiOperation({ summary: '会话列表（分页，默认不含归档与已删除）' })
  @ApiQuery({ name: 'page', required: false, schema: { type: 'integer', minimum: 1 }, description: '页码，从 1 开始，默认 1' })
  @ApiQuery({ name: 'pageSize', required: false, schema: { type: 'integer', minimum: 1, maximum: 100 }, description: '每页条数，默认 20' })
  @ApiQuery({ name: 'archived', required: false, schema: { type: 'string', enum: ['true', 'false'] }, description: '是否只返回已归档的会话，默认 false' })
  list(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(ConversationListQuerySchema)) query: ConversationListQuery,
  ): Promise<PageResult<Conversation>> {
    return this.conversations.list(user.id, query);
  }

  @Get(':id')
  @ApiOperation({ summary: '会话详情（含消息统计）' })
  @ApiParam({ name: 'id', description: '会话 id', schema: { type: 'string' } })
  detail(@CurrentUser() user: RequestUser, @Param('id') id: string): Promise<ConversationDetail> {
    return this.conversations.detail(user.id, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: '重命名 / 归档 / 恢复' })
  @ApiParam({ name: 'id', description: '会话 id', schema: { type: 'string' } })
  @ApiBody({ schema: zodToOpenApiSchema(UpdateConversationSchema) })
  update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateConversationSchema)) input: UpdateConversationInput,
  ): Promise<Conversation> {
    return this.conversations.update(user.id, id, input);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除会话（逻辑删除）' })
  @ApiParam({ name: 'id', description: '会话 id', schema: { type: 'string' } })
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string): Promise<{ ok: true }> {
    return this.conversations.remove(user.id, id);
  }
}
