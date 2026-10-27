# Tasks: files-and-admin

> 前置：`chat-stream` 已交付（会话与流式对话可用）。
> 执行顺序即依赖顺序：契约 → 数据 → 后端文件管理 → 后端管理 → 前端 → 双端验收。
> 标注 [x] 的已在 `cea6b45` 提交中完成，本变更将其纳入正式契约并补齐剩余。

## 1. 契约包扩展

- [x] 1.1 `src/chat.ts`：`AttachmentSchema`（id, name, size, mimeType, url），`MessageSchema` 与 `SendMessageSchema` 新增 `attachments` 字段
- [x] 1.2 `src/files.ts`：`File` DTO（id, userId, conversationId, originalName, storedName, url, sizeBytes, mimeType, createdAt）、列表项 DTO、上传响应 DTO
- [x] 1.3 `src/admin.ts`：管理接口 DTO（用户列表项、用户状态更新入参、角色列表项、平台统计）
- [x] 1.4 `src/error-codes.ts`：`ROLE_FORBIDDEN = 30002` 已存在（无需新增，复用即可）

## 2. 数据模型与迁移

- [x] 2.1 `File` 模型：id、userId、conversationId（可空）、originalName、storedName（UUID）、url、sizeBytes、mimeType、createdAt + `(user_id, created_at)` 索引 + `(conversation_id)` 索引
- [x] 2.2 `File.userId` 外键 → `User.id`；`File.conversationId` 外键 → `Conversation.id`（可空）
- [x] 2.3 迁移应用并验证：File 表迁移已应用（`20261027190000_add_file_table`）

## 3. 文件管理后端

- [x] 3.1 `POST /api/uploads`：上传文件到磁盘，返回附件元数据（已实现）
- [x] 3.2 `FilesService.createRecord`：上传时同时写 File 表记录
- [x] 3.3 `FilesController`：`GET /api/files` 列表（分页 + 会话过滤 + 归属校验）
- [x] 3.4 `FilesController`：`GET /api/files/:id` 下载/预览（归属校验 + 流式返回 + Content-Disposition 区分 inline/attachment）
- [x] 3.5 `FilesController`：`DELETE /api/files/:id` 删除（先删磁盘再删记录，越权 403）
- [x] 3.6 Swagger 文档：文件管理接口的请求/响应描述（通过装饰器自动生成）

## 4. 后台管理后端

- [x] 4.1 `AdminController.listUsers`：`GET /api/admin/users` 分页列表 + 搜索（email/nickname）
- [x] 4.2 `AdminController.updateUserStatus`：`PATCH /api/admin/users/:id/status` 启用/禁用（写 Redis 标记，禁止禁用自己）
- [x] 4.3 `AdminController.listRoles`：`GET /api/admin/roles` 角色列表
- [x] 4.4 `AdminController.getStats`：`GET /api/admin/stats` 平台统计（userCount/conversationCount/messageCount/aiCallCount）
- [x] 4.5 所有管理接口加 `@Roles('admin')` + RolesGuard 校验
- [x] 4.6 管理接口单独限流（30 次/分钟，比业务接口 60 次/分钟更严格）
- [x] 4.7 Swagger 文档：管理接口描述（通过装饰器自动生成）

## 5. 前端管理页面

- [x] 5.1 路由：`/admin` 管理页，路由守卫仅 admin 可访问（`requiresAdmin`）
- [x] 5.2 用户列表页：分页表格 + 搜索框 + 禁用/启用按钮
- [x] 5.3 角色列表页：显示角色代码、名称、权限配置
- [x] 5.4 统计卡片：用户数、会话数、消息数、AI 调用数
- [x] 5.5 导航：对话页 ↔ 管理页切换入口（ChatView 顶栏 admin 按钮）

## 6. 双端验收

- [x] 6.1 文件上传 → 列表可见 → 下载/预览正常 → 删除后不可访问
- [x] 6.2 越权：用户 A 下载用户 B 的文件 → 403（通过归属校验）
- [x] 6.3 admin 禁用用户 → 该用户 token 立即 401（账号禁用）
- [x] 6.4 非 admin 访问管理接口 → 403
- [x] 6.5 管理接口限流生效（连续请求触发 429）
- [x] 6.6 `openspec validate files-and-admin --strict` 通过
