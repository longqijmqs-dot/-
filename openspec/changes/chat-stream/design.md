# Design: chat-stream

## Context

第一段已交付：统一信封、业务错误码、JWT 双令牌、守卫、请求上下文、契约包（CJS+ESM）、前端认证闭环。
本变更在其上实现「发消息 → 看到 AI 逐字回复」这条主链路。

关键约束：

- 前端是 SPA，开发期走 Vite 代理（同源），生产走 Nginx
- 大模型只能通过 HTTP 流式接入；本阶段用 mock 实现，接口预留给 DeepSeek
- 消息要能中断、能续查、不能因重试重复
- 数据库是 MySQL 8.4，已启用外键

## Goals / Non-Goals

**Goals:**

1. SSE 事件协议一次定死，前端解析器与后端序列化器共享同一份 schema + 同一份黄金样例
2. 一条消息的完整生命周期可追溯：收到 → 流式生成 → 完成/中断/失败，各状态都能从数据库读出来
3. 网络重试安全（幂等）
4. 前端渲染在 60fps 预算内（不能每个 token 都重排整个列表）
5. 换模型供应商不改业务代码

**Non-Goals:**

- 不做 WebSocket 推送（PRD 列为 P2）
- 不做消息编辑/重新生成/分支对话
- 不做多模态（图片输入）
- 不做对话上下文压缩与摘要（先按最近 N 条消息拼接）
- 不做「流式恢复」（断线后从断点继续），本阶段中断即终止

## Decisions

### D1 SSE 事件协议：四种事件 + 心跳注释

```
event: meta      data: {"messageId":"1024","conversationId":"7","model":"mock-echo","requestId":"..."}
event: delta     data: {"text":"你"}
event: delta     data: {"text":"好"}
event: done      data: {"messageId":"1024","content":"你好","tokenCount":null,"finishReason":"stop"}
event: error     data: {"code":50002,"message":"AI 服务暂时不可用，请稍后重试","requestId":"..."}
: ping
```

- **为什么先发 `meta`**：前端拿到 `messageId` 就能把「空的 assistant 气泡」先渲染出来（骨架态），满足「首字 1 秒内可见」的体感要求，也便于中断时定位是哪条消息。
- **为什么 `done` 要带完整 content**：客户端可能丢过若干 delta（背压/重连边缘情况），以 `done.content` 为准可自愈；同时省去前端「拼接是否正确」的不确定性。
- **为什么用注释行做心跳**：`:` 开头是 SSE 规范里的注释，浏览器/解析器都会忽略，不需要设计额外事件类型，也不会污染事件流。
- **为什么 error 用同一套业务码**：前端可以复用 `messageFor(code)`，不需要为流内错误再维护一份文案表。

### D2 幂等：`clientMessageId` + 数据库唯一键

客户端为每条用户消息生成 UUID，随请求体提交。`Message` 表加唯一键 `(conversation_id, client_message_id)`。

- 重复提交时**不报错**，而是返回「已存在的那条消息」对应的结果（本阶段实现为：直接重放该消息已完成的 assistant 回复，或提示进行中）。
- 备选：HTTP `Idempotency-Key` 头 + Redis 记录。否决理由：多一份存储、多一个失效策略，而数据库唯一键本身就是最强的一致性保证。
- 代价：需要处理「同一 clientMessageId 正在流式中」的并发请求——返回 `409 / 40902`（新增码：请求处理中）。

### D3 中断：监听连接关闭 + abort 上游 + 落库

```
客户端断开 ──► req.on('close') ──► controller.abort() ──► 上游 fetch 中断
                                        │
                                        └──► 已累积文本以 status='interrupted' 落库
```

- 正常完成写 `complete` + `finishedAt`；上游报错写 `failed`，保留已生成部分。
- 落库时机：**流结束时一次性 UPDATE**，不是每个 delta 都写库（每 token 一次 UPDATE 会把 MySQL 打爆）。
- 代价：进程被强杀时该消息会停留在 `streaming`。缓解：记录 `started_at`，后台清理任务（列入 `deploy` 变更）把超过 10 分钟仍 `streaming` 的标记为 `failed`。

### D4 AI 提供者适配器

```ts
interface AiProvider {
  readonly name: string;
  stream(input: { messages: ChatTurn[]; signal: AbortSignal }): AsyncIterable<string>;
}
```

- `mock`：把固定话术按 2–3 字的片段吐出，每段间隔 30–60ms，模拟真实节奏（含首字延迟 200ms）。
- `deepseek`：POST `https://api.deepseek.com/chat/completions`，`stream: true`，解析 `data:` 行。
- 选择由 `AI_PROVIDER` 决定；`AiModule` 用工厂 provider 注入。
- **为什么用 `AsyncIterable<string>` 而不是回调**：调用侧可以 `for await`，中断用 `AbortSignal`，组合自然；也不绑定任何 SDK。

### D5 历史消息：游标分页

`GET /api/conversations/:id/messages?limit=30&before=<messageId>`

- 服务端 `ORDER BY id DESC LIMIT n` 后再 `reverse()`，返回时间升序数组 + `nextCursor`。
- 为什么不用 `page`：新消息持续插入会让「第 2 页」漂移，翻页时出现重复/跳过。
- 索引：`(conversation_id, id)` 覆盖该查询。

### D6 会话越权：统一 403

非本人会话返回 `403 / 30001`（PRD 明确要求）。设计取舍：返回 404 能避免「枚举探测」，但 PRD 的验收标准写的是 403，本变更遵循 PRD，并在偏离清单里记录该权衡。

### D7 前端渲染：rAF 合帧 + 增量 Markdown

- delta 不直接改 DOM，而是累积到 buffer，用 `requestAnimationFrame` 每帧最多刷一次。
- Markdown 渲染分两段：**已闭合块**（普通渲染）+ **未闭合尾块**（按纯文本渲染），避免代码块/表格半截闪烁。
- 中断按钮 → `AbortController.abort()`；前端把该气泡标记为「已中断」，但仍保留已收到的文本。
- 会话切换时 abort 当前流，避免「A 会话的回复跑进 B 会话」。

### D8 上下文拼接：最近 20 条

发送时取该会话最近 20 条 `complete` 消息拼成 `messages` 数组传给 provider，不做摘要。理由：先跑通主链路，压缩策略等真实成本数据出来再定（PRD 把成本控制列为风险，不是本阶段目标）。

## Risks / Trade-offs

| 风险 | 应对 |
|---|---|
| SSE 被中间层缓冲导致「一次性吐出」 | 开发期 Vite 代理正常；`deploy` 变更显式配置 `proxy_buffering off` 与 `proxy_read_timeout`，并在验收项里测「首字延迟」 |
| 每 token 写库压垮 MySQL | 只在结束时 UPDATE 一次（D3） |
| 进程崩溃留下 `streaming` 僵尸消息 | 记录 `started_at`；清理任务列入 `deploy` |
| 客户端快速切换会话导致消息串台 | 每个流绑定 `conversationId`，切换时 abort；store 内按会话隔离 buffer |
| Markdown 增量渲染出现 XSS | 禁用原始 HTML（`markdown-it` 的 `html: false`）+ 链接 `rel="noopener noreferrer"` |
| mock 流「太乖」掩盖真实问题 | mock 里注入首字延迟与随机分段长度；真实接入时重点验首字时间与超时分支 |

## Migration Plan

1. 契约包新增 `events.ts`（zod schema + 黄金样例）与 `chat.ts`（会话/消息 DTO）
2. Prisma 新增 `Conversation` / `Message`，生成并应用迁移
3. 后端：AiModule（mock）→ ConversationsModule → MessagesModule（SSE）
4. 前端：会话侧栏 → 消息列表 → SSE 解析器 → 输入器与中断
5. 双端验证：先 mock 流跑通全链路，再切 `AI_PROVIDER=deepseek` 复验

**回滚**：新增表，`prisma migrate reset` 可完全重置；前端新增页面，删除路由即可回退。

## Open Questions

- DeepSeek 的 token 计数字段依赖真实响应，mock 阶段 `tokenCount` 恒为 `null`，等真实接入后补齐
- 是否需要「重新生成上一条」（PRD 未列，暂不做）
- 多标签页同时发消息的会话隔离策略（当前各自独立，不做跨标签同步）
