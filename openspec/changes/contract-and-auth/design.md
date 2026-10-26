# Design: contract-and-auth

## Context

工作区 `测试/` 为空，本变更是项目第一个变更，因此同时承担「立地基」和「立规矩」两件事：

- **立地基**：本机无 MySQL、无 Redis、无 Docker（仅有 WSL2），PRD 的 P0 基线一步都跑不了；必须先有一个可复现的本地开发环境。
- **立规矩**：PRD 只给了响应体形状 `{code, message, data}`，没有定义错误码、分页、SSE 事件、令牌失效语义。后续三个变更（对话流、文件后台、部署）都要复用这套规则，晚定一天就多返工一天。

技术栈由 PRD + 本轮澄清确定：NestJS 11 / Prisma 6 / MySQL 8 / Redis 7 / Vue 3 + Vite / Pinia / DeepSeek（OpenAI 兼容）。前端定位为**产品级**：后台管理用组件库，对话页自建组件。

约束：
- 单人开发、学习型项目，但按生产级标准验收（PRD 2.4）
- 本项目要作为简历/展示项目，代码结构与文档可读性本身是交付物
- 无 CI 平台账号，验证依赖本地脚本 + Jest/Vitest

## Goals / Non-Goals

**Goals:**

1. 一条命令拉起数据库与缓存（WSL2 + Docker Compose），迁移、种子、启动全自动
2. 前后端共享唯一契约来源，任何一侧偏离都在编译期或测试期失败
3. 认证闭环端到端可用：注册 → 登录 → 携带令牌访问 → 过期静默刷新 → 禁用/登出立即失效
4. 统一响应与统一错误在**第一个变更**就固化，后续模块无需再讨论
5. 每个验收场景都能被自动化测试覆盖（后端 e2e / 前端单测）

**Non-Goals:**

- 不做会话、消息、文件、后台管理（属 `chat-stream`、`files-and-admin`）
- 不做 SSE（属 `chat-stream`），但契约包预留事件命名空间
- 不做 Docker 部署与 Nginx（属 `deploy`），本变更只做本地 compose
- 不做邮件验证、找回密码、OAuth 登录（PRD 非目标/未列）
- 不做 Refresh Token 设备管理、多端登录踢出（YAGNI）

## Decisions

### D1 用 pnpm monorepo + 共享契约包，而不是双仓库 + OpenAPI 代码生成

`packages/contract` 用 zod 定义 DTO/信封/错误码，前端 `import type`，后端用同一 schema 做校验与 Swagger 注解。

- 备选：后端出 OpenAPI、前端 `openapi-typescript` 生成。否决理由：SSE 与 Cookie 鉴权语义 OpenAPI 描述不了；且需手动重跑生成器，易漂移。
- 备选：两套手写类型。否决：运行期才暴露漂移，正是本项目要避免的返工来源。
- 代价：workspace 配置与构建顺序（contract 需先 build 或被 Vite 直接以源码引用）。选择**源码直引**（`exports` 指向 `src/index.ts`，由消费方编译），避免 watch 链路复杂化。

### D2 响应信封固定为四字段，`requestId` 不只在错误里

```ts
{ code: number; message: string; data: T | null; requestId: string }
```

- `code === 0` 表示成功；HTTP 状态码同时保持语义（201/400/401/403/409/429/500）。
- 备选：用 HTTP 状态码 + 纯 data 体。否决理由：PRD 明确要业务码，且前端需要区分「401 因过期」与「401 因禁用」——HTTP 状态码表达不了这个粒度。
- 契约以测试锁定：后端拦截器输出与前端拦截器期望值共享同一份 fixture。

### D3 错误码分段（10/20/30/40/42/50），码值一经发布不复用

| 段 | 域 | 示例 |
|---|---|---|
| 0 | 成功 | 0 |
| 10xxx | 参数校验 | 10001 校验失败 |
| 20xxx | 认证 | 20001 未登录 / 20002 令牌过期 / 20003 刷新令牌无效 / 20004 账号已禁用 |
| 30xxx | 授权 | 30001 非资源所有者 / 30002 角色不足 |
| 40xxx | 资源 | 40401 不存在 / 40901 邮箱已注册 |
| 42xxx | 限流 | 42901 请求过于频繁 |
| 50xxx | 服务端 | 50000 内部错误 |

理由：前端做 `switch(code)` 映射中文提示；分段让新增码不需要改前端逻辑，只需补文案。

### D4 refresh token 走 httpOnly Cookie，而不是放在响应体里交给 JS

| | Cookie（采纳） | 响应体 + localStorage（PRD 原文） |
|---|---|---|
| XSS 风险 | 脚本读不到 | 一次 XSS = 7 天失守 |
| CSRF | `SameSite=Lax` + 仅 POST + 自定义头 | 无此问题 |
| 跨域 | 开发期用 Vite proxy 保持同源 | 需手动带 header |

Cookie 属性：`httpOnly; Secure; SameSite=Lax; Path=/api/auth`，有效期 7 天，与 Redis 中 `refresh:{jti}` 的 TTL 一致。

**轮换（rotation）**：每次刷新签发新 refresh 并删除旧 jti；若收到已删除的 jti → 判定为票据复用，清除该用户全部 refresh 并要求重新登录。这是「refresh 泄露仍可被检测」的标准做法。

### D5 「禁用用户立即失效」用请求级 Redis 标记，而不是等 access token 过期

Guard 在校验 JWT 签名后追加一次 `GET user:disabled:{id}`（Redis，TTL 与 access token 同量级或不过期，禁用时 SET、启用时 DEL）。

- 代价：每个受保护请求 +1 次 Redis RTT（局域网 <1ms，可接受）。
- 备选：在 JWT 里带 `tokenVersion`，禁用时递增版本号。否决理由：仍需查 Redis 或 DB 才有意义，没有省下一次往返，反而增加令牌体积与理解成本。
- 结果：禁用后下一次请求即返回 `401 / 20004`，满足 PRD 4.5 验收 2。

### D6 前端 token 只存内存，刷新采用「单飞 + 重放队列」

- access token 存 Pinia（内存），页面刷新后靠 Cookie 里的 refresh 静默换新（启动时 `bootstrapSession()`）。
- Axios 响应拦截器遇 `401 / 20002`：进入 `refreshPromise` 单飞逻辑——已有刷新在飞则复用，否则发起；成功后重放原请求（最多 1 次），失败则清态跳登录。
- 刷新接口自身标记 `skipAuthRefresh` 防死循环。
- 备选：每个 401 各自刷新。否决：并发 6 个请求会打出 6 次刷新，服务端轮换使前 5 个 refresh 立即失效，形成随机登出——这是最常见的实现事故。

### D7 requestId 用 AsyncLocalStorage 贯穿（nestjs-cls），由中间件生成

- 优先取入站 `X-Request-Id`（前端可透传，便于跨端排障），否则生成 UUID v7。
- 写入响应头 `X-Request-Id`、日志、错误体。前端拦截器把 `requestId` 附到错误提示的「详情」里，便于对日志。

### D8 密码哈希 bcrypt cost 12（PRD 要求 ≥10）

12 在测试机上单次约 250ms，注册/登录可接受；cost 10 偏弱。测试环境用 4 以加速（仅测试配置）。

### D9 限流用 @nestjs/throttler + Redis storage

- 登录/注册：5 次/分钟/IP（PRD FR-6.2），超限 `429 / 42901`。
- 全局：60 次/分钟/用户（已登录按 userId，未登录按 IP）。
- 选 Redis 存储而非内存：多实例/重启后计数不丢，且与「按用户限流」的键设计一致。
- 注意：登录限流对**失败与成功都计数**，避免攻击者用成功请求探测配额。

### D10 本地环境用 WSL2 内 Docker Engine + Compose，不用 Windows 原生安装

- `compose.yaml`：`mysql:8.4`（`utf8mb4`、时区 `+08:00`、数据卷持久化、healthcheck `mysqladmin ping`）、`redis:7-alpine`（appendonly、healthcheck `redis-cli ping`）。
- 应用本身在 Windows 侧用 pnpm 起（热重载体验好），只把依赖服务放容器；`deploy` 变更再把应用容器化。
- WSL2 端口转发默认可用（`localhost:3306/6379`），若冲突在 `.env` 改端口而非改 compose 语义。

### D11 前端 UI：后台页用 Naive UI，对话页自建

- 后台表格/表单/弹窗用 Naive UI（`n-data-table` / `n-form`），省工且可访问性有保障。
- 对话界面（后续变更）自建气泡/输入器/Markdown 渲染，避免「一看就是组件库」。
- 本变更只涉及登录/注册页：用自建表单 + Naive UI 的 input/button 原子组件，避免过早绑定视觉风格。

### D12 Swagger 与契约包同源

DTO 用 `createZodDto()`（nestjs-zod）生成，Swagger 文档由同一 schema 派生。避免「文档写一套、校验写一套」。

## Risks / Trade-offs

| 风险 | 应对 |
|---|---|
| WSL2 未装 Docker 导致环境任务卡住（PRD 风险清单外的新风险） | 首个任务即验证；失败则降级为「本机原生 MySQL + Memurai」，并在 design 记录偏离 |
| Cookie 方案在开发期跨端口导致丢失 | Vite `server.proxy` 把 `/api` 代理到 `http://localhost:3000`，前后端同源；生产由 Nginx 同源 |
| 契约包源码直引导致后端 ts-jest 解析失败 | `tsconfig.base.json` 配 `paths` + `moduleNameMapper`，第一个测试跑通后才继续 |
| 请求级 Redis 校验在 Redis 故障时全线 401 | Guard 内 try/catch：Redis 不可用则**降级为仅校验 JWT**并打 error 日志（可用性优先），健康检查另行暴露故障 |
| bcrypt cost 12 拖慢 e2e | 测试环境 `BCRYPT_ROUNDS=4`，通过环境变量注入 |
| 前后端错误码文案不一致 | 文案集中在 `packages/contract` 的 `ERROR_MESSAGES`，前端只做展示 |

## Migration Plan

1. 环境基线：WSL2 装 Docker → `docker compose up -d` → 两容器 healthy
2. 工程骨架：workspace、tsconfig、lint、git 初始化与首次提交
3. 契约包 → 后端骨架（拦截器/过滤器/CLS）→ 数据模型与迁移 → 认证模块 → Swagger
4. 前端骨架 → 拦截器 → 登录注册 → 路由守卫
5. 双端验证：后端 e2e 全绿 + 前端单测全绿 + 手动联调清单

**回滚**：本变更不改动任何既有系统（空仓库起步），回滚即丢弃分支。数据库层面所有变更为新增表，`prisma migrate reset` 可完全重置。

## Open Questions

- DeepSeek API Key 的注入方式：本变更不调用模型，`deploy`/`chat-stream` 再定（倾向 `.env` + 不入库）
- 是否引入 ESLint + Prettier + husky 预提交：倾向引入，但放在 tasks 末尾，不阻塞主链路
- 生产环境的 refresh Cookie 需要固定域名，`deploy` 变更时确认证书与域名
