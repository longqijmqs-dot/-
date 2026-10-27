## ADDED Requirements

### Requirement: 文件上传

系统 SHALL 提供 `POST /api/files`，接受 `multipart/form-data` 请求，将文件保存到本地磁盘并创建 `File` 表记录。

#### Scenario: 正常上传
- **WHEN** 用户携带文件调用 `POST /api/files`
- **THEN** 返回 `201` 与文件元数据（`id`、`originalName`、`storedName`、`url`、`sizeBytes`、`mimeType`）
- **AND** 磁盘上新增一个以 UUID 命名的存储文件
- **AND** `File` 表中新增一条记录，`user_id` 为当前用户

#### Scenario: 类型不在白名单
- **WHEN** 上传 `.exe` 或 `.sh` 等不在白名单的类型
- **THEN** 返回 `400 / 10001`，消息明确指出不支持的类型

#### Scenario: 超过大小限制
- **WHEN** 上传超过 10MB 的文件
- **THEN** 返回 `400 / 10001`

#### Scenario: 未登录上传
- **WHEN** 未携带 access token 调用上传接口
- **THEN** 返回 `401 / 20001`

### Requirement: 文件列表

系统 SHALL 提供 `GET /api/files`，按用户分页返回文件列表，支持按会话过滤。

#### Scenario: 正常列表
- **WHEN** 用户调用 `GET /api/files?page=1&pageSize=20`
- **THEN** 返回当前用户的文件元数据列表（不含内容），按创建时间倒序
- **AND** 响应包含分页信息

#### Scenario: 按会话过滤
- **WHEN** 用户调用 `GET /api/files?conversationId=<id>`
- **THEN** 只返回该会话关联的文件

#### Scenario: 不返回他人文件
- **WHEN** 用户 A 尝试查看用户 B 的文件列表
- **THEN** 返回的列表只包含用户 A 自己的文件

### Requirement: 文件下载与预览

系统 SHALL 提供 `GET /api/files/:id`，验证归属后流式返回文件内容。

#### Scenario: 图片在线预览
- **WHEN** 请求者下载图片文件
- **THEN** `Content-Disposition` 为 `inline`，浏览器内预览
- **AND** `Content-Type` 为正确的图片 MIME 类型

#### Scenario: PDF 在线预览
- **WHEN** 请求者下载 PDF 文件
- **THEN** `Content-Disposition` 为 `inline`，浏览器内预览

#### Scenario: 其他类型强制下载
- **WHEN** 请求者下载 `.txt` 或 `.zip` 等非预览类型
- **THEN** `Content-Disposition` 为 `attachment`，浏览器触发下载

#### Scenario: 越权下载
- **WHEN** 用户 A 尝试下载用户 B 的文件
- **THEN** 返回 `403 / 30001`

#### Scenario: 文件不存在
- **WHEN** 请求不存在的文件 ID
- **THEN** 返回 `404 / 40401`

### Requirement: 文件删除

系统 SHALL 提供 `DELETE /api/files/:id`，删除数据库记录并同步清理磁盘文件。

#### Scenario: 正常删除
- **WHEN** 文件所有者调用 `DELETE /api/files/:id`
- **THEN** 返回 `200`
- **AND** 磁盘上的存储文件被删除
- **AND** `File` 表中的记录被删除

#### Scenario: 越权删除
- **WHEN** 非所有者（且非 admin）调用删除
- **THEN** 返回 `403 / 30001`

#### Scenario: 删除后不可访问
- **WHEN** 文件被删除后再次请求该文件
- **THEN** 返回 `404 / 40401`

### Requirement: 消息附件展示

系统 SHALL 在消息气泡中展示附件：图片显示缩略图（点击看大图），其他类型显示文件图标 + 名称 + 大小 + 下载链接。

#### Scenario: 图片附件
- **WHEN** 消息包含图片附件
- **THEN** 气泡中显示缩略图，点击可查看大图

#### Scenario: 文件附件
- **WHEN** 消息包含非图片附件（如 PDF）
- **THEN** 气泡中显示文件图标、名称、大小，点击可下载

#### Scenario: 深色气泡样式适配
- **WHEN** 用户消息气泡（深色背景）中显示附件
- **THEN** 附件卡片使用浅色文字和半透明白底，保证可读性

### Requirement: AI 读取附件内容

系统 SHALL 在发送消息时，将附件文本内容拼入 AI 上下文。文本类文件（txt/md/csv/json/代码）直接读取；PDF 使用 pdf.js 抽取文本；图片等二进制格式告知 AI"暂不支持读取"。

#### Scenario: txt 附件
- **WHEN** 用户发送包含 txt 附件的消息
- **THEN** AI 上下文中包含附件文本内容
- **AND** AI 能回答附件中的具体信息

#### Scenario: PDF 附件
- **WHEN** 用户发送包含 PDF 附件的消息
- **THEN** AI 上下文中包含 PDF 抽取的文本
- **AND** AI 能回答 PDF 中的具体信息

#### Scenario: 图片附件
- **WHEN** 用户发送包含图片附件的消息
- **THEN** AI 上下文中包含"附件为图片格式，暂不支持读取内容"的提示
- **AND** AI 不会编造图片内容

#### Scenario: 附件内容过长
- **WHEN** 附件文本超过 8000 字符
- **THEN** 截断到 8000 字符，并提示"内容过长已截断"

#### Scenario: 二进制伪装文本
- **WHEN** 文件声明为 `text/plain` 但内容是二进制（如 zip）
- **THEN** 跳过内容抽取，降级为仅文件名告知
- **AND** 不把乱码喂给 AI
