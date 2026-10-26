# Tasks: contract-and-auth

> 执行顺序即依赖顺序。第 1 节不通不进入第 2 节（环境是 P0 硬前提）。
> 每节末尾的验证项必须真实执行并记录输出，不接受「应该可以」。

## 1. 环境基线（WSL2 + Docker）

- [ ] 1.1 在 WSL2 中安装 Docker Engine 与 compose 插件，确认 `docker version` / `docker compose version` 可用
- [ ] 1.2 编写 `compose.yaml`：`mysql:8.4`（utf8mb4、时区 +08:00、数据卷、healthcheck）、`redis:7-alpine`（appendonly、healthcheck）
- [ ] 1.3 编写 `.env.example`，提供端口变量（`MYSQL_PORT`、`REDIS_PORT`）与连接串占位
- [ ] 1.4 `docker compose up -d` 后确认两容器 `healthy`，宿主可连通 3306/6379
- [ ] 1.5 验证 `down` 再 `up` 后数据卷仍在（建一张临时表验证）

## 2. 工程骨架

- [ ] 2.1 `git init`，编写 `.gitignore`（node_modules、dist、.env、storage、coverage、.tmp）
- [ ] 2.2 根 `package.json` + `pnpm-workspace.yaml` + `tsconfig.base.json`（含 `paths: { "@app/contract": ... }`）
- [ ] 2.3 `packages/contract` 骨架：`package.json`（exports 指向源码）、tsconfig、`src/index.ts`
- [ ] 2.4 `apps/api`：NestJS 11 脚手架 + 严格 tsconfig + 路径别名可解析
- [ ] 2.5 `apps/web`：Vite + Vue3 + TS + Pinia + Vue Router 脚手架，`server.proxy` 把 `/api` 代理到 3000
- [ ] 2.6 根脚本：`dev`（concurrently）、`dev:api`、`dev:web`、`build`、`test`、`lint`、`db:*`
- [ ] 2.7 首次提交（骨架 + compose + openspec 工件）

## 3. 契约包

- [ ] 3.1 `src/envelope.ts`：信封类型 + zod schema + 成功/失败构造助手
- [ ] 3.2 `src/error-codes.ts`：分段错误码枚举 + `ERROR_MESSAGES` 中文文案表
- [ ] 3.3 `src/pagination.ts`：分页参数 schema（page≥1、pageSize≤100）+ 分页结果类型
- [ ] 3.4 `src/auth.ts`：注册/登录/刷新/用户信息的 zod schema 与推导类型
- [ ] 3.5 预留 `src/events.ts` 命名空间注释（SSE 事件，本期不实现）
- [ ] 3.6 单测：信封 schema 正反例、错误码唯一性、分页边界（`pnpm --filter contract test`）

## 4. 后端横切底座

- [ ] 4.1 `ConfigModule` + zod 环境变量校验（缺失即启动失败）
- [ ] 4.2 `nestjs-cls` 中间件：生成/沿用 `X-Request-Id`，写响应头
- [ ] 4.3 `TransformInterceptor`：把返回值包装为信封（含 `requestId`）
- [ ] 4.4 `AllExceptionsFilter`：统一映射 HTTP 异常 / zod 校验 / Prisma 已知错误 / 未知异常，脱敏输出
- [ ] 4.5 `nestjs-pino` 结构化日志 + 密码字段脱敏 + 请求耗时
- [ ] 4.6 全局 `ValidationPipe`（与 zod DTO 对接）并输出字段级错误
- [ ] 4.7 Swagger 接入（`/api/docs`），从 zod DTO 派生 schema
- [ ] 4.8 单测：拦截器包装、过滤器映射矩阵、requestId 一致性

## 5. 数据模型与迁移

- [ ] 5.1 `schema.prisma`：`User`（email 唯一、passwordHash、nickname、roleId、status、lastLoginAt、时间戳）
- [ ] 5.2 `schema.prisma`：`Role`（code 唯一、name、permissions Json、createdAt）
- [ ] 5.3 索引：`User.email` 唯一；外键 `User.roleId → Role.id`
- [ ] 5.4 生成首次迁移并应用（`db:migrate`）
- [ ] 5.5 种子脚本：`admin`/`user` 角色（幂等 upsert）+ 由环境变量初始化的管理员账号
- [ ] 5.6 验证 `db:reset` 可从零重建

## 6. 认证模块（后端）

- [ ] 6.1 `AuthModule` / `UsersModule` 骨架 + PrismaService + RedisService（ioredis，连接失败降级策略见 design D5）
- [ ] 6.2 注册：唯一性检查（大小写不敏感）+ bcrypt 哈希 + 默认角色
- [ ] 6.3 登录：凭证校验 + 签发 access/refresh + 写入 `refresh:{jti}` + 下发 httpOnly Cookie
- [ ] 6.4 刷新：校验 Cookie → 查白名单 → 轮换（删除旧 jti、写入新 jti）→ 复用检测触发全量吊销
- [ ] 6.5 登出：删除 jti + 写黑名单 + 清 Cookie，保证幂等
- [ ] 6.6 `GET /auth/me`
- [ ] 6.7 `JwtAuthGuard`：签名/过期/载荷校验 + Redis 禁用标记校验 + Redis 故障降级
- [ ] 6.8 `RolesGuard` + `@Roles()` 装饰器
- [ ] 6.9 限流：`ThrottlerModule` + Redis storage，登录/注册 5 次/分钟/IP，全局 60 次/分钟
- [ ] 6.10 e2e：注册→登录→me→刷新轮换→复用检测→登出→禁用即时失效→限流 429 全链路

## 7. 前端认证闭环

- [ ] 7.1 `http.ts`：Axios 实例（baseURL `/api`、带 Authorization、`withCredentials`）
- [ ] 7.2 响应拦截器：信封解包、业务码映射提示、`401/20002` 进入刷新流程
- [ ] 7.3 `refreshPromise` 单飞 + 挂起队列重放（最多 1 次，刷新接口豁免）
- [ ] 7.4 `auth` store：内存 token、用户信息、`bootstrapSession()` 启动恢复、`logout()`
- [ ] 7.5 登录/注册页（自建表单 + Naive UI 原子组件），含加载态、字段级错误、跳转
- [ ] 7.6 路由守卫：登录态 + 角色，记录 `redirect` 参数
- [ ] 7.7 布局壳：顶栏（用户菜单/登出）+ 空态占位页（对话页留待下一变更）
- [ ] 7.8 单测：拦截器（并发 401 只刷新一次、刷新失败登出、未知码兜底）、路由守卫、store 恢复

## 8. 双端联调与验收

- [ ] 8.1 手动联调清单：注册 → 登录 → 刷新页面保持登录 → 令牌过期静默刷新 → 登出 → 禁用后 401 提示
- [ ] 8.2 检查浏览器 LocalStorage/SessionStorage 无 token
- [ ] 8.3 检查 Network 面板 refresh 请求携带 Cookie 且响应体无 refresh token
- [ ] 8.4 校验错误提示的 `requestId` 能在后端日志中检索到同一条请求
- [ ] 8.5 `pnpm build` + `pnpm test` 双端全绿
- [ ] 8.6 `openspec validate contract-and-auth --strict` 通过

## 9. 收尾

- [ ] 9.1 ESLint + Prettier 配置（双端共享 base）
- [ ] 9.2 `README.md`：环境准备、启动步骤、脚本说明、目录结构
- [ ] 9.3 记录与 PRD 的偏离清单（refresh Cookie、错误码体系、分页契约）到 `docs/prd-deviations.md`
- [ ] 9.4 提交并归档本变更
