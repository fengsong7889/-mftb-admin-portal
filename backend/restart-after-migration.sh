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

echo ""
echo "3. 准备启动 Spring Boot..."
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
export PATH="$HOME/apache-maven-3.9.6/bin:$JAVA_HOME/bin:$PATH"

# 从环境变量读取配置（与 run-local.sh 一致）
export DB_URL='jdbc:mysql://mysql6.sqlpub.com:3311/fengsong_test?useUnicode=true&characterEncoding=utf8&useSSL=false&serverTimezone=Asia/Shanghai&allowPublicKeyRetrieval=true'
export DB_USERNAME='fengsong_mt'
export DB_PASSWORD='re6NO4pZLL2pgqhp'
export JWT_SECRET='mftb-local-dev-secret-key-2024-sha256-secure-enough-for-hs384'
export LOG_LEVEL=info

echo ""
echo "数据库信息:"
echo "  - 地址：mysql6.sqlpub.com:3311"
echo "  - 数据库：$DB_DATABASE (检查日志)"
echo ""

echo "正在启动应用..."
mvn spring-boot:run
