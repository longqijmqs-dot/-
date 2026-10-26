# 本地开发环境搭建（Windows 11 → WSL2 → Docker → MySQL/Redis）

> 本文件是给「手上这台机器」的操作手册。执行完第 5 步后，回到项目根执行 `docker compose up -d` 即可。
> 预计耗时：20 分钟操作 + 一次重启。

## 为什么需要这一步

项目的后厨需要两个东西：

- **MySQL** = 仓库，存用户、会话、消息这些要长期保管的数据
- **Redis** = 前台便签本，存「谁登录了」「谁被拉黑了」「这个 IP 请求了几次」这类用完即弃的数据

在 Windows 上直接装这两个东西出了名的难配。**WSL2 + Docker** 的做法是：在你 Windows 里开一间隔离的 Linux 小房间，把这两个东西装在小房间里，一条命令开关，不污染系统，卸了就没了。

## 第 0 步：确认你有一台「管理员终端」

1. 按 `Win` 键，输入 `PowerShell`
2. 右边（或右键菜单）选 **「以管理员身份运行」**
3. 标题栏应该出现「管理员: Windows PowerShell」

> 如果弹出的 UAC 窗口要求密码而你输入不了，说明这台机器的账号不是管理员账号，需要找机器的主人要权限。这一步过不去，后面全部免谈。

## 第 1 步：一条命令装 WSL2 + Ubuntu

在**管理员** PowerShell 里执行：

```powershell
wsl --install
```

这行在干嘛：自动开启「适用于 Linux 的 Windows 子系统」和「虚拟机平台」两个系统功能，并从微软商店拉一个默认 Linux 发行版（Ubuntu）。

预期输出会包含 `已安装: 适用于 Linux 的 Windows 子系统` 之类的字样。

> 如果它报「无法解析服务器名称」或卡住下载：多半是网络问题，换手机热点再试一次；仍然不行就执行
> `wsl --install --web-download` 强制走网页下载通道。

## 第 2 步：重启电脑

**必须重启。** 系统功能的开关只有重启后才真正生效，这不是可以跳过的步骤。

## 第 3 步：首次启动 Ubuntu，建 Linux 账号

重启后：

1. `Win` 键搜索 `Ubuntu`，打开它（第一次会自动初始化，要等 1–3 分钟）
2. 提示 `Enter new UNIX username:` 时，输入一个**全小写**的名字，例如 `dev`
3. 提示 `New password:` 时输入密码。**注意：输入时屏幕上不会显示任何字符**，包括星号，这是正常的，输完回车即可
4. 再输一次确认

完成后你会看到一个类似 `dev@你的电脑名:~$` 的提示符，说明 Linux 已经能用了。

回到 Windows 的**普通** PowerShell（不需要管理员了），执行：

```powershell
wsl -l -v
```

应该看到 Ubuntu 状态为 `Running`，版本为 `2`。**版本必须是 2**，如果是 1，执行 `wsl --set-version Ubuntu 2`。

## 第 4 步：在 Ubuntu 里装 Docker

回到刚才的 Ubuntu 窗口（或重新打开 Ubuntu），**逐段复制粘贴**执行。这些命令每段都以 `sudo` 开头，会要求你输入第 3 步设的密码。

```bash
# 1) 更新软件索引，并装好后续要用的下载/校验工具
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg git

# 2) 建一个专门放「软件源签名密钥」的目录
sudo install -m 0755 -d /etc/apt/keyrings

# 3) 下载 Docker 官方的签名密钥（用来证明后面的软件包没被篡改）
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
```

```bash
# 4) 告诉系统「以后从这个地址找 Docker 的软件包」
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
```

```bash
# 5) 正式安装 Docker 引擎 + 插件（compose 就在 docker-compose-plugin 里）
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# 6) 把你自己的 Linux 账号加进 docker 组，这样以后不用每次都 sudo
sudo usermod -aG docker $USER
```

> **第 3) 步卡住/超时怎么办**：这是国内网络最常见的问题，改用阿里云镜像密钥：
> ```bash
> curl -fsSL https://mirrors.aliyun.com/docker-ce/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
> ```
> 第 4) 步同样把 `https://download.docker.com` 换成 `https://mirrors.aliyun.com/docker-ce`。
> 第 5) 步如果 apt 更新慢，可先执行 `sudo sed -i 's/archive.ubuntu.com/mirrors.aliyun.com/g' /etc/apt/sources.list`。

**关掉 Ubuntu 窗口再重新打开**（让「加入 docker 组」这件事生效），然后验证：

```bash
docker --version
docker compose version
docker run --rm hello-world
```

三条都要有输出。最后一条打印 `Hello from Docker!` 就说明容器能跑起来了。

## 第 5 步：让端口从 Windows 能访问到

Windows 11 的 WSL2 默认会把 Linux 里监听的端口映射到 `localhost`，一般不用额外配置。

验证方法：在 Ubuntu 里执行 `docker run -d -p 3306:3306 hello-world` 之类太麻烦，直接等回到项目里跑 `docker compose up -d` 后，在 **Windows** 的 PowerShell 里执行：

```powershell
Test-NetConnection localhost -Port 3306
Test-NetConnection localhost -Port 6379
```

`TcpTestSucceeded : True` 即通。

## 完成后请告诉我

回一句「装好了」，我立刻执行验证：

1. `docker compose up -d` 拉起 MySQL 8 + Redis 7
2. 检查两个容器都是 `healthy`
3. 从 Windows 侧连通 3306 / 6379
4. 再进写 Prisma 迁移（那时候数据库才第一次被真正用到）

## 常见问题速查

| 现象 | 原因 | 处理 |
|---|---|---|
| `wsl --install` 报「无法解析服务器名称」 | 网络/DNS | 换网络，或加 `--web-download` |
| 重启后 `wsl -l -v` 还是报未安装 | 系统功能没开成功 | 管理员 PowerShell 执行 `dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart` 和 `dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart`，再重启 |
| `wsl -l -v` 显示版本 1 | 默认用了旧版本 | `wsl --set-version Ubuntu 2` |
| `docker run hello-world` 报 permission denied | 没重新打开 Ubuntu 窗口 | 关掉重开；仍不行执行 `newgrp docker` |
| `docker run` 报 Cannot connect to the Docker daemon | 服务没起来 | `sudo service docker start`，或在 `/etc/wsl.conf` 加 `[boot]` / `command=service docker start` |
| 磁盘紧张 | 镜像占空间 | 本项目两个镜像约 1.5 GB，留 5 GB 余量即可 |
