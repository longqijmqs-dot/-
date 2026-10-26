/**
 * SSE 黄金样例 —— 前后端测试共用同一份输入。
 *
 * 它的作用：如果后端改了事件格式、或前端改了解析器，
 * 只要有一边偏离这份样例，测试就会红。
 * 这就是「契约」两个字落地的样子。
 */
export const SSE_GOLDEN_SAMPLE = [
  'event: meta',
  'data: {"messageId":"1024","conversationId":"7","model":"deepseek-chat","requestId":"req-1"}',
  '',
  ': ping',
  '',
  'event: delta',
  'data: {"text":"春"}',
  '',
  'event: delta',
  'data: {"text":"眠不"}',
  '',
  'event: delta',
  'data: {"text":"觉晓"}',
  '',
  'event: done',
  'data: {"messageId":"1024","content":"春眠不觉晓","tokenCount":18,"finishReason":"stop"}',
  '',
  // 注意：末尾必须有这个空行 —— 否则最后一个事件缺少终止符，
  // 解析器只能等到连接结束（flush）才把它吐出来。
  '',
].join('\n');

/** 上游失败的样例 */
export const SSE_GOLDEN_ERROR = [
  'event: meta',
  'data: {"messageId":"1025","conversationId":"7","model":"deepseek-chat","requestId":"req-2"}',
  '',
  'event: delta',
  'data: {"text":"春"}',
  '',
  'event: error',
  'data: {"code":50002,"message":"AI 服务暂时不可用，请稍后重试","requestId":"req-2"}',
  '',
  '',
].join('\n');
