import { createSseParser } from '@app/contract';
import {
  AiUpstreamError,
  type AiProvider,
  type AiStream,
  type AiStreamInput,
  type TokenUsage,
} from './ai.types';

interface DeepSeekProviderOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
}

/**
 * DeepSeek 提供者（OpenAI 兼容协议）。
 *
 * 协议要点（实测确认）：
 *   - POST /chat/completions，body 带 `stream: true`
 *   - 返回 `text/event-stream`，每行 `data: {json}`，最后 `data: [DONE]`
 *   - 增量文本在 `choices[0].delta.content`
 *   - 加 `stream_options.include_usage` 后，最后一个 chunk 会带 `usage`
 *
 * 分片处理：直接用契约包里的 `createSseParser`，
 * 保证与前端用的是同一套「粘包/拆包」逻辑（同一份代码，同一批测试）。
 */
export class DeepSeekProvider implements AiProvider {
  readonly name: string;

  constructor(private readonly options: DeepSeekProviderOptions) {
    this.name = options.model;
  }

  stream(input: AiStreamInput): AiStream {
    const { apiKey, baseUrl, model, timeoutMs } = this.options;

    let settleUsage!: (usage: TokenUsage | null) => void;
    const usage = new Promise<TokenUsage | null>((resolve) => {
      settleUsage = resolve;
    });

    async function* generate(): AsyncIterable<string> {
      // 上游超时与客户端断开合并成一个信号：任一发生都中止请求
      const timeoutSignal = AbortSignal.timeout(timeoutMs);
      const signal = AbortSignal.any([input.signal, timeoutSignal]);

      let response: Response;
      try {
        response = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: input.messages,
            stream: true,
            stream_options: { include_usage: true },
          }),
          signal,
        });
      } catch (error) {
        settleUsage(null);
        throw new AiUpstreamError('连接 AI 服务失败', error);
      }

      if (!response.ok || !response.body) {
        // 不把上游错误报文透给客户端，只留在大日志里
        settleUsage(null);
        throw new AiUpstreamError(`AI 服务返回 ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const parser = createSseParser();
      let capturedUsage: TokenUsage | null = null;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          const chunk = decoder.decode(value, { stream: true });
          for (const raw of parser.push(chunk)) {
            if (raw.data === '[DONE]') {
              settleUsage(capturedUsage);
              return;
            }
            const parsed = safeJson(raw.data);
            if (!parsed) {
              continue;
            }
            const text = parsed?.choices?.[0]?.delta?.content;
            if (typeof text === 'string' && text.length > 0) {
              yield text;
            }
            if (parsed.usage) {
              capturedUsage = {
                promptTokens: parsed.usage.prompt_tokens ?? 0,
                completionTokens: parsed.usage.completion_tokens ?? 0,
                totalTokens: parsed.usage.total_tokens ?? 0,
              };
            }
          }
        }
        settleUsage(capturedUsage);
      } catch (error) {
        settleUsage(capturedUsage);
        if ((error as { name?: string }).name === 'AbortError') {
          return; // 客户端主动断开，按正常中断处理
        }
        throw new AiUpstreamError('读取 AI 流失败', error);
      } finally {
        reader.cancel().catch(() => undefined);
      }
    }

    return { text: generate(), usage };
  }
}

interface DeepSeekChunk {
  choices?: { delta?: { content?: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

function safeJson(text: string): DeepSeekChunk | null {
  try {
    return JSON.parse(text) as DeepSeekChunk;
  } catch {
    return null;
  }
}
