# Tasks: contract-and-auth

> 执行顺序即依赖顺序。第 1 节不通不进入第 2 节（环境是 P0 硬前提）。
> 每节末尾的验证项必须真实执行并记录输出，不接受「应该可以」。
>
> 状态更新于 2026-10-27。**环境已全部打通**：WSL 3.0.3.0 + Debian 11 + Docker 29.8 + MySQL 8.4 + Redis 7，
> 本地 compose 两容器 healthy，Windows 侧 3306/6379 均连通。

## 1. 环境基线（WSL2 + Docker）

- [x] 1.1 WSL 3.0.3.0 已就绪；容器运行时用 **WSL2 内 Docker Engine**（`wsl --install` 下载 Ubuntu 失败，改道手动安装 Debian）
- [x] 1.2 `compose.yaml`：`mysql:8.4`（utf8mb4、+08:00、数据卷、healthcheck）、`redis:7-alpine`（appendonly、healthcheck）
- [x] 1.3 `.env.example` + 根 `.env`（随机密钥）+ `apps/api/.env`（Prisma 需要）
- [x] 1.4 `docker compose up -d` 后两容器 `healthy`，Windows 侧 3306/6379 `TcpTestSucceeded=True`
- [ ] 1.5 数据卷持久化验证（`down` 再 `up` 后数据仍在）——待补

## 2. 工程骨架

- [x] 2.1 `git init` + `.gitignore`
- [x] 2.2 根 `package.json` + `pnpm-workspace.yaml`（storeDir / nodeLinker=hoisted 本机适配）+ `tsconfig.base.json`（**不含 paths**，避免子项目继承别名后 rootDir 报错）
- [x] 2.3 `packages/contract`：源码 + `tsconfig.build.json`，`main`/`types` 指向 `dist`，`exports.import` 指向源码（给 Vite）
- [x] 2.4 `apps/api`：NestJS 11 + 严格 tsconfig + CommonJS 构建
- [ ] 2.5 `apps/web`：Vite + Vue3 + Pinia + Router 脚手架（下一阶段）
- [x] 2.6 根脚本：`dev:api`、`build:api`、`db:migrate`、`db:seed`、`db:studio`、`test`、`typecheck`
- [x] 2.7 已提交（多次）

## 3. 契约包

- [x] 3.1 `envelope.ts`：类型 + schema + `ok()` / `fail()` / `isSuccess()`
- [x] 3.2 `error-codes.ts`：13 个错误码 + 中文文案 + 分段断言
- [x] 3.3 `pagination.ts`：页码分页 + 游标分页
- [x] 3.4 `auth.ts`：注册 / 登录 / 用户 DTO（zod）
- [x] 3.5 `index.ts` 预留 SSE 命名空间注释
- [x] 3.6 单测 **32 个全绿**（`pnpm --filter @app/contract test`）

## 4. 后端横切底座

- [x] 4.1 `ConfigModule` + zod 环境变量校验（缺失即启动失败）
- [x] 4.2 `nestjs-cls` 请求上下文 + `X-Request-Id` 生成 / 透传 / 回写
- [x] 4.3 `TransformInterceptor` 统一信封
- [x] 4.4 `AllExceptionsFilter`：AppError / ZodError / Prisma P2002·P2025·P2003 / HttpException / 兜底；5xx 脱敏
- [x] 4.5 pino 结构化日志 + 敏感字段脱敏 + requestId
- [x] 4.6 `ZodValidationPipe` 字段级错误（替代 class-validator，契约同源）
- [x] 4.7 Swagger `/api/docs`
- [ ] 4.8 横切层单测（拦截器、过滤器映射矩阵）——待补

## 5. 数据模型与迁移

- [x] 5.1 `User`（email 唯一、passwordHash、nickname、roleId、status、lastLoginAt）
- [x] 5.2 `Role`（code 唯一、name、permissions JSON）
- [x] 5.3 唯一索引 + 外键 + `users_role_id_idx`
- [x] 5.4 首次迁移已应用（`20261026162528_init`）
- [x] 5.5 种子：`admin` / `user` 角色 + 管理员账号（幂等 upsert）
- [ ] 5.6 `db:reset` 从零重建验证——待补

## 6. 认证模块（后端）

- [x] 6.1 AuthModule + PrismaService + RedisService（连接失败不阻塞启动）
- [x] 6.2 注册：唯一性靠唯一索引 + P2002（避免「先查再插」竞态）+ bcrypt + 默认 user 角色
- [x] 6.3 登录：凭证校验（用户不存在也跑一次哈希，防计时探测）+ 双令牌 + `refresh:{jti}` 白名单 + httpOnly Cookie
- [x] 6.4 刷新：签名校验 → 白名单命中 → 轮换 → **复用检测触发全量吊销**
- [x] 6.5 登出：删除 jti + 清 Cookie，幂等
- [x] 6.6 `GET /auth/me`
- [x] 6.7 `JwtAuthGuard`：全局默认鉴权 + `@Public()` 白名单 + 过期 20002 + 禁用 20004 + Redis 故障降级
- [x] 6.8 `RolesGuard` + `@Roles()`
- [x] 6.9 限流：登录 / 注册 5 次/分钟，全局 60 次/分钟（**存储为内存，非 Redis**，见偏离清单）
- [x] 6.10 手工端到端验证（见「验证记录」）；自动化 e2e 待补

## 7. 前端认证闭环

- [x] 7.1 `http.ts`：Axios 实例（baseURL `/api`、携带 Bearer、`withCredentials`）
- [x] 7.2 响应拦截器：信封解包、业务码映射、`401/20002` 触发刷新
- [x] 7.3 `refreshSession()` 单飞 + 挂起重放（最多 1 次，登录/注册/登出/刷新自身豁免）
- [x] 7.4 `auth` store：内存 token、用户信息、`bootstrap()` 启动恢复、`logout()`
- [x] 7.5 登录 / 注册页（自建表单 + 品牌分栏布局），含加载态、字段级错误、本地校验
- [x] 7.6 路由守卫：登录态 + 角色 + `redirect` 回跳 + `guestOnly`
- [x] 7.7 布局壳：顶栏（品牌 / 用户 / 角色 / 退出）+ 会话自检页
- [ ] 7.8 前端单测（拦截器并发 401、刷新失败登出、守卫）——待补

## 8. 双端联调与验收

- [x] 8.1 手动联调：注册 → 登录 → 进入 `/chat` → 自检 `/auth/me` 成功
- [ ] 8.2 检查 LocalStorage/SessionStorage 无 token（人工确认项，截图已验证为「内存」）
- [ ] 8.3 检查 refresh 请求携带 Cookie
- [ ] 8.4 错误提示的 `requestId` 与后端日志可对应
- [ ] 8.5 `pnpm build` + `pnpm test` 双端全绿（前端构建待用户本机执行）
- [x] 8.6 `openspec validate contract-and-auth --strict` 通过

## 9. 收尾

- [ ] 9.1 ESLint + Prettier
- [ ] 9.2 README
- [ ] 9.3 `docs/prd-deviations.md`
- [ ] 9.4 归档变更

### 前端联调已验证的现象（2026-10-27）

- 注册 `19261027084@163.com`（昵称「王登辉」）→ 自动登录 → 进入 `/chat`
- 顶栏正确显示昵称与 `user` 角色
- 卡片内「调用 /auth/me 自检」返回：`GET /auth/me 成功 · role=user`
- 控制台出现一条 `refresh 401`：属**预期**——未登录时路由守卫会先尝试恢复会话，无 Cookie 必然 401，前端静默忽略

---

## 验证记录（2026-10-27，真实执行）

| 用例 | 期望 | 实际 |
|---|---|---|
| `GET /api/health` | 200，双组件 up | ✅ `{"code":0,...,"database":"up","redis":"up"}` |
| `POST /auth/register` | 201 | ✅ 返回 PublicUser，`id` 为字符串 |
| 同邮箱再注册 | 409 / 40901 | ✅ |
| 密码 3 位 | 400 / 10001 + 字段级 | ✅ `data.errors[0].field = "password"` |
| `POST /auth/login` | 200 + HttpOnly Cookie | ✅ `Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=604800` |
| 密码错误 | 401 / 20001（文案不暴露邮箱是否存在） | ✅ |
| `GET /auth/me`（带 token） | 200 | ✅ |
| `GET /auth/me`（无 token） | 401 / 20001 | ✅ |
| 用 refresh token 当 access token | 401 | ✅（`type` 字段拦截） |
| 刷新后旧票据复用 | 401 / 20003 + 全量吊销 | ✅ 新旧票据同时失效 |
| 登出后再刷新 | 401 / 20003 | ✅ |
| 禁用账号后立即访问 | 401 / 20004 | ✅ |
| 恢复启用后 | 200 | ✅ |
| 登录第 6 次/分钟 | 429 / 42901 + 中文文案 | ✅ |
| 不存在的路径 | 404 / 40401（非 Nest 默认） | ✅ |

## 与设计 / PRD 的已知偏离

1. **限流存储用内存**，不是 design.md D9 写的 Redis：`@nest-lab/throttler-storage-redis` 尚未引入。单实例开发行为一致，多实例部署前必须切换（列入 deploy 变更）。
2. **bcrypt 实现用 `@node-rs/bcrypt`**（Rust 原生，算法仍是 bcrypt，成本因子 12）：避免 `bcrypt` 包在 Windows 上需要 node-gyp 编译。
3. **校验用 zod 而非 class-validator**：与契约包同源，前端可复用同一份 schema。
4. **契约包需先 build**：`pnpm dev:api` 已内置 `build:contract`，无需手动。
5. **Prisma 迁移账号需要建库权限**（影子数据库）：本地给 `aichat` 补了 CREATE/DROP；生产应拆成 app / migrator 两个账号。
