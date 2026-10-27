#!/bin/bash
# ============================================================
# AI Chat Platform 部署脚本
#
# 用法：
#   ./deploy.sh              # 构建镜像 + 部署到本地 Docker
#   ./deploy.sh --remote     # 构建镜像 + 推送到远程服务器
#
# 前置条件：
#   1. Docker + Docker Compose 已安装
#   2. .env 文件已配置（或使用环境变量）
#   3. 如果是 --remote，需要 SSH 到服务器
# ============================================================

set -euo pipefail

# ---------- 配置 ----------
REMOTE_HOST="${REMOTE_HOST:-}"        # 远程服务器地址（如 user@your-server.com）
REMOTE_DIR="${REMOTE_DIR:-/opt/aichat}"  # 远程部署目录
IMAGE_NAME="aichat-platform"

# ---------- 颜色输出 ----------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err() { echo -e "${RED}[✗]${NC} $1"; }

# ---------- 检查前置条件 ----------
check_docker() {
    if ! command -v docker &> /dev/null; then
        err "Docker 未安装。请先安装 Docker。"
        exit 1
    fi
    if ! docker compose version &> /dev/null; then
        err "Docker Compose 未安装。请先安装 Docker Compose。"
        exit 1
    fi
    log "Docker + Docker Compose 已就绪"
}

check_env() {
    if [ ! -f .env ]; then
        err ".env 文件不存在。请先创建 .env 文件。"
        exit 1
    fi
    log ".env 文件已找到"
}

# ---------- 构建镜像 ----------
build_images() {
    log "开始构建镜像..."
    docker compose build api
    log "API 镜像构建完成"
    docker compose build web
    log "Web 镜像构建完成"
}

# ---------- 本地部署 ----------
deploy_local() {
    log "启动本地容器..."
    docker compose up -d
    log "等待服务就绪..."
    sleep 5

    # 检查健康状态
    if curl -sf http://localhost:3000/api/health &> /dev/null; then
        log "后端健康检查通过"
    else
        err "后端健康检查失败。请检查 docker compose logs api"
        exit 1
    fi

    if curl -sf http://localhost:8080 &> /dev/null; then
        log "前端健康检查通过"
    else
        err "前端健康检查失败。请检查 docker compose logs web"
        exit 1
    fi

    log "部署完成！"
    log "  前端：http://localhost:8080"
    log "  后端 API：http://localhost:3000/api"
    log "  Swagger：http://localhost:3000/api/docs"
    log ""
    log "管理员账号：admin@example.com（密码见 .env 的 ADMIN_PASSWORD）"
}

# ---------- 远程部署 ----------
deploy_remote() {
    if [ -z "$REMOTE_HOST" ]; then
        err "请设置 REMOTE_HOST 环境变量（如 REMOTE_HOST=user@your-server.com）"
        exit 1
    fi

    log "部署到远程服务器 $REMOTE_HOST..."

    # 1. 在远程服务器上创建目录
    ssh "$REMOTE_HOST" "mkdir -p $REMOTE_DIR"

    # 2. 上传 .env 文件（敏感信息不进代码仓库）
    scp .env "$REMOTE_HOST:$REMOTE_DIR/.env"

    # 3. 上传部署文件
    scp Dockerfile.api Dockerfile.web nginx.conf compose.yaml "$REMOTE_HOST:$REMOTE_DIR/"

    # 4. 在远程服务器上构建和启动
    ssh "$REMOTE_HOST" "cd $REMOTE_DIR && docker compose build && docker compose up -d"

    log "远程部署完成！"
    log "  前端：https://your-domain.com"
    log "  后端 API：https://your-domain.com/api"
    log "  Swagger：https://your-domain.com/api/docs"
}

# ---------- 主流程 ----------
main() {
    echo "============================================"
    echo "  AI Chat Platform 部署脚本"
    echo "============================================"

    check_docker
    check_env
    build_images

    if [ "$1" = "--remote" ]; then
        deploy_remote
    else
        deploy_local
    fi
}

main "$@"
