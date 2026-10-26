import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AI_PROVIDER, type AiProvider } from './ai.types';
import { DeepSeekProvider } from './deepseek.provider';
import { MockProvider } from './mock.provider';

@Module({
  providers: [
    {
      provide: AI_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): AiProvider => {
        const kind = config.get<string>('AI_PROVIDER') ?? 'mock';

        if (kind === 'deepseek') {
          const apiKey = config.get<string>('DEEPSEEK_API_KEY');
          if (!apiKey) {
            // 启动即失败：总比收到第一条消息才发现没配 key 好
            throw new Error('AI_PROVIDER=deepseek，但 .env 里缺少 DEEPSEEK_API_KEY');
          }
          return new DeepSeekProvider({
            apiKey,
            baseUrl: config.get<string>('DEEPSEEK_BASE_URL') ?? 'https://api.deepseek.com',
            model: config.get<string>('DEEPSEEK_MODEL') ?? 'deepseek-chat',
            timeoutMs: Number(config.get<string>('AI_TIMEOUT_MS') ?? 60000),
          });
        }

        return new MockProvider();
      },
    },
  ],
  exports: [AI_PROVIDER],
})
export class AiModule {}
