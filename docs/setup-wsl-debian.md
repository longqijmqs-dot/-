# 环境搭建（改道版）：Debian on WSL2 + Docker

> 背景：`wsl --install` 下载 Ubuntu 时卡在 `WININET_E_CANNOT_CONNECT`。
> 这是 Windows 安装器走的下载通道被挡，不是没网。改道方案：手动安装 Debian（167 MB，
> 比 Ubuntu 的 1065 MB 小得多），Docker 官方完整支持 Debian 12。
>
> 你的 WSL 本体已是 3.0.3.0（内核 6.18），**不需要再装 WSL**，只差一个发行版。

## 第 1 步：安装 Debian 发行版（Windows 侧）

我已经把包下载到项目里了：`.tmp\Debian.AppxBundle`

打开**普通** PowerShell（不需要管理员），执行：

```powershell
Add-AppxPackage -Path "C:\Users\33281\Desktop\测试\.tmp\Debian.AppxBundle"
```

这行在干嘛：把这个 Store 安装包直接装进你的用户目录，跳过「从微软服务器下载」这一步。

- 无任何输出 = 成功
- 报「因为此系统上禁止运行脚本」→ 那是 PowerShell 配置文件的问题，与本命令无关，忽略即可
- 报「无法安装，因为其中包含的某个应用包未受信任」→ 见文末排查表

## 第 2 步：首次启动 Debian，建 Linux 账号

1. `Win` 键搜索 **Debian**，打开
2. 首次启动会解压初始化，等 1–3 分钟
3. `Enter new UNIX username:` → 输入**全小写**用户名，例如 `dev`
4. `New password:` → 输密码。**屏幕上不会显示任何字符（连星号都没有），这是正常的**，输完回车
5. 再输一次确认

看到类似 `dev@机器名:~$` 的提示符就成功了。

验证（在 Windows PowerShell 里）：

```powershell
wsl -l -v
```

应显示 `Debian  Running  2`。**版本必须是 2**；如果是 1，执行 `wsl --set-version Debian 2`。

## 第 3 步：换成国内 apt 源（否则后面装东西会巨慢）

> 实测：从 Store 装的 Debian 是 **11 (bullseye)**，不是 12。不影响，Docker 官方支持
> bullseye；命令里的 `$(. /etc/os-release && echo $VERSION_CODENAME)` 会自动取对代号。
>
> 另外会看到一条警告：
> `wsl: 检测到 localhost 代理配置，但未镜像到 WSL。NAT 模式下的 WSL 不支持 localhost 代理。`
> **这是正常的**：WSL 里的 `127.0.0.1` 指 WSL 自己，碰不到 Windows 上的代理。
> apt 走阿里云直连不受影响；Docker 拉镜像靠第 5 步的加速站解决。

```bash
# 先备份原源
sudo cp /etc/apt/sources.list /etc/apt/sources.list.bak

# 替换为阿里云镜像——注意要替换三个域名，漏一个就会报 404
sudo sed -i 's|deb.debian.org|mirrors.aliyun.com|g; s|security.debian.org|mirrors.aliyun.com|g; s|ftp.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list
sudo apt-get update
```

预期：不再出现 `Err:` 行。若仍有，执行 `grep -n 'http' /etc/apt/sources.list` 看哪一行漏了。

## 第 4 步：安装 Docker（走阿里云源，因为官方源在你网络下不可达）

```bash
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://mirrors.aliyun.com/docker-ce/linux/debian/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
```

```bash
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://mirrors.aliyun.com/docker-ce/linux/debian $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
```

```bash
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER
```

> **为什么要 `usermod`**：默认只有 root 能用 docker。把你加进 docker 组，以后就不用每条命令都 `sudo`。
> 这条命令要**关掉 Debian 窗口重新打开**才生效。

## 第 5 步：配置镜像加速（关键，Docker Hub 在国内经常拉不动）

重新打开 Debian 窗口后执行：

```bash
sudo mkdir -p /etc/docker
sudo tee /etc/docker/daemon.json > /dev/null <<'EOF'
{
  "registry-mirrors": [
    "https://docker.m.daocloud.io",
    "https://docker.1panel.live"
  ]
}
EOF
sudo service docker restart
```

> 镜像站会失效、会换域名，这是常态。如果第 6 步拉镜像很慢或报错，把上面两个地址换掉再试：
> `https://dockerproxy.net`、`https://hub.atomgit.com`、`https://docker.xuanyuan.me`。
> 这一步失败不影响写代码，只影响「拉取 mysql/redis 镜像」的速度。

## 第 6 步：验证（四条都必须有输出）

```bash
docker --version
docker compose version
docker run --rm hello-world
docker run --rm mysql:8.4 --version
```

- 第 3 条打印 `Hello from Docker!` → 容器能跑
- 第 4 条打印 mysql 版本 → 镜像能拉（**这条最关键**，后面 compose 就靠它）

## 第 7 步：回到项目

全部通过后回一句「**装好了**」，我这边执行：

```powershell
docker compose up -d
```

然后验证 3306 / 6379 从 Windows 能连通，再开始写 NestJS 与 Prisma。

## 排查表

| 现象 | 原因 | 处理 |
|---|---|---|
| `Add-AppxPackage` 报「未受信任」 | 系统禁止侧载 | 设置 → 系统 → 开发者选项 → 打开「开发人员模式」，重试 |
| `Add-AppxPackage` 报已存在 | 之前装过残留 | `Get-AppxPackage *Debian* \| Remove-AppxPackage` 后重试 |
| Debian 窗口一闪而过 | 初始化失败 | PowerShell 执行 `debian.exe` 看报错 |
| `wsl -l -v` 版本是 1 | 默认版本没切 | `wsl --set-default-version 2`，再 `wsl --set-version Debian 2` |
| `docker` 报 permission denied | 组没生效 | 关掉 Debian 窗口重开；仍不行执行 `newgrp docker` |
| `docker` 报 Cannot connect to daemon | 服务没起 | `sudo service docker start` |
| `docker run` 卡在 pulling | 镜像加速没配或失效 | 回第 5 步换镜像地址 |
| apt 报 Release 文件过期 | Debian 系统时间/源错位 | 确认第 3 步源地址是 `mirrors.aliyun.com`，且版本是 bookworm |
| 想彻底重来 | — | `wsl --unregister Debian`，再从第 1 步开始 |
