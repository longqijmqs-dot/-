## ADDED Requirements

### Requirement: 邮箱密码注册

系统 SHALL 提供 `POST /api/auth/register`，接收邮箱与密码（8–64 位），密码以 bcrypt 哈希存储，邮箱全局唯一且不区分大小写比较。

#### Scenario: 注册成功
- **WHEN** 客户端提交未被占用的邮箱与合法密码
- **THEN** 返回 `201` 与 `code: 0`，`data` 中含新用户 `id`、`email`、`nickname`、`role`
- **AND** 数据库中 `password_hash` 为 bcrypt 哈希，不存在任何明文密码
- **AND** 新用户默认关联 `user` 角色且 `status` 为启用

#### Scenario: 邮箱重复
- **WHEN** 客户端以已存在的邮箱（大小写不同）再次注册
- **THEN** 返回 `409` 与业务码 `40901`，不创建新记录

#### Scenario: 密码强度不足
- **WHEN** 客户端提交长度小于 8 位的密码
- **THEN** 返回 `400 / 10001` 并指出 `password` 字段问题，不执行写入

### Requirement: 登录与双令牌签发

系统 SHALL 提供 `POST /api/auth/login`，校验邮箱与密码后签发短期 access token（15 分钟）与长期 refresh token（7 天）；refresh token MUST 通过 `httpOnly`、`SameSite=Lax`、`Path=/api/auth` 的 Cookie 下发，MUST NOT 出现在响应体中。

#### Scenario: 登录成功
- **WHEN** 客户端提交正确的邮箱与密码
- **THEN** 响应体 `data` 中包含 `accessToken`、`expiresIn` 与用户基本信息
- **AND** 响应头 `Set-Cookie` 中包含 refresh token，且该 Cookie 带 `HttpOnly` 属性
- **AND** 响应体任何字段都不包含 refresh token 原文

#### Scenario: 凭证错误
- **WHEN** 客户端提交错误的密码或未注册的邮箱
- **THEN** 返回 `401 / 20001`，且两种情况的响应文案与耗时不可被用于判断邮箱是否存在

#### Scenario: 禁用账号无法登录
- **WHEN** 处于禁用状态的账号尝试登录
- **THEN** 返回 `401 / 20004`，不签发任何令牌

### Requirement: 令牌刷新与轮换

系统 SHALL 提供 `POST /api/auth/refresh`，凭 Cookie 中的 refresh token 换取新 access token，并轮换 refresh token；旧 refresh token 立即失效。已失效的 refresh token 被再次使用时，系统 MUST 判定为票据复用并吊销该用户全部 refresh token。

#### Scenario: 刷新成功并轮换
- **WHEN** 客户端携带有效 refresh Cookie 调用刷新接口
- **THEN** 返回新的 access token，并通过 `Set-Cookie` 下发新的 refresh token
- **AND** 旧 refresh token 在 Redis 中已不存在，再次使用返回 `401 / 20003`

#### Scenario: 票据复用触发全局吊销
- **WHEN** 一个已被轮换掉的 refresh token 被再次提交
- **THEN** 返回 `401 / 20003`
- **AND** 该用户所有有效 refresh token 均被清除，后续刷新一律失败

#### Scenario: 禁用用户刷新被拒绝
- **WHEN** 账号被禁用后使用其 refresh token 刷新
- **THEN** 返回 `401 / 20004`，且不下发新令牌

### Requirement: 登出与令牌吊销

系统 SHALL 提供 `POST /api/auth/logout`，使当前 refresh token 立即失效并清除 Cookie。

#### Scenario: 登出后刷新失败
- **WHEN** 已登录用户调用登出，随后用原 refresh Cookie 调用刷新接口
- **THEN** 登出返回 `code: 0` 且 `Set-Cookie` 清除 refresh Cookie
- **AND** 随后的刷新请求返回 `401 / 20003`

#### Scenario: 登出幂等
- **WHEN** 客户端在无有效 refresh token 的情况下调用登出
- **THEN** 仍返回 `code: 0`，不抛错

### Requirement: 当前用户信息

系统 SHALL 提供 `GET /api/auth/me`，返回当前登录用户的 `id`、`email`、`nickname`、`role`、`status` 与 `createdAt`，且 MUST NOT 返回密码哈希。

#### Scenario: 获取当前用户
- **WHEN** 携带有效 access token 请求
- **THEN** 返回 `code: 0` 与用户信息，响应中不含 `passwordHash` 字段

#### Scenario: 未携带令牌
- **WHEN** 请求未携带 `Authorization` 头
- **THEN** 返回 `401 / 20001`，且响应体不包含内部错误细节

### Requirement: 受保护接口的认证守卫

所有标注为需登录的接口 SHALL 经 JWT 守卫校验签名、过期时间与载荷结构；缺失、伪造或过期令牌一律返回 `401`，并在响应头声明认证方案。

#### Scenario: 伪造令牌被拒绝
- **WHEN** 客户端携带签名被篡改的 access token
- **THEN** 返回 `401 / 20001`，响应头 `WWW-Authenticate` 存在
- **AND** 不进入任何业务逻辑

#### Scenario: 过期令牌被拒绝
- **WHEN** 客户端携带已过期的 access token
- **THEN** 返回 `401 / 20002`，前端据此触发静默刷新

### Requirement: 角色授权守卫

需管理员权限的接口 SHALL 在认证校验之后校验角色，非 `admin` 角色返回 `403 / 30002`。

#### Scenario: 普通用户访问管理接口
- **WHEN** 持有 `user` 角色的令牌访问标注为 `admin` 的接口
- **THEN** 返回 `403 / 30002`，不执行任何数据读写

#### Scenario: 管理员访问管理接口
- **WHEN** 持有 `admin` 角色的令牌访问同一接口
- **THEN** 请求进入业务逻辑并返回 `code: 0`

### Requirement: 账号禁用即时失效

账号被置为禁用后，其已签发的 access token MUST 在下一次请求时即失效，而不等待令牌自然过期。

#### Scenario: 禁用后令牌立即不可用
- **WHEN** 管理员禁用某账号，该账号随后立即用原 access token 请求任意受保护接口
- **THEN** 返回 `401 / 20004`

#### Scenario: 重新启用后恢复访问
- **WHEN** 账号被重新启用且 access token 仍在有效期内
- **THEN** 该令牌可再次正常访问受保护接口

### Requirement: 登录与注册接口限流

登录与注册接口 SHALL 按 IP 限流，默认 5 次/分钟，超限返回 `429 / 42901`；成功与失败的请求均计入额度。

#### Scenario: 连续失败触发限流
- **WHEN** 同一 IP 在一分钟内第 6 次调用登录接口
- **THEN** 返回 `429 / 42901`，`message` 明确提示需等待
- **AND** 响应头包含可重试时间信息

#### Scenario: 限流不影响其他 IP
- **WHEN** 某 IP 已被限流
- **THEN** 另一 IP 的登录请求仍可正常处理

### Requirement: 密码安全存储

系统 SHALL 仅存储 bcrypt 哈希，成本因子在生产配置下不低于 10（默认 12），测试环境可通过环境变量下调；任何日志、响应与错误信息 MUST NOT 包含明文密码或哈希。

#### Scenario: 日志不含敏感字段
- **WHEN** 发生一次登录请求（无论成功或失败）
- **THEN** 结构化日志中的请求体已对 `password`、`passwordHash` 字段做脱敏
