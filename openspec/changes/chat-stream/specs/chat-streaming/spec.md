## ADDED Requirements

### Requirement: 发送消息并以 SSE 返回回复

系统 SHALL 提供 `POST /api/conversations/:id/messages`，请求体含用户消息内容与 `clientMessageId`；服务端写入用户消息后，通过 `text/event-stream` 流式返回 AI 回复。

#### Scenario: 正常发送
- **WHEN** 用户向自己的会话发送 `{ "content": "你好", "clientMessageId": "<uuid>" }`
- **THEN** 响应头 `Content-Type` 为 `text/event-stream`
- **AND** 数据库中新增一条 `role=user` 消息，其 `status` 为 `complete`
- **AND** 流结束后新增一条 `role=assistant` 消息，`status` 为 `complete` 且内容完整

#### Scenario: 用户消息立即持久化
- **WHEN** 请求已开始流式响应但尚未结束时查询数据库
- **THEN** 用户消息已存在，assistant 消息处于 `streaming` 状态

#### Scenario: 空内容被拒绝
- **WHEN** 提交 `{ "content": "   " }`
- **THEN** 返回 `400 / 10001`，不建立流

### Requirement: SSE 事件协议

流 SHALL 依次使用 `meta`、若干 `delta`、`done` 三种事件；发生错误时以 `error` 事件终止。服务端 SHALL 每 15 秒发送一次注释行心跳 `: ping`。

#### Scenario: 事件顺序正确
- **WHEN** 客户端读取完整事件流
- **THEN** 第一条事件为 `meta`，其中含 `messageId`、`conversationId`、`model`、`requestId`
- **AND** 中间为若干 `delta`，每个 `data.text` 为新增文本片段
- **AND** 最后一条为 `done`，其 `data.content` 等于全部 `delta` 拼接结果

#### Scenario: 心跳维持连接
- **WHEN** 上游模型超过 15 秒没有产出
- **THEN** 客户端能在事件流中读到 `: ping` 注释行，连接未被中间层断开

#### Scenario: done 携带完整内容
- **WHEN** 收到 `done` 事件
- **THEN** 其 `data.content` 可直接作为最终消息内容使用，无需客户端再次拼接校验

### Requirement: 消息发送幂等

系统 SHALL 以 `(conversationId, clientMessageId)` 作为幂等键；相同键的重复提交 MUST 不产生第二条用户消息。

#### Scenario: 重复提交不重复写入
- **WHEN** 客户端以相同 `clientMessageId` 连续提交两次
- **THEN** 数据库中该会话只有一条具有该 `clientMessageId` 的用户消息

#### Scenario: 并发重复提交
- **WHEN** 两个携带相同 `clientMessageId` 的请求几乎同时到达
- **THEN** 只有一个请求进入生成流程
- **AND** 另一个返回 `409 / 40902`（请求处理中），不产生重复消息

### Requirement: 流式中断落库

客户端断开连接时，系统 MUST 中止上游生成，并把已生成内容以 `status=interrupted` 持久化。

#### Scenario: 中断后保留已生成内容
- **WHEN** 流式过程中客户端断开连接
- **THEN** 该 assistant 消息被保存，`status` 为 `interrupted`
- **AND** 其内容为断开前已生成的部分（非空时）

#### Scenario: 中断后历史可查
- **WHEN** 客户端重新拉取该会话历史消息
- **THEN** 可以看到该条 `interrupted` 消息及其部分内容

#### Scenario: 上游错误时保留部分内容
- **WHEN** 模型接口返回错误或超时
- **THEN** 服务端发送 `error` 事件（业务码 `50002`）
- **AND** 已生成内容以 `status=failed` 落库

### Requirement: 历史消息游标分页

系统 SHALL 提供 `GET /api/conversations/:id/messages`，支持 `limit`（默认 30，上限 100）与 `before`（消息 id）参数，按时间升序返回并给出 `nextCursor`。

#### Scenario: 首次加载最近消息
- **WHEN** 请求 `?limit=30` 且会话有 100 条消息
- **THEN** 返回最近 30 条，按时间升序排列
- **AND** `nextCursor` 为最早一条的 id

#### Scenario: 向上翻页
- **WHEN** 请求 `?limit=30&before=<nextCursor>`
- **THEN** 返回更早的 30 条，且不包含已加载过的消息

#### Scenario: 已到最早一条
- **WHEN** 请求到会话第一条消息之前
- **THEN** `nextCursor` 为 `null`

#### Scenario: 不支持页码参数
- **WHEN** 请求携带 `?page=2`
- **THEN** 该参数被忽略，行为仍按游标语义执行

### Requirement: AI 提供者适配

系统 SHALL 通过统一接口调用模型，支持 `mock` 与 `deepseek` 两种实现，由 `AI_PROVIDER` 环境变量切换；业务代码 MUST NOT 依赖具体供应商。

#### Scenario: mock 模式可完整跑通
- **WHEN** `AI_PROVIDER=mock`
- **THEN** 无需任何外部密钥即可产生逐段 `delta`，并正常 `done`

#### Scenario: deepseek 模式流式解析
- **WHEN** `AI_PROVIDER=deepseek` 且密钥有效
- **THEN** 服务端把上游 `data:` 行解析为 `delta` 事件
- **AND** 上游 `data: [DONE]` 被识别为流结束
- **AND** `usage` 中的 token 数写入消息的 `token_count`

#### Scenario: 上游不可用
- **WHEN** 模型接口返回 5xx 或超时
- **THEN** 客户端收到 `error` 事件，业务码为 `50002`
- **AND** 不泄露上游返回的原始报文
