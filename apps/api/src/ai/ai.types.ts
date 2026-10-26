/** 一轮对话消息（发给模型的最小结构） */
export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * 模型返回的流。
 *
 * 为什么把「文本流」和「usage」拆开？
 * 因为文本是用的时候就要消费（边生成边推给前端），
 * 而 usage 只有流结束时才知道 —— 做成两个通道，调用方各取所需。
 */
export interface AiStream {
  text: AsyncIterable<string>;
  usage: Promise<TokenUsage | null>;
}

export interface AiStreamInput {
  messages: ChatTurn[];
  signal: AbortSignal;
}

/**
 * 模型提供者接口。
 *
 * 业务代码只依赖这个接口，不认「DeepSeek」或「OpenAI」。
 * 以后换供应商（或加本地模型）时，只需要新增一个实现 + 改环境变量。
 */
export interface AiProvider {
  /** 写进消息表的 model 字段，便于排查「这条回复是谁生成的」 */
  readonly name: string;

  stream(input: AiStreamInput): AiStream;
}

/** 上游模型不可用（5xx、超时、返回格式异常） */
export class AiUpstreamError extends Error {
  constructor(message = 'AI 服务暂时不可用', override readonly cause?: unknown) {
    super(message);
    this.name = 'AiUpstreamError';
  }
}

/** 注入令牌 */
export const AI_PROVIDER = Symbol('AI_PROVIDER');
