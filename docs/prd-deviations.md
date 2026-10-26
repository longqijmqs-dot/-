# 与 PRD 的偏离清单

> PRD 原始文档：`自建AI对话平台后端-PRD.docx`（v0.1，2026-10-26）
>
> 本项目在实现过程中对 PRD 做了若干**有意识的调整**。每一条都记录「原来是什么 / 改成什么 / 为什么 / 影响」，
> 避免以后看代码时误以为是遗漏。产品需求层面没变，变的是接口契约与实现细节。

## 一、接口契约层面

### 1. refresh token 改走 httpOnly Cookie

- **PRD**：登录响应返回 `accessToken` + `refreshToken`，由前端保存（隐含 localStorage）。
- **实际**：只返回 `accessToken`；`refreshToken` 写入 `httpOnly; SameSite=Lax; Path=/api/auth` 的 Cookie。
- **为什么**：refresh token 一旦落到 localStorage，任意一次 XSS 就等价于「7 天账号失守」。Cookie 方案下 JS 读不到，浏览器自动携带。
- **影响**：PRD 第 7.1 节接口清单的响应体描述需按此更新；开发期必须用 Vite 代理保持同源，否则 Cookie 带不上。

### 2. 响应信封增加 `requestId`

- **PRD**：`{ code, message, data }`，`requestId` 只在错误响应里出现。
- **实际**：所有响应（含成功）都带 `requestId`，同时写入响应头 `X-Request-Id`。
- **为什么**：用户报「刚才那个操作失败了」时，只有成功响应也带单号，才能从日志里捞出那次请求。
- **影响**：前端拦截器统一读取 `requestId`，错误提示里可展开查看。

### 3. 业务错误码分段并作为前端分支依据

- **PRD**：只提到「含业务码」。
- **实际**：`0` 成功、`10xxx` 参数、`20xxx` 认证、`30xxx` 授权、`40xxx` 资源、`42xxx` 限流、`50xxx` 服务端；码值与中文文案集中在 `packages/contract`。
- **为什么**：HTTP 401 无法区分「令牌过期（应静默续期）」与「账号被禁用（应立即踢下线）」，必须靠业务码。
- **影响**：新增错误码时前后端不需要改分支逻辑，只需补文案。

### 4. 列表分页拆成两种契约

- **PRD**：会话列表 `page/pageSize`；消息「按会话分页、时间升序」。
- **实际**：会话/文件/后台用 `page/pageSize`；**消息改用游标** `before=<messageId>&limit`，返回 `{ items（升序）, nextCursor }`。
- **为什么**：聊天记录是「从最新往回翻」，且新消息随时插入；用页码会出现「翻页时同一批消息重复或跳过」。
- **影响**：消息接口参数与 PRD 不同，属改进。

### 5. 参数校验用 zod 而非 class-validator

- **PRD**：未指定，NestJS 默认是 class-validator。
- **实际**：DTO 用 zod 定义在契约包内，后端通过 `ZodValidationPipe` 校验，前端复用同一份 schema。
- **为什么**：契约只维护一份；前端能在提交前用同一规则做本地校验，避免「前端放过、后端拒绝」。
- **影响**：Swagger 的 schema 由 zod 派生（当前用 `@ApiProperty` 手写部分，后续可接 nestjs-zod 自动生成）。

### 6. SSE 只承诺 fetch 流式读取，不再宣称兼容 EventSource

- **PRD**：5.4「兼容主流浏览器 EventSource 与 fetch 流式读取」。
- **实际**：`POST /messages` 返回事件流，前端必须用 `fetch + ReadableStream` 自行解析；EventSource 不支持 POST 和自定义请求头。
- **为什么**：退不掉——EventSource 无法携带 `Authorization`，也无法发 POST。
- **影响**：SSE 事件协议（`meta` / `delta` / `done` / `error` + 心跳）需显式定义，见第二段变更。

## 二、数据模型层面

### 7. `Conversation` 增加 `deleted_at`

- **PRD 自相矛盾**：6.7 写「会话采用逻辑删除（`is_archived` + 删除标记）」，但 6.4 的表结构里没有任何删除字段。
- **实际**：增加 `deleted_at`（可空），归档与删除是两个独立状态。
- **影响**：删除会话 = 打时间戳；查询默认过滤 `deleted_at IS NULL`。

### 8. `Message` 增加 `status` / `client_message_id` / `finished_at`

- **PRD**：无。
- **实际**：`status`（streaming/complete/interrupted/failed）、`client_message_id`（唯一键 `(conversation_id, client_message_id)`）、`finished_at`。
- **为什么**：① `status` 是「流式中断后已生成内容落库」的实现前提；② `client_message_id` 提供幂等，移动网络重试不会产生两条用户消息、也不会重复计费。
- **影响**：第二段变更实现。

### 9. `User` 增加 `last_login_at`

- **PRD**：无。
- **实际**：登录成功时更新，后台用户列表可用。成本为零，顺手加。

### 10. 不新增 `AiCallLog` 表

- **PRD**：FR-3.5 只要求记 token 数（P2）。
- **实际**：先落在 `Message.token_count`，不单独建表。
- **为什么**：YAGNI。真要做成本分析再建表，届时通过迁移追加。

## 三、实现层面

### 11. 限流存储当前为内存，非 Redis

- **PRD / 设计**：`@nestjs/throttler` + Redis 存储。
- **实际**：暂用默认内存存储（`@nest-lab/throttler-storage-redis` 未引入）。
- **为什么**：单实例开发环境行为一致，先保证 429 语义正确。
- **影响**：**多实例部署前必须切换**，否则每个实例各自计数。已列入 `deploy` 变更。

### 12. bcrypt 实现用 `@node-rs/bcrypt`

- **PRD**：bcrypt，成本因子 ≥ 10。
- **实际**：`@node-rs/bcrypt`（Rust 原生实现，算法仍是 bcrypt），成本因子默认 12。
- **为什么**：`bcrypt` 包在 Windows 上需要 node-gyp 与 VS 构建工具，环境成本高；`@node-rs/bcrypt` 有预编译产物。
- **影响**：哈希格式兼容（`$2b$`），随时可换回 `bcrypt`。

### 13. Prisma 迁移账号需要建库权限

- **实际**：本地把 `aichat` 账号补了 `CREATE/DROP/ALTER/REFERENCES/INDEX`，因为 `prisma migrate dev` 需要创建**影子数据库**做 diff。
- **为什么**：影子库是 Prisma 校验「数据库结构与 schema 是否一致」的机制，不能让应用账号在生产长期拥有建库权限。
- **影响**：生产应拆成 `app`（读写业务表）与 `migrator`（建表改表）两个账号，已在 `deploy` 变更列入。

### 14. 契约包需要先构建

- **实际**：`packages/contract` 产出 `dist/cjs`（给 NestJS）与 `dist/esm`（给 Vite）。
- **为什么**：曾尝试让 Vite 直接吃 TS 源码，结果因 `export * from './xxx'` 缺少扩展名导致浏览器端导出为空。稳定做法是构建产物。
- **影响**：`pnpm dev` / `pnpm build:api` / `pnpm build:web` 均已内置 `build:contract`，无需手动。
