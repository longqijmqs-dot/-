# AI 对话平台（自建后端练习项目）

一个从 0 到 1 自建的全栈 AI 对话平台：NestJS + Prisma + MySQL + Redis 后端，Vue 3 前端。
目标不是「跑通 demo」，而是把生产级后端该有的东西（统一契约、双令牌认证、RBAC、限流、结构化日志、测试、容器化部署）都真的落一遍。

## 技术栈

| 层 | 选型 | 备注 |
|---|---|---|
| 后端 | NestJS 11 + TypeScript | 守卫 / 拦截器 / 过滤器分层清晰 |
| ORM | Prisma 6 | schema 即类型，迁移可版本化 |
| 数据库 | MySQL 8.4 | utf8mb4，容器内运行 |
| 缓存 | Redis 7 | refresh 白名单、禁用标记、限流 |
| 前端 | Vue 3 + Vite + Pinia + Vue Router | 自建表单与布局，未用重型 UI 库 |
| 契约 | `packages/contract`（zod） | 前后端唯一类型来源，CJS/ESM 双产出 |
| 测试 | Jest（后端/契约） | 前端单测待补 |
| 运行环境 | WSL2 + Docker（仅依赖服务容器化） | 应用在 Windows 侧热重载 |

## 目录结构

```
.
├─ apps/
│  ├─ api/                    NestJS 后端
│  │  ├─ prisma/              schema、迁移、种子
│  │  └─ src/
│  │     ├─ auth/             注册登录、JWT、守卫
│  │     ├─ common/           信封、异常过滤器、请求上下文、日志
│  │     ├─ config/           环境变量校验
│  │     ├─ health/           健康检查
│  │     ├─ prisma/           Prisma 服务封装
│  │     └─ redis/            Redis 服务封装
│  └─ web/                    Vue 3 前端
│     └─ src/
│        ├─ api/              拦截器、单飞刷新、接口封装
│        ├─ components/       品牌布局壳
│        ├─ router/           路由与守卫
│        ├─ stores/           Pinia
│        └─ views/            登录 / 注册 / 会话页
├─ packages/contract/         前后端共享契约
├─ openspec/                  规格与变更记录（本项目的规格来源）
├─ docs/                      环境手册、与 PRD 的偏离清单
└─ compose.yaml               MySQL + Redis
```

## 本地启动

### 前置条件

1. WSL2 + Docker Engine（本机环境搭建见 `docs/setup-wsl-debian.md`）
2. Node.js ≥ 22、pnpm

### 步骤

```powershell
# 1. 启动依赖服务（WSL 终端里执行）
cd /mnt/c/Users/33281/Desktop/测试
sudo docker compose up -d
sudo docker compose ps        # 两个容器应显示 healthy

# 2. 配置环境变量（Windows PowerShell）
Copy-Item .env.example .env
# 编辑 .env，把占位密码换掉；也可以直接在根目录复制一份到 apps/api/.env
Copy-Item .env apps/api/.env

# 3. 安装依赖并初始化数据库
pnpm install
pnpm db:migrate     # 首次会要求给迁移起名，输入 init
pnpm db:seed        # 建 admin / user 角色 + 管理员账号

# 4. 同时启动前后端
pnpm dev            # 后端 3000，前端 5173
```

打开：

- 前端 <http://localhost:5173>
- Swagger <http://localhost:3000/api/docs>
- 健康检查 <http://localhost:3000/api/health>

### 默认账号

由 `apps/api/.env` 的 `ADMIN_EMAIL` / `ADMIN_PASSWORD` 决定，种子脚本创建。
登录后可在「会话自检」里确认角色为 `admin`。

## 可用脚本

| 命令 | 说明 |
|---|---|
| `pnpm dev` | 构建契约包并同时启动前后端 |
| `pnpm dev:api` / `pnpm dev:web` | 单独启动 |
| `pnpm build:contract` | 构建契约包（CJS + ESM） |
| `pnpm build:api` / `pnpm build:web` | 生产构建 |
| `pnpm test` | 运行各包测试 |
| `pnpm typecheck` | 全量类型检查 |
| `pnpm db:migrate` / `db:seed` / `db:studio` | 数据库操作 |

## 接口约定

所有 JSON 接口统一返回：

```json
{ "code": 0, "message": "成功", "data": {}, "requestId": "uuid" }
```

- `code === 0` 成功，其余为业务错误码（分段：10xxx 参数、20xxx 认证、30xxx 授权、40xxx 资源、42xxx 限流、50xxx 服务端）
- 前端只按 `code` 分支，不解析 `message` 字符串
- 每个请求都带 `requestId`，与响应头 `X-Request-Id`、服务端日志一致，便于排障

认证：

- access token 15 分钟，存**内存**（不写 localStorage）
- refresh token 7 天，走 `httpOnly` Cookie（`Path=/api/auth`），每次刷新轮换；旧票据复用会触发该用户全量下线

## 当前进度

- ✅ 第一段 `contract-and-auth`：工程骨架、契约包、统一信封/异常/请求 ID、Prisma 建模、认证闭环（含前端登录注册与单飞刷新）
- ⏳ 第二段 `chat-stream`：会话、消息、SSE 流式回复、中断落库
- ⏳ 第三段 `files-and-admin`：文件、后台管理、限流细化
- ⏳ 第四段 `deploy`：Docker 镜像、Nginx、HTTPS

规格与任务状态见 `openspec/changes/`。

## 常见问题

| 现象 | 原因 | 处理 |
|---|---|---|
| 前端白屏、控制台报找不到 `@app/contract` | 契约包未构建 | `pnpm build:contract` 后重启 dev |
| 接口全部 500、日志报连不上数据库 | 容器没起 | `sudo docker compose up -d`，等 healthy |
| 登录返回 429 | 触发限流（5 次/分钟/IP） | 等 60 秒 |
| 平台页面提示「账号已被禁用」 | 管理员视角下的禁用标记 | 清除 Redis `user:disabled:<id>` 或重新启用 |
| `pnpm db:migrate` 报 P3014 影子库无权限 | 账号缺少建库权限 | 给应用账号授予 `CREATE/DROP`，或改用专用迁移账号 |
