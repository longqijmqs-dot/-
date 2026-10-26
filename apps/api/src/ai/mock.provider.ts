import { type AiProvider, type AiStream, type AiStreamInput, type TokenUsage } from './ai.types';

/**
 * Mock 提供者：不调用任何外部服务，按固定节奏吐字。
 *
 * 它不是「玩具」——而是让整条链路（SSE、中断、落库、渲染）
 * 可以在零成本、零网络依赖的情况下被自动化测试和人工验收。
 *
 * 刻意模拟了三件真实世界会发生的事：
 *   1. 首字延迟（200ms）——验证前端「先渲染空气泡」是否生效
 *   2. 不均匀分段（1–4 字一片）——能暴露渲染层合帧的问题
 *   3. 可被 AbortSignal 中断——验证中断落库
 */
export class MockProvider implements AiProvider {
  readonly name = 'mock-echo';

  private readonly firstTokenDelayMs: number;
  private readonly chunkDelayMs: number;

  constructor(options: { firstTokenDelayMs?: number; chunkDelayMs?: number } = {}) {
    this.firstTokenDelayMs = options.firstTokenDelayMs ?? 200;
    this.chunkDelayMs = options.chunkDelayMs ?? 45;
  }

  stream(input: AiStreamInput): AiStream {
    const lastUserMessage = [...input.messages].reverse().find((turn) => turn.role === 'user');
    const quoted = lastUserMessage?.content.slice(0, 40) ?? '（空消息）';
    const reply = `这是 mock 模式的回复。你刚才说的是：「${quoted}」。把它换成真实模型只需要改一个环境变量。`;

    const firstTokenDelayMs = this.firstTokenDelayMs;
    const chunkDelayMs = this.chunkDelayMs;

    let settleUsage!: (usage: TokenUsage | null) => void;
    const usage = new Promise<TokenUsage | null>((resolve) => {
      settleUsage = resolve;
    });

    async function* generate(): AsyncIterable<string> {
      try {
        await sleep(firstTokenDelayMs, input.signal);

        let index = 0;
        while (index < reply.length) {
          // 被中断时抛错，而不是静默 return：
          // 否则调用方无法区分「正常结束」和「被打断」
          if (input.signal.aborted) {
            throw new DOMException('aborted', 'AbortError');
          }
          const size = 1 + Math.floor(Math.random() * 4);
          const piece = reply.slice(index, index + size);
          index += size;
          yield piece;
          await sleep(chunkDelayMs, input.signal);
        }

        settleUsage({
          promptTokens: Math.ceil((lastUserMessage?.content.length ?? 0) / 2),
          completionTokens: Math.ceil(reply.length / 2),
          totalTokens: Math.ceil(((lastUserMessage?.content.length ?? 0) + reply.length) / 2),
        });
      } catch (error) {
        // 被中止属于正常结束路径，不当作错误
        if (isAbortError(error)) {
          settleUsage(null);
          return;
        }
        settleUsage(null);
        throw error;
      }
    }

    return { text: generate(), usage };
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('aborted', 'AbortError'));
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new DOMException('aborted', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}
