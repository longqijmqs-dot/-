import { decodeSseEvent, createSseParser, SSE_EVENT } from '../events';
import { SSE_GOLDEN_ERROR, SSE_GOLDEN_SAMPLE } from '../fixtures/sse-golden';

describe('SSE 解析器', () => {
  it('能按顺序解析完整样例', () => {
    const parser = createSseParser();
    const raws = [...parser.push(SSE_GOLDEN_SAMPLE), ...parser.flush()];
    expect(raws.map((r) => r.event)).toEqual(['meta', 'delta', 'delta', 'delta', 'done']);

    const events = raws.map(decodeSseEvent).filter((e) => e !== null);
    expect(events).toHaveLength(5);
    expect(events[0]?.event).toBe(SSE_EVENT.META);
    expect(events.at(-1)?.event).toBe(SSE_EVENT.DONE);
  });

  it('一次性喂入与逐字节喂入结果一致（TCP 分片不尊重事件边界）', () => {
    const whole = createSseParser();
    const wholeEvents = [...whole.push(SSE_GOLDEN_SAMPLE), ...whole.flush()];

    const byteByByte = createSseParser();
    const pieces: ReturnType<typeof decodeSseEvent>[] = [];
    for (const char of SSE_GOLDEN_SAMPLE) {
      for (const raw of byteByByte.push(char)) {
        const decoded = decodeSseEvent(raw);
        if (decoded) pieces.push(decoded);
      }
    }
    for (const raw of byteByByte.flush()) {
      const decoded = decodeSseEvent(raw);
      if (decoded) pieces.push(decoded);
    }
    expect(pieces).toHaveLength(wholeEvents.length);
    expect(pieces.at(-1)?.event).toBe(SSE_EVENT.DONE);
  });

  it('跳过心跳注释行，不产生事件', () => {
    const parser = createSseParser();
    const raws = parser.push(': ping\n\nevent: delta\ndata: {"text":"a"}\n\n');
    expect(raws).toHaveLength(1);
    expect(raws[0]?.event).toBe('delta');
  });

  it('兼容 CRLF 换行', () => {
    const parser = createSseParser();
    const raws = parser.push('event: delta\r\ndata: {"text":"a"}\r\n\r\n');
    expect(raws).toHaveLength(1);
    expect(decodeSseEvent(raws[0]!)).toEqual({ event: 'delta', data: { text: 'a' } });
  });

  it('done 的完整内容等于所有 delta 拼接', () => {
    const parser = createSseParser();
    const events = [...parser.push(SSE_GOLDEN_SAMPLE), ...parser.flush()]
      .map(decodeSseEvent)
      .filter((e) => e !== null);

    const text = events
      .filter((e) => e.event === SSE_EVENT.DELTA)
      .map((e) => (e.data as { text: string }).text)
      .join('');
    const done = events.find((e) => e.event === SSE_EVENT.DONE);
    expect(done?.data).toMatchObject({ content: text });
  });

  it('错误样例只解析出 error 事件而不抛异常', () => {
    const parser = createSseParser();
    const events = [...parser.push(SSE_GOLDEN_ERROR), ...parser.flush()]
      .map(decodeSseEvent)
      .filter((e) => e !== null);
    const errorEvent = events.find((e) => e.event === SSE_EVENT.ERROR);
    expect(errorEvent?.data).toMatchObject({ code: 50002 });
  });

  it('未知事件名被忽略而不是抛错', () => {
    const parser = createSseParser();
    const raws = parser.push('event: unknown\ndata: {"x":1}\n\n');
    expect(decodeSseEvent(raws[0]!)).toBeNull();
  });

  it('非法 JSON 不抛异常，返回 null', () => {
    const parser = createSseParser();
    const raws = parser.push('event: delta\ndata: {oops}\n\n');
    expect(decodeSseEvent(raws[0]!)).toBeNull();
  });
});
