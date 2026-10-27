## ADDED Requirements

### Requirement: 用户列表

系统 SHALL 提供 `GET /api/admin/users`，仅 admin 角色可访问，分页返回用户列表，支持按邮箱/昵称搜索。

#### Scenario: 正常列表
- **WHEN** admin 调用 `GET /api/admin/users?page=1&pageSize=20`
- **THEN** 返回分页用户列表，含 `id`、`email`、`nickname`、`roleCode`、`status`、`lastLoginAt`、`createdAt`

#### Scenario: 搜索
- **WHEN** admin 调用 `GET /api/admin/users?keyword=zhang`
- **THEN** 返回邮箱或昵称匹配 `zhang` 的用户

#### Scenario: 非 admin 访问
- **WHEN** 普通 user 角色调用管理接口
- **THEN** 返回 `403 / 30002`（无权限）

#### Scenario: 未登录访问
- **WHEN** 未携带 token 调用管理接口
- **THEN** 返回 `401 / 20001`

### Requirement: 启用/禁用用户

系统 SHALL 提供 `PATCH /api/admin/users/:id/status`，仅 admin 可操作，设置用户状态并同步 Redis 标记。

#### Scenario: 禁用用户
- **WHEN** admin 调用 `PATCH /api/admin/users/:id/status` 设 `status=0`
- **THEN** 返回 `200`，用户 `status` 更新为 `0`
- **AND** Redis 写入 `user:disabled:<userId>` 标记
- **AND** 该用户已签发的 access token 后续请求返回 `401 / 20004`（账号禁用）

#### Scenario: 启用用户
- **WHEN** admin 调用 `PATCH /api/admin/users/:id/status` 设 `status=1`
- **THEN** 返回 `200`，用户 `status` 更新为 `1`
- **AND** Redis 删除 `user:disabled:<userId>` 标记
- **AND** 该用户后续请求恢复正常

#### Scenario: 禁用自己
- **WHEN** admin 尝试禁用自己
- **THEN** 返回 `400 / 10001`（不允许禁用自己的账号）

#### Scenario: 非 admin 操作
- **WHEN** 普通 user 角色调用禁用接口
- **THEN** 返回 `403 / 30002`

### Requirement: 角色列表

系统 SHALL 提供 `GET /api/admin/roles`，仅 admin 可访问，返回角色列表。

#### Scenario: 正常列表
- **WHEN** admin 调用 `GET /api/admin/roles`
- **THEN** 返回角色列表，含 `id`、`code`、`name`、`permissions`

#### Scenario: 非 admin 访问
- **WHEN** 普通 user 角色调用
- **THEN** 返回 `403 / 30002`

### Requirement: 平台统计

系统 SHALL 提供 `GET /api/admin/stats`，仅 admin 可访问，返回平台使用统计。

#### Scenario: 正常统计
- **WHEN** admin 调用 `GET /api/admin/stats`
- **THEN** 返回 `userCount`、`conversationCount`、`messageCount`、`aiCallCount`
- **AND** 统计数字与数据库实际记录数一致

#### Scenario: 非 admin 访问
- **WHEN** 普通 user 角色调用
- **THEN** 返回 `403 / 30002`

### Requirement: 管理接口限流

系统 SHALL 对管理接口施加比业务接口更严格的限流，防止管理后台被暴力探测。

#### Scenario: 超限
- **WHEN** admin 在短时间内连续调用管理接口超过限制
- **THEN** 返回 `429 / 60001`（限流）

### Requirement: 管理前端页面

系统 SHALL 提供后台管理页面，仅 admin 可见，包含用户列表、禁用/启用、角色列表、平台统计。

#### Scenario: 非 admin 访问管理页
- **WHEN** 普通 user 尝试访问管理页路由
- **THEN** 前端路由守卫拦截，跳转回对话页

#### Scenario: 管理页功能
- **WHEN** admin 进入管理页
- **THEN** 显示用户列表（分页+搜索）、角色列表、平台统计卡片
- **AND** 可禁用/启用用户，操作后列表即时更新
