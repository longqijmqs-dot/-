# 部署指南

本指南说明如何把 AI Chat Platform 部署到生产环境。

## 前置条件

| 条件 | 说明 |
|---|---|
| Docker | 服务器上已安装 Docker + Docker Compose |
| 域名 | 已解析到服务器 IP |
| SSL 证书 | Let's Encrypt 免费获取（生产环境必须 HTTPS） |
| .env | 已配置所有环境变量 |

## 部署步骤

### 1. 准备服务器

```bash
# 安装 Docker（Ubuntu/Debian）
sudo apt update
sudo apt install -y docker.io docker-compose-plugin

# 验证
docker --version
docker compose version
```

### 2. 上传代码到服务器

```bash
# 在本地项目目录
scp -r ./deploy user@your-server:/opt/aichat
scp .env user@your-server:/opt/aichat/.env
scp Dockerfile.api Dockerfile.web nginx.conf compose.yaml user@your-server:/opt/aichat/
```

### 3. 服务器上构建和启动

```bash
# 登录服务器
ssh user@your-server
cd /opt/aichat

# 构建镜像
docker compose build api
docker compose build web

# 启动服务
docker compose up -d

# 查看日志
docker compose logs -f api
```

### 4. 配置 Nginx

```bash
# 把 deploy/nginx.conf 复制到 Nginx 配置目录
sudo cp nginx.conf /etc/nginx/conf.d/aichat.conf

# 获取 SSL 证书（Let's Encrypt）
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com

# 验证配置
sudo nginx -t
sudo nginx -s reload
```

### 5. 验证部署

```bash
# 后端健康检查
curl http://localhost:3000/api/health

# 前端页面
curl -I http://localhost:8080

# 通过域名访问（需要 Nginx）
curl -I https://your-domain.com
```

## 更新部署

当有新代码需要部署时：

```bash
# 1. 拉取最新代码
git pull

# 2. 重新构建镜像
docker compose build api
docker compose build web

# 3. 重启服务
docker compose up -d
```

## 数据备份

### MySQL 数据

```bash
# 备份
docker compose exec mysql mysqldump -u root -p$MYSQL_ROOT_PASSWORD ai_chat > backup.sql

# 恢复
docker compose exec -i mysql mysql -u root -p$MYSQL_ROOT_PASSWORD ai_chat < backup.sql
```

### 上传文件

```bash
# 上传文件存储在 volume 里
docker volume inspect ai-chat-platform_uploads_data

# 备份 volume
docker run --rm -v ai-chat-platform_uploads_data:/data -v $(pwd):/backup alpine tar czf /backup/uploads.tar.gz /data
```

## 常见问题

### Q: 容器启动失败

```bash
# 查看日志
docker compose logs api
docker compose logs web

# 常见原因：
# - MySQL/Redis 未就绪（检查健康检查）
# - .env 配置错误
# - 端口冲突
```

### Q: SSE 流式响应卡顿

检查 Nginx 配置是否包含：
```nginx
proxy_buffering off;
proxy_read_timeout 300s;
```

### Q: 上传文件 413

检查 Nginx 配置是否包含：
```nginx
client_max_body_size 12m;
```

### Q: HTTPS 证书过期

```bash
sudo certbot renew --dry-run
sudo certbot renew
```
