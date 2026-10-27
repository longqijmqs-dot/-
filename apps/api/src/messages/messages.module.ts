import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { UploadsModule } from '../uploads/uploads.module';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';

@Module({
  // UploadsModule 提供 UploadsService：发消息时要把附件文本抽出来喂给 AI
  imports: [AiModule, ConversationsModule, UploadsModule],
  controllers: [MessagesController],
  providers: [MessagesService],
})
export class MessagesModule {}
