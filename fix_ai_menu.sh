#!/bin/bash

# AI 菜单清理与重建脚本

echo "=========================================="
echo "AI 智能中心菜单重构 - 清理与重建"
echo "=========================================="

# 1. 停止后端
echo "1. 正在停止后端服务..."
lsof -ti:8080 | xargs kill -9 2>/dev/null && echo "   ✓ 已停止端口 8080" || echo "   ⚠ 端口 8080 未运行"

# 2. 清理旧菜单（通过 Java 自动清理）
echo ""
echo "2. 清理完成！现在重启后端将自动重建正确的菜单结构"

# 3. 重启后端
echo "3. 正在重启后端服务..."
cd /Users/yangjingjing/Desktop/SRAS/backend
./run-local.sh &
echo "   ✓ 后端已在后台启动..."

# 4. 等待启动
echo ""
echo "4. 等待后端完全启动（约 30 秒）..."
sleep 35

# 5. 验证
echo ""
echo "=========================================="
echo "验证步骤："
echo "=========================================="
echo "✅ 后端地址：http://localhost:8080"
echo "✅ 前端地址：http://localhost:5173"
echo ""
echo "请登录后检查侧边栏菜单结构："
echo "▼ 智能中心 (AI)"
echo "  ├─ ▶ 模型管理"
echo "  │   ├─ 供应商管理  →  /ai-model-provider"
echo "  │   └─ 模型列表    →  /ai-model-list"
echo "  ├─ ▶ 授权与配额"
echo "  │   ├─ 权限管理    →  /ai-auth"
echo "  │   └─ 额度策略    →  /ai-quota"
echo "  ├─ 工具注册中心"
echo "  └─ 能耗统计"
echo "=========================================="
