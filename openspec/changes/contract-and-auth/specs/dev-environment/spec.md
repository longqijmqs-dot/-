## ADDED Requirements

### Requirement: 本地依赖服务一键启动

项目 SHALL 提供 `compose.yaml`，用一条命令启动 MySQL 8 与 Redis 7 两个服务，均配置健康检查与持久化数据卷；两个服务在同一条命令下达到健康状态后，应用方可连接。

#### Scenario: 一键拉起且健康
- **WHEN** 开发者在 WSL2 终端执行 `docker compose up -d`
- **THEN** `mysql` 与 `redis` 两个容器进入 `running` 且 `healthy` 状态
- **AND** 从宿主机可分别连通 `localhost:3306` 与 `localhost:6379`

#### Scenario: 重启后数据不丢失
- **WHEN** 开发者执行 `docker compose down` 后再次 `up`
- **THEN** 已迁移的表结构与已写入的用户数据仍然存在

#### Scenario: 端口冲突可配置
- **WHEN** 宿主机默认端口被占用
- **THEN** 可通过 `.env` 中的端口变量修改映射，无需改动 `compose.yaml` 的服务定义

### Requirement: monorepo 结构与统一脚本

仓库 SHALL 为 pnpm workspace，包含 `apps/api`、`apps/web`、`packages/contract` 三个工作区，并在根 `package.json` 提供统一脚本：`dev`（同时启动前后端）、`dev:api`、`dev:web`、`build`、`test`、`lint`、`db:migrate`、`db:seed`、`db:reset`。

#### Scenario: 根目录一条命令启动双端
- **WHEN** 开发者在仓库根执行 `pnpm dev`
- **THEN** 后端监听 `3000`、前端开发服务器监听 `5173`，两者均可访问

#### Scenario: 前端请求走同源代理
- **WHEN** 前端以相对路径 `/api/...` 发起请求
- **THEN** Vite 开发服务器将其代理到后端，浏览器视角保持同源，refresh Cookie 可正常往返

#### Scenario: 新增工作区后类型可解析
- **WHEN** `apps/web` 引用 `@app/contract` 中的类型
- **THEN** 类型检查与构建均通过，无需先手动构建契约包

### Requirement: 环境变量集中管理与示例文件

项目 SHALL 提供 `.env.example`（入库）与 `.env`（不入库），敏感配置仅通过环境变量注入；启动时对必需变量做存在性与格式校验，缺失时 MUST 快速失败并给出明确提示。

#### Scenario: 缺少必需变量时启动失败
- **WHEN** 开发者未配置 `DATABASE_URL` 即启动后端
- **THEN** 进程在启动阶段退出，日志明确指出缺失的变量名
- **AND** 不尝试以空值连接数据库

#### Scenario: 密钥不进入版本库
- **WHEN** 查看仓库跟踪文件
- **THEN** `.env` 与任何含真实密钥的文件均不在版本控制中，仅 `.env.example` 含占位值

### Requirement: 数据库迁移与种子数据

项目 SHALL 通过 Prisma Migrate 管理表结构，并提供幂等的种子脚本预置 `admin` 与 `user` 两个角色；管理员账号通过环境变量初始化。

#### Scenario: 空库初始化
- **WHEN** 开发者在空数据库上执行 `pnpm db:migrate && pnpm db:seed`
- **THEN** `User`、`Role` 表被创建，且 `Role` 表中存在 `admin`、`user` 两条记录
- **AND** 迁移可重复执行而不报错

#### Scenario: 重置环境
- **WHEN** 开发者执行 `pnpm db:reset`
- **THEN** 数据库被清空并重新应用全部迁移与种子，命令以成功状态退出

### Requirement: 契约包作为唯一类型来源被双端消费

`packages/contract` SHALL 导出响应信封类型、业务错误码枚举与文案、分页类型、认证相关 zod schema；前后端 MUST 从该包导入，MUST NOT 各自重复定义同一结构。

#### Scenario: 后端序列化与前端解析共享同一契约
- **WHEN** 后端返回一个成功响应
- **THEN** 该响应可被契约包中的信封 schema 成功解析
- **AND** 前端拦截器使用同一 schema 判定响应合法性

#### Scenario: 契约漂移导致构建失败
- **WHEN** 开发者修改契约包中的字段名而未同步消费方
- **THEN** 类型检查阶段即报错，而不是等到运行期
