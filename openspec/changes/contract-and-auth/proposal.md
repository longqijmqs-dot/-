# Change: contract-and-auth

## Why

PRD 描述的是一个后端服务，但本项目要交付的是**前后端交互闭环**：真正决定成败的不是「接口能返回 200」，而是契约是否被前端真实消费并且行为一致。当前工作区为空、本机无 MySQL/Redis/Docker，连 P0 基线都跑不起来。

因此第一个变更不追求功能广度，而是把三件最容易在后期返工的事一次性钉死：**工程骨架**、**前后端共享的契约层**、**认证授权闭环**。认证是最适合做第一条纵切的模块——它同时包含公开接口、需登录接口、需角色接口、令牌过期、账号禁用、限流六种分支，前后端联调能覆盖绝大多数通用问题（拦截器、错误映射、单飞刷新、路由守卫）。

## What Changes

- 建立 pnpm monorepo 骨架：`apps/api`（NestJS）、`apps/web`（Vue3 + Vite）、`packages/contract`（唯一契约来源）
- 建立 WSL2 Docker 本地环境基线：`compose.yaml` 一键拉起 MySQL 8 + Redis 7，含健康检查与数据卷
- 新增共享契约包：响应信封 `{code,message,data,requestId}`、分段业务错误码、分页契约、认证 DTO 的 zod schema
- 新增 Prisma 数据模型（本变更仅 `User` / `Role` 与初始种子），启用迁移
- 新增认证模块：注册、登录、刷新、登出、当前用户、JWT 守卫、角色守卫
- **BREAKING（相对 PRD 原文）**：登录响应不再把 refresh token 返回给 JS，改为写入 `httpOnly` Cookie；PRD 7.1 的响应体描述随之调整
- 新增 Redis 语义：refresh token 白名单 + 轮换、登出黑名单、禁用用户标记（请求级校验，保证「禁用立即失效」）
- 新增全局横切：统一响应拦截器、统一异常过滤器、`requestId`（AsyncLocalStorage 贯穿）、结构化日志、Swagger 文档
- 新增前端认证闭环：登录/注册页、Pinia 内存态 token、Axios 拦截器（401 单飞刷新 + 请求重放）、错误码中文映射、路由鉴权守卫
- 新增契约一致性测试：前后端共用同一份样例，锁定信封与错误码不漂移

## Capabilities

### New Capabilities

- `api-contract`: 统一响应信封、业务错误码分段、分页契约、requestId 贯穿、统一异常输出——所有后续模块的公共底座
- `user-auth`: 邮箱密码注册登录、JWT 双令牌、刷新轮换、登出吊销、当前用户、角色守卫、账号禁用即时失效、登录限流
- `web-auth`: 前端认证态管理（内存 access token、静默刷新、并发请求排队重放）、登录注册页面、路由与角色守卫、错误码到用户提示的映射
- `dev-environment`: monorepo 工程骨架与本地开发基线（Docker Compose 拉起 MySQL/Redis、环境变量约定、迁移与种子命令、一键启动脚本）

### Modified Capabilities

（无。`openspec/specs/` 当前为空，本变更为项目首个变更。）

## Impact

- **代码**：新建 `apps/api`、`apps/web`、`packages/contract`、`compose.yaml`、根级 `package.json` / `pnpm-workspace.yaml` / `tsconfig.base.json`
- **接口**：新增 `/api/auth/register|login|refresh|logout|me`；所有响应体结构自此固定，后续模块必须遵循
- **数据**：新增 `User`、`Role` 两张表与迁移；`Role` 需预置 `admin` / `user` 两条种子数据
- **依赖**：NestJS 11、Prisma 6、ioredis、`@nestjs/jwt`、bcrypt、`nestjs-cls`、Vue 3、Pinia、Vue Router、Axios、zod、Naive UI（仅后台页）
- **运行环境**：需在 WSL2 中安装 Docker Engine；本机无 MySQL/Redis，不使用原生安装
- **后续变更依赖**：`chat-stream`、`files-and-admin`、`deploy` 三个变更均复用本变更的契约层与守卫
