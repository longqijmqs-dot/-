## ADDED Requirements

### Requirement: 成功响应统一信封

系统 SHALL 对所有 JSON 接口的响应返回四字段信封 `{ code, message, data, requestId }`，其中 `code` 为 `0` 表示成功，`data` 承载业务载荷，未成功时 `data` SHALL 为 `null`。非 JSON 响应（如文件流、SSE）不适用本要求。

#### Scenario: 成功调用返回 code 0 与 requestId
- **WHEN** 客户端以有效凭据调用任意受保护接口
- **THEN** 响应体包含 `code: 0`、非空 `message`、业务数据与一个非空 `requestId`
- **AND** 响应头包含 `X-Request-Id`，其值与响应体 `requestId` 相同

#### Scenario: 成功响应不包裹原始结构
- **WHEN** 接口返回单个对象（如当前用户信息）
- **THEN** 该对象位于 `data` 字段下，而不是与 `code` 平级散落

### Requirement: 错误响应统一结构

系统 SHALL 让所有错误（含框架级 404、未捕获异常、校验失败、限流）走同一异常过滤器，输出相同的四字段信封，且错误内容 SHALL NOT 泄露堆栈、SQL、文件路径或内部异常消息。

#### Scenario: 未捕获异常不泄露内部细节
- **WHEN** 服务内部抛出未预期异常
- **THEN** 响应状态码为 500，`code` 为 `50000`，`message` 为通用文案
- **AND** 响应体与响应头均不含堆栈信息
- **AND** 完整异常与堆栈仅写入服务端日志，并可通过 `requestId` 关联

#### Scenario: 不存在的路由返回统一结构
- **WHEN** 客户端请求未注册的路径
- **THEN** 响应状态码为 404，响应体仍是四字段信封且含 `requestId`

### Requirement: 业务错误码分段且不复用

错误码 SHALL 按域分段：`0` 成功、`10xxx` 参数校验、`20xxx` 认证、`30xxx` 授权、`40xxx` 资源、`42xxx` 限流、`50xxx` 服务端。同一含义的码值发布后 MUST NOT 被赋予新含义；HTTP 状态码与业务码 MUST 同时具备。

#### Scenario: 认证类错误使用 20xxx 段
- **WHEN** 客户端携带已过期的 access token 访问受保护接口
- **THEN** HTTP 状态码为 401，业务码为 `20002`
- **AND** 前端可仅凭业务码区分「令牌过期」与「账号禁用（20004）」并采取不同行为

#### Scenario: 错误码常量与文案前后端同源
- **WHEN** 开发者新增一个业务错误码
- **THEN** 该码值与中文文案同时出现在 `packages/contract` 中
- **AND** 前端无需修改业务代码即可展示该文案

### Requirement: 列表分页契约

列表接口 SHALL 接收 `page`（从 1 开始）与 `pageSize`（默认 20，上限 100）并返回 `{ items, page, pageSize, total, hasMore }`；`page` 小于 1 或 `pageSize` 超出范围时 SHALL 返回 `400 / 10001` 而不是静默修正。

#### Scenario: 分页参数生效
- **WHEN** 客户端请求 `?page=2&pageSize=10` 且总记录数为 25
- **THEN** 返回 10 条数据、`page: 2`、`pageSize: 10`、`total: 25`、`hasMore: true`

#### Scenario: 非法分页参数被拒绝
- **WHEN** 客户端请求 `?page=0` 或 `?pageSize=500`
- **THEN** 返回 400 与业务码 `10001`，并指出出错字段

### Requirement: 参数校验错误返回字段级信息

请求体、查询参数或路径参数校验失败时，系统 SHALL 返回 `400 / 10001`，并在 `data` 中给出字段级错误列表（字段名 + 失败原因），便于前端定位到具体输入项。

#### Scenario: 邮箱格式非法
- **WHEN** 客户端提交 `{ "email": "not-an-email", "password": "12345678" }`
- **THEN** 返回 400 与 `code: 10001`
- **AND** `data.errors` 中包含指向 `email` 字段的条目
- **AND** 不执行任何数据库写入

### Requirement: 请求标识贯穿请求生命周期

系统 SHALL 为每个请求建立请求上下文，生成或沿用 `X-Request-Id`，并在响应头、响应体、结构化日志三处使用同一值。

#### Scenario: 客户端透传 requestId
- **WHEN** 客户端请求头携带 `X-Request-Id: abc-123`
- **THEN** 响应体 `requestId` 与响应头 `X-Request-Id` 均为 `abc-123`
- **AND** 该请求的所有日志行均包含 `abc-123`

#### Scenario: 客户端未提供 requestId
- **WHEN** 客户端未携带 `X-Request-Id`
- **THEN** 系统生成一个新的唯一标识并回传，且同一请求内日志一致
