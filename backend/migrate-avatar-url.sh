#!/bin/bash
# ============================================================
# 数据库迁移脚本：添加 avatar_url 字段到 sys_user 表
# ============================================================

set -e

echo "=============================================="
echo "开始执行数据库迁移：添加 avatar_url 字段"
echo "=============================================="

# 从环境变量读取数据库连接信息（与 application.yml 配置一致）
DB_URL="${DB_URL}"
DB_USERNAME="${DB_USERNAME}"
DB_PASSWORD="${DB_PASSWORD}"

# 解析 DB_URL: jdbc:mysql://host:port/database?useSSL=true&...
URL_PARTS=$(echo "$DB_URL" | sed 's|jdbc:mysql://||' | sed 's/?.*||')
HOST_PORT=$(echo "$URL_PARTS" | cut -d'/' -f1)
DATABASE=$(echo "$URL_PARTS" | cut -d'/' -f2)

MYSQL_CMD="mysql -h $(echo $HOST_PORT | cut -d':' -f1) -P $(echo $HOST_PORT | cut -d':' -f2 | sed 's/^0*//') -u $DB_USERNAME -p$DB_PASSWORD $DATABASE"

echo "数据库信息:"
echo "  - 地址：${HOST_PORT}"
echo "  - 数据库：$DATABASE"
echo "  - 用户名：$DB_USERNAME"
echo ""

echo "正在执行 SQL 迁移..."
$MYSQL_CMD <<EOF
SOURCE /Users/yangjingjing/Desktop/SRAS/backend/sql/77_add_avatar_url_column.sql;
EOF

if [ $? -eq 0 ]; then
    echo ""
    echo "✓ 数据库迁移成功！"
    echo ""
    echo "已完成的变更："
    echo "  1. 添加了 sys_user.avatar_url VARCHAR(512) 字段"
    echo "  2. 迁移了现有远程头像 URL 从 avatar 到 avatar_url"
    echo ""
    echo "现在可以启动后端服务了："
    echo "  ./mvnw spring-boot:run"
else
    echo ""
    echo "✗ 数据库迁移失败，请检查错误信息"
    exit 1
fi
