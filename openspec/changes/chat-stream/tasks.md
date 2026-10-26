# Tasks: chat-stream

> 前置：`contract-and-auth` 已交付（认证闭环可用）。本变更在其上叠加会话与流式对话。
> 执行顺序即依赖顺序：契约 → 数据 → 后端 → 前端 → 双端验收。

## 1. 契约包扩展

- [ ] 1.1 `src/chat.ts`：会话 DTO（创建/更新/列表项/详情）、消息 DTO（含 `status`）、发送消息入参（含 `clientMessageId`）
- [ ] 1.2 `src/events.ts`：SSE 事件 schema（`meta` / `delta` / `done` / `error`）+ 事件名常量
- [ ] 1.3 `src/error-codes.ts` 追加 `MESSAGE_IN_PROGRESS = 40902`
- [ ] 1.4 黄金样例 `fixtures/sse-golden.txt`：一段完整事件流，前后端测试共用
- [ ] 1.5 单测：事件 schema 解析黄金样例、事件顺序断言

## 2. 数据模型与迁移

- [ ] 2.1 `Conversation`：id、userId、title、isArchived、deletedAt、createdAt、updatedAt + `(user_id, created_at)` 索引
- [ ] 2.2 `Message`：id、conversationId、role、content、status、model、tokenCount、clientMessageId、createdAt、finishedAt
- [ ] 2.3 唯一键 `(conversation_id, client_message_id)`；索引 `(conversation_id, id)`
- [ ] 2.4 迁移应用并验证外键级联策略（会话删除不物理删消息）

## 3. AI 提供者

- [ ] 3.1 `AiProvider` 接口（`stream(input): AsyncIterable<string>`）
- [ ] 3.2 `MockProvider`：首字延迟 + 随机分段 + 可被 AbortSignal 中断
- [ ] 3.3 `DeepSeekProvider`：`fetch` + `ReadableStream` 解析 `data:` 行，识别 `[DONE]`，透传 `usage`
- [ ] 3.4 `AiModule` 工厂按 `AI_PROVIDER` 注入；缺 key 时启动即报错并提示
- [ ] 3.5 单测：解析器对分片边界（一行被切成两段）的处理

## 4. 会话模块（后端）

- [ ] 4.1 `ConversationsService`：创建（默认标题）、列表（分页 + 归档过滤）、详情（含消息统计）
- [ ] 4.2 重命名、归档/恢复、逻辑删除
- [ ] 4.3 归属校验（非本人 → `403 / 30001`）
- [ ] 4.4 控制器 + zod 校验 + Swagger
- [ ] 4.5 e2e：创建、分页、归档恢复、删除后 404、越权 403

## 5. 消息与 SSE（后端）

- [ ] 5.1 `MessagesService.send()`：幂等检查 → 写 user 消息 → 建 assistant 占位（`streaming`）→ 返回流
- [ ] 5.2 SSE 响应封装：设置头部（`text/event-stream`、`no-cache`、`X-Accel-Buffering: no`）、写 `meta`
- [ ] 5.3 逐段写 `delta`；15 秒心跳；结束时写 `done`
- [ ] 5.4 监听 `req.close` → abort 上游 → 以 `interrupted` 落库
- [ ] 5.5 上游异常 → `error` 事件（`50002`）+ `failed` 落库，不透传原始错误
- [ ] 5.6 历史消息游标分页（`before` + `limit`，倒查再反转）
- [ ] 5.7 并发重复 `clientMessageId` → `409 / 40902`
- [ ] 5.8 e2e：完整流、中断落库、幂等、上游失败分支（用 mock provider 注入故障）

## 6. 前端对话界面

- [ ] 6.1 `api/conversations.ts`、`api/messages.ts`（含 `sendMessageStream()` 手写 SSE 解析器）
- [ ] 6.2 `stores/chat.ts`：会话列表、当前会话、消息 Map（按会话隔离）、流式 buffer
- [ ] 6.3 SSE 消费器：`fetch` + `ReadableStream` + 按 `\n\n` 切事件 + `AbortController`
- [ ] 6.4 会话侧栏：新建、切换、重命名、归档、空态
- [ ] 6.5 消息列表：气泡、`status` 标记（interrupted / failed）、自动滚底、加载更早
- [ ] 6.6 流式渲染：rAF 合帧 + 增量 Markdown（未闭合块降级为纯文本）
- [ ] 6.7 输入器：Enter 发送 / Shift+Enter 换行、发送中禁用、停止生成按钮
- [ ] 6.8 乐观更新与失败重试（复用 `clientMessageId`）
- [ ] 6.9 单测：SSE 解析器（黄金样例）、合帧逻辑、store 状态迁移

## 7. 双端验收

- [ ] 7.1 mock 模式跑通全链路（发送 → 逐字 → done → 刷新后历史可查）
- [ ] 7.2 切 `AI_PROVIDER=deepseek` 复验：真实首字延迟、token 计数落库
- [ ] 7.3 中断：生成中点停止，刷新后内容为「已中断」且保留部分文本
- [ ] 7.4 幂等：制造重复提交，确认只有一条用户消息
- [ ] 7.5 越权：用另一个账号直接请求他人会话 id，得到 403
- [ ] 7.6 `openspec validate chat-stream --strict` 通过
