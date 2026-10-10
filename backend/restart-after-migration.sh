#!/bin/bash
# ============================================================
# 重启脚本：数据库迁移后重新编译启动
# ============================================================

set -e

echo "=============================================="
echo "开始清理并重启后端服务"
echo "=============================================="

cd "$(dirname "$0")"

echo ""
echo "1. 清理 Maven 缓存..."
mvn clean

echo ""
echo "2. 重新编译项目..."
mvn compile

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_LOCAL="$SCRIPT_DIR/.env.local"

echo ""
echo "3. 准备启动 Spring Boot..."
export JAVA_HOME="${JAVA_HOME:-$(/usr/libexec/java_home -v 17)}"
if [ ! -d "$SCRIPT_DIR/../.local/apache-maven-3.9.6/bin" ]; then
    export PATH="$HOME/Library/apache-maven-3.9.9/bin:$HOME/apache-maven-3.9.6/bin:$JAVA_HOME/bin:$PATH"
fi

# 凭据一律来自 backend/.env.local（已 gitignore）或当前 shell 环境变量，
# 禁止在本文件写入任何默认值——与 restart-service.sh 保持一致
if [ -f "$ENV_LOCAL" ]; then
    set -a
    # shellcheck source=/dev/null
    . "$ENV_LOCAL"
    set +a
fi

_missing=()
for _k in DB_URL DB_USERNAME DB_PASSWORD JWT_SECRET; do
    if [ -z "${!_k:-}" ]; then _missing+=("$_k"); fi
done
if [ ${#_missing[@]} -gt 0 ]; then
    echo "❌ 缺少必需环境变量：${_missing[*]}"
    echo "   请执行：cp $SCRIPT_DIR/.env.local.example $ENV_LOCAL 并填写实际值"
    exit 1
fi
if [ ${#JWT_SECRET} -lt 32 ]; then
    echo "❌ JWT_SECRET 长度不足 32 字节，不足以支撑 HS256 签名"
    exit 1
fi
export LOG_LEVEL="${LOG_LEVEL:-info}"

echo ""
echo "数据库信息:"
if [ -n "${DB_URL:-}" ]; then
    echo "  - 主机：$(printf '%s' "$DB_URL" | sed -E 's#^jdbc:mysql://([^/?]+).*#\1#')"
fi
echo "  - 凭据来源：$ENV_LOCAL（内容不外泄，已 gitignore）"
echo ""

echo "正在启动应用..."
mvn spring-boot:run
