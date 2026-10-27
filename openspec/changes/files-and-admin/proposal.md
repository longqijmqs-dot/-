# Change: files-and-admin

## Why

P0 核心链路（认证、会话、AI 流式对话）已交付。本变更补齐 PRD 的 P1 能力：**文件管理**和**后台管理**。

文件管理是 AI 对话场景的自然延伸——用户上传文件、AI 读取内容、文件随消息展示。后台管理则是把服务端 RBAC 真正落地：管理员能看用户、禁用异常账号，这是 PRD 明确要求的验收项。

这一变更的技术难度集中在三个决定成败的契约上：

1. **文件生命周期**——上传 → 列表 → 下载 → 删除，删除时要同时清理数据库记录和磁盘文件，不能留孤儿文件
2. **文件与消息的关联**——附件是消息的一部分，但文件本身需要独立管理（PRD 的 File 表）
3. **管理接口的鉴权边界**——管理接口只允许 admin，禁用用户后 token 立即失效（PRD 验收标准 2）

## What Changes

- 新增 `File` 表（PRD 6.6）：id、userId、conversationId、originalName、storedName、url、sizeBytes、mimeType、createdAt + `(user_id, created_at)` 索引
- 新增文件管理接口（PRD 7.4）：`POST /api/files`（上传）、`GET /api/files`（列表）、`GET /api/files/:id`（下载/预览）、`DELETE /api/files/:id`（删除）
- **已在本变更之前完成的部分**：消息附件上传（`POST /api/uploads`）、附件展示（前端）、AI 读取附件内容（txt/PDF 文本抽取）。这些已在 `cea6b45` 提交，本变更将其纳入正式契约并补齐剩余功能
- 新增后台管理接口（PRD 7.5）：`GET /api/admin/users`（用户列表）、`PATCH /api/admin/users/:id/status`（启用/禁用）、`GET /api/admin/roles`（角色列表）、`GET /api/admin/stats`（平台统计）
- 管理接口 SHALL 使用 `RolesGuard` 限制仅 `admin` 角色可访问
- 禁用用户时 SHALL 同时写 Redis 标记，保证已签发的 token 立即失效（PRD 验收标准 2）
- 文件删除 SHALL 同步清理磁盘文件，不留孤儿文件

## Capabilities

### New Capabilities

- `file-management`: 文件的上传、分页列表、下载/预览、删除，以及「删除时清理磁盘」的生命周期保证
- `admin-management`: 管理员的用户列表/搜索、启用/禁用用户（禁用即时生效）、角色列表、平台统计

### Modified Capabilities

- `user-auth`: 禁用用户后，Redis 标记保证其 token 立即失效（已有逻辑，本变更通过管理接口触发）

## Impact

- **接口**：新增 `/api/files`（POST/GET）、`/api/files/:id`（GET/DELETE）、`/api/admin/users`（GET）、`/api/admin/users/:id/status`（PATCH）、`/api/admin/roles`（GET）、`/api/admin/stats`（GET）
- **数据**：新增 `File` 表与迁移；`Message` 表已有 `attachments` 字段（JSON）
- **依赖**：无新增重型依赖。文件下载用 Node.js 流式读取
- **配置**：无新增环境变量（文件目录沿用 `UPLOADS_DIR`）
- **后续变更依赖**：`deploy` 需为文件服务配置 Nginx 静态资源路由与下载限流
