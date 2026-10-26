## ADDED Requirements

### Requirement: 创建会话

系统 SHALL 提供 `POST /api/conversations`，为用户创建会话并自动生成默认标题（如「新对话 · 月日 时分」），返回会话 id、标题与时间戳。

#### Scenario: 创建成功
- **WHEN** 已登录用户提交空请求体创建会话
- **THEN** 返回 `201` 与 `code: 0`，`data` 含 `id`、`title`、`createdAt`
- **AND** 该会话归属当前用户

#### Scenario: 可指定标题
- **WHEN** 请求体带 `{ "title": "算法讨论" }`
- **THEN** 会话标题为「算法讨论」，其余字段照常生成

#### Scenario: 标题超长
- **WHEN** 标题超过 128 字符
- **THEN** 返回 `400 / 10001` 并指出 `title` 字段，不创建会话

### Requirement: 会话列表分页

系统 SHALL 提供 `GET /api/conversations`，仅返回当前用户的会话，按创建时间倒序，默认排除已归档与已删除，返回分页结构 `{ items, page, pageSize, total, hasMore }`。

#### Scenario: 默认不含归档会话
- **WHEN** 用户有两个会话，其中一个已归档
- **THEN** 默认列表只返回未归档的一个

#### Scenario: 显式查看归档
- **WHEN** 请求 `?archived=true`
- **THEN** 只返回已归档会话

#### Scenario: 只返回自己的会话
- **WHEN** 用户 A 请求列表，而库中存在用户 B 的会话
- **THEN** 响应中不出现 B 的任何会话

#### Scenario: 分页参数生效
- **WHEN** 用户有 25 个会话，请求 `?page=2&pageSize=10`
- **THEN** 返回 10 条、`page: 2`、`total: 25`、`hasMore: true`

### Requirement: 会话详情

系统 SHALL 提供 `GET /api/conversations/:id`，返回会话元信息与消息统计（消息总数、最后一条消息时间）。

#### Scenario: 查看本人会话
- **WHEN** 用户请求自己会话的详情
- **THEN** 返回 `code: 0`，`data` 含 `id`、`title`、`isArchived`、`messageCount`、`lastMessageAt`

#### Scenario: 查看不存在的会话
- **WHEN** 请求一个不存在的 id
- **THEN** 返回 `404 / 40401`

### Requirement: 重命名会话

系统 SHALL 提供 `PATCH /api/conversations/:id`，允许修改标题，标题长度 1–128 字符。

#### Scenario: 重命名成功
- **WHEN** 用户提交 `{ "title": "新的标题" }`
- **THEN** 返回 `code: 0`，再次查询详情时标题已更新

#### Scenario: 空标题被拒绝
- **WHEN** 提交 `{ "title": "" }`
- **THEN** 返回 `400 / 10001`

### Requirement: 归档与恢复

系统 SHALL 支持通过 `PATCH /api/conversations/:id` 的 `isArchived` 字段归档或恢复会话；归档不影响消息读写，仅影响默认列表可见性。

#### Scenario: 归档后从默认列表消失
- **WHEN** 用户把会话归档后请求默认列表
- **THEN** 该会话不在 `items` 中

#### Scenario: 恢复后重新可见
- **WHEN** 用户把该会话恢复（`isArchived: false`）后请求默认列表
- **THEN** 该会话重新出现在列表中

### Requirement: 删除会话

系统 SHALL 提供 `DELETE /api/conversations/:id`，采用逻辑删除（写 `deletedAt`）；删除后该会话及其消息不可再被查询。

#### Scenario: 删除后不可访问
- **WHEN** 用户删除会话后请求其详情
- **THEN** 返回 `404 / 40401`

#### Scenario: 删除后消息不可查
- **WHEN** 用户删除会话后尝试拉取该会话消息
- **THEN** 返回 `404 / 40401`

#### Scenario: 删除是逻辑删除
- **WHEN** 查询数据库
- **THEN** 该会话记录仍存在且 `deletedAt` 非空

### Requirement: 会话越权保护

所有会话相关接口 MUST 校验归属；操作他人会话返回 `403 / 30001`，且不返回该会话的任何内容。

#### Scenario: 访问他人会话详情
- **WHEN** 用户 A 请求用户 B 的会话详情
- **THEN** 返回 `403 / 30001`，响应体中不含 B 的会话数据

#### Scenario: 向他人会话发送消息
- **WHEN** 用户 A 向用户 B 的会话发送消息
- **THEN** 返回 `403 / 30001`，不写入任何消息
