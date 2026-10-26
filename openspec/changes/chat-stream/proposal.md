# Change: chat-stream

## Why

第一段打通了「谁能进来」，但产品本身还空着。这一变更交付平台的核心价值：**用户能在会话里发消息，并看到 AI 逐字回复**。

这一段的技术难度集中在三个 PRD 没有定义、但决定成败的契约上：

1. **SSE 事件协议**——流的格式一旦上线就难改，前端解析器、Nginx 配置、错误处理全都依赖它
2. **幂等**——网络抖动导致的重试不能产生两条用户消息，也不能重复计费
3. **中断语义**——用户关掉页面时，已经生成的那部分内容必须落库，否则「中断后历史可查」不成立

把这三件事在第一版就定死，比事后打补丁便宜一个数量级。

## What Changes

- 新增 `Conversation` 表与 CRUD：创建、分页列表（默认不含归档）、重命名、归档/恢复、逻辑删除
- 新增 `Message` 表：`status`、`client_message_id`（幂等键）、`finished_at`、游标索引
- 新增 `POST /api/conversations/:id/messages`：写入用户消息后**以 SSE 流式返回** AI 回复
- 定义 SSE 事件协议：`meta` / `delta` / `done` / `error` + 15 秒心跳
- 新增 AI 提供者适配器：`AiProvider` 接口 + `mock`（逐字假流）+ `deepseek`（OpenAI 兼容）
- 新增 `GET /api/conversations/:id/messages`：游标分页（`before` + `limit`，时间升序返回）
- 前端新增会话侧栏、消息流、输入器；手写 SSE 解析器；增量 Markdown 渲染；`AbortController` 中断
- 契约包新增 `events.ts`：SSE 事件 zod schema，前后端共用 + 黄金样例

## Capabilities

### New Capabilities

- `conversation-management`: 会话的创建、分页列表、详情、重命名、归档/恢复、逻辑删除，以及「只能操作自己的会话」的越权保护
- `chat-streaming`: 发送消息、SSE 事件协议与心跳、幂等去重、流式中断落库、历史消息游标分页、AI 提供者适配器
- `web-chat`: 前端的会话列表与切换、流式消息渲染（增量 Markdown + 合帧）、中断操作、流中错误提示

### Modified Capabilities

（无。`api-contract` / `user-auth` / `web-auth` 的行为不变，本变更只在信封内部新增 `events` 命名空间。）

## Impact

- **接口**：新增 `/api/conversations`（GET/POST）、`/api/conversations/:id`（GET/PATCH/DELETE）、`/api/conversations/:id/messages`（GET/POST-SSE）
- **数据**：新增 `Conversation`、`Message` 两张表与迁移；`Message` 需要 `(conversation_id, id DESC)` 索引支撑游标分页
- **依赖**：`@nestjs/terminus` 不引入；无新增重型依赖。AI 调用用原生 `fetch`
- **配置**：新增 `AI_PROVIDER`（`mock` / `deepseek`）、`DEEPSEEK_API_KEY`、`DEEPSEEK_MODEL`、`AI_TIMEOUT_MS`
- **运行环境**：SSE 需要 Nginx `proxy_buffering off`（`deploy` 变更落实）；本变更先在 Vite 代理下验证
- **后续变更依赖**：`files-and-admin` 的文件可关联会话；`deploy` 需为 SSE 调整反代与超时
