# Design: files-and-admin

## Context

P0 核心链路已交付：认证、会话管理、AI 流式对话。本变更在其上补齐 PRD 的 P1 能力：文件管理和后台管理。

消息附件的上传、展示、AI 读取能力已在 `cea6b45` 提交中完成（`POST /api/uploads` + 附件渲染 + pdf-parse 文本抽取）。本变更将其纳入正式契约，并补齐剩余的 P1 功能。

关键约束：

- 文件存本地磁盘（学习阶段），数据库只存元数据
- 文件删除必须同步清理磁盘，不能留孤儿文件
- 管理接口只允许 admin，禁用用户后 token 立即失效
- 前端是 SPA，开发期走 Vite 代理，生产走 Nginx

## Goals / Non-Goals

**Goals:**

1. 文件管理生命周期完整：上传 → 列表 → 下载/预览 → 删除（含磁盘清理）
2. 管理接口 RBAC 严格：非 admin 一律 403，禁用用户 token 即时失效
3. 消息附件与文件管理并存：附件是消息的一部分，文件管理是独立能力

**Non-Goals:**

- 不做对象存储（OSS）——学习阶段用本地磁盘（PRD 明确）
- 不做文件分享/授权给其他用户——文件仅上传者可见
- 不做文件内容预览（Office 文档）——仅图片和 PDF 在线预览
- 不做文件搜索——按会话过滤，不做全文检索
- 不做 WebSocket 通知——管理员操作不实时推送

## Decisions

### D1 文件存储模型：File 表 + 本地磁盘

```
File 表（PRD 6.6）:
  id          bigint       PK
  user_id     bigint       FK → User.id
  conversation_id bigint   可空，FK → Conversation.id
  original_name varchar(255)  原始文件名
  stored_name   varchar(255)  存储文件名（UUID + 扩展名）
  url           varchar(512)   访问路径
  size_bytes    bigint          文件大小
  mime_type     varchar(128)   MIME 类型
  created_at    datetime
```

- **为什么用 File 表而不是只存 JSON**：PRD 要求文件列表、下载、删除等独立管理能力，需要可查询的元数据。JSON 存消息里只能满足"附件展示"，不能满足"文件管理"。
- **为什么 stored_name 用 UUID**：防止文件名冲突和路径遍历攻击。original_name 只用于展示。
- **为什么 conversation_id 可空**：文件可以独立上传（不关联会话），也可以关联到会话。

### D2 消息附件与 File 表的关系

消息附件（`Message.attachments` JSON）和 File 表**并存但不重复**：

- 消息附件：`attachments` 数组存 `{id, name, size, mimeType, url}`，用于消息展示和 AI 读取
- File 表：存独立文件元数据，用于文件管理 API（列表/下载/删除）
- **关系**：消息附件的 `url` 指向磁盘文件，File 表的 `url` 也指向同一磁盘文件。上传时先写 File 表记录，再把附件引用放进消息。

这样设计的好处：
- 消息附件不依赖 File 表存在（老消息的附件仍可展示）
- File 表独立管理文件生命周期（删除时清理磁盘）
- AI 读取附件内容不依赖 File 表（直接按 url 读磁盘）

### D3 文件删除：先删磁盘再删记录

```
删除文件:
  1. 查 File 表记录（验证归属）
  2. 从磁盘删除文件（fs.unlink）
  3. 删除 File 表记录
  4. 如果消息附件引用了该文件，附件里的 url 变成失效链接
```

- **为什么先删磁盘再删记录**：如果先删记录，磁盘文件还留着（孤儿文件）；如果磁盘删除失败，记录已删但文件还在（可通过孤儿文件扫描修复）。
- **为什么不做软删除**：PRD 没要求文件恢复，删除即永久。

### D4 管理接口鉴权：RolesGuard + Redis 禁用标记

```
GET /api/admin/users        → RolesGuard(admin)
PATCH /api/admin/users/:id/status → RolesGuard(admin)
GET /api/admin/roles        → RolesGuard(admin)
GET /api/admin/stats        → RolesGuard(admin)
```

- **禁用用户**：`PATCH /api/admin/users/:id/status` 设 `status=0`，同时写 Redis 标记 `user:disabled:<userId>`。JwtAuthGuard 每个请求检查 Redis 标记，禁用后立即 401。
- **为什么用 Redis 而不是每次查数据库**：Redis 查询比 MySQL 快一个数量级，且禁用状态变化频繁（管理员操作）。
- **为什么禁用后立即失效**：PRD 验收标准 2 明确要求"禁用用户后，其已签发的 token 访问接口立即返回 401"。

### D5 平台统计：聚合查询

```
GET /api/admin/stats:
  userCount       = COUNT(User)
  conversationCount = COUNT(Conversation)
  messageCount    = COUNT(Message)
  aiCallCount     = COUNT(Message WHERE role='assistant')
```

- 用 Prisma 的 `count` 聚合，不做全表扫描（PRD 性能要求）。
- 不做趋势分析（日活/周活），PRD 没要求。

### D6 文件列表：按用户 + 按会话过滤

```
GET /api/files?page=1&pageSize=20&conversationId=<可选>
```

- 按 `user_id` 过滤（归属校验）
- 可选按 `conversation_id` 过滤
- 分页用 `(user_id, created_at)` 索引
- 返回文件元数据列表，不含文件内容

### D7 文件下载/预览：鉴权 + 流式返回

```
GET /api/files/:id → 流式返回文件内容
```

- 验证请求者是文件所有者（或 admin）
- 图片和 PDF 支持在线预览（`Content-Disposition: inline`）
- 其他类型 `Content-Disposition: attachment`（强制下载）
- 用 Node.js `createReadStream` 流式返回，避免大文件撑爆内存

## Risks / Trade-offs

| 风险 | 应对 |
|---|---|
| 文件删除后消息附件引用失效 | 附件展示时检查文件是否存在，不存在则显示"文件已删除" |
| 孤儿文件（磁盘删除失败但记录已删） | 后续可加定时扫描任务（列入 deploy 变更） |
| 大文件下载占带宽 | 下载接口加限流（复用 ThrottlerGuard） |
| 管理接口被暴力探测 | admin 接口单独限流（比登录更严格） |
| 禁用用户后 Redis 挂了 | JwtAuthGuard 已有降级逻辑（Redis 故障时放行 + 记日志），不阻塞主流程 |

## Migration Plan

1. 契约包：`File` DTO、管理接口 DTO
2. Prisma：新增 `File` 表，生成迁移
3. 后端：FilesModule（上传/列表/下载/删除）→ AdminModule（用户/角色/统计）
4. 前端：文件管理页面 + 后台管理页面
5. 双端验证：上传 → 列表 → 下载 → 删除；admin 禁用用户 → token 失效

**回滚**：新增 File 表，`prisma migrate reset` 可重置；管理接口是新增路由，删除即可回退。

## Open Questions

- 文件删除后，消息附件里的引用怎么处理？（当前方案：附件展示时检查文件存在性，不存在则标记"已删除"）
- 是否需要文件搜索？（PRD 没要求，暂不做）
- 是否需要文件大小限制调整？（当前 10MB，PRD 要求 20MB，需对齐）
