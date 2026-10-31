#!/usr/bin/env bash
# Copyright (c) 2026 fengsong7889. All Rights Reserved.
# 本文件属专有软件组成部分，未经著作权人书面许可不得使用、复制或再分发。
# 完整许可条款见仓库根目录 LICENSE 文件。
#
# 生产环境变量变更后的只读验收（改完 JWT_SECRET / CORS / 引导口令等配置后跑一次）。
# 全程只发匿名请求：不发送任何凭据、不写集群、不重启服务、不落盘任何文件。
#
# 用法：
#   bash scripts/verify-sealos-env.sh                      # 自动推导目标与前端来源
#   BASE_URL=https://your-api.example bash scripts/verify-sealos-env.sh
#   EXPECT_CORS_ORIGIN=https://your-frontend.example bash scripts/verify-sealos-env.sh
#
# 目标地址与跨域来源不写字面量（否则仓内会出现第二份会漂移的环境副本）：
#   BASE_URL            未指定时取 .env.production 的 VITE_API_BASE_URL
#   EXPECT_CORS_ORIGIN  未指定时由 package.json 的 homepage 推导 origin（scheme://host）
#
# 退出码：0=全部通过 / 1=存在失败项 / 2=依赖或用法错误
#
# 判读要点：
#   - 滚动更新刚结束的 5 分钟内 ready 可能仍是 503（新实例要跑完启动期迁移），先重跑再判定故障。
#   - 轮换 JWT_SECRET 后，本脚本无法证明「旧 token 已失效」——那需要人工拿一个轮换前的
#     旧 token 请求受保护接口并确认返回 401。本脚本只验证服务姿态与鉴权未被绕过。
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TIMEOUT="${TIMEOUT:-15}"
FAILURES=0

command -v curl >/dev/null 2>&1 || { echo "❌ 缺少 curl"; exit 2; }

# 目标地址：显式 BASE_URL 优先，否则取前端构建用的同一份真值（.env.production）
BASE_URL="${BASE_URL:-}"
if [ -z "$BASE_URL" ] && [ -f "$REPO_ROOT/.env.production" ]; then
  BASE_URL=$(sed -nE 's/^VITE_API_BASE_URL=//p' "$REPO_ROOT/.env.production" | head -1 | sed -e 's/^"//' -e 's/"$//')
  [ -n "$BASE_URL" ] && echo "ℹ️  未指定 BASE_URL，已取 .env.production 的 VITE_API_BASE_URL"
fi
if [ -z "$BASE_URL" ]; then
  echo "❌ 缺少目标地址：请用 BASE_URL=https://<生产API域名> bash $0 指定"
  exit 2
fi

# 期望的 CORS 来源：显式优先，否则由 package.json 的 homepage 推导 origin
EXPECT_CORS_ORIGIN="${EXPECT_CORS_ORIGIN:-}"
if [ -z "$EXPECT_CORS_ORIGIN" ] && command -v node >/dev/null 2>&1 && [ -f "$REPO_ROOT/package.json" ]; then
  EXPECT_CORS_ORIGIN=$(node -e 'const p=require(process.argv[1]);try{console.log(new URL(p.homepage||"").origin)}catch{console.log("")}' "$REPO_ROOT/package.json" 2>/dev/null)
  [ -n "$EXPECT_CORS_ORIGIN" ] && echo "ℹ️  未指定 EXPECT_CORS_ORIGIN，已由 package.json homepage 推导为 $EXPECT_CORS_ORIGIN"
fi
if [ -z "$EXPECT_CORS_ORIGIN" ]; then
  echo "❌ 缺少期望的 CORS 来源：请用 EXPECT_CORS_ORIGIN=https://<前端域名> bash $0 指定"
  exit 2
fi

# 去掉尾部斜杠，避免拼出 //api
BASE_URL="${BASE_URL%/}"

pass() { echo "  ✅ $1"; }
fail() { echo "  ❌ $1"; FAILURES=$((FAILURES + 1)); }

# 取状态码：$* 为 curl 参数
http_code() { curl -s -o /dev/null -w '%{http_code}' -m "$TIMEOUT" "$@" 2>/dev/null; }

# 取响应头值（大小写不敏感）：$1=头名，其余为 curl 参数
header_value() {
  local name="$1"; shift
  curl -sS -o /dev/null -D - -m "$TIMEOUT" "$@" 2>/dev/null \
    | awk -v h="$name" 'BEGIN{IGNORECASE=1} tolower($1) ~ tolower(h)":" {gsub(/\r/,"",$2); print $2; exit}'
}

echo "目标: $BASE_URL"
echo "期望跨域来源: $EXPECT_CORS_ORIGIN"
echo

echo "[1/5] 存活探针"
code=$(http_code "$BASE_URL/api/health/live")
[ "$code" = "200" ] && pass "GET /api/health/live → 200" || fail "GET /api/health/live → $code（期望 200；进程未存活或未发布）"

echo "[2/5] 就绪探针（迁移与结构契约校验）"
code=$(http_code "$BASE_URL/api/health/ready")
if [ "$code" = "200" ]; then
  pass "GET /api/health/ready → 200"
elif [ "$code" = "503" ]; then
  fail "GET /api/health/ready → 503：未就绪。刚滚动更新可等 1~5 分钟重跑；持续 503 说明迁移或结构契约未通过，需查后端日志"
else
  fail "GET /api/health/ready → $code（期望 200）"
fi

echo "[3/5] 前端来源跨域预检必须放行，且回显具体来源"
code=$(http_code -X OPTIONS "$BASE_URL/api/auth/login" \
  -H "Origin: $EXPECT_CORS_ORIGIN" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type")
acao=$(header_value 'access-control-allow-origin' -X OPTIONS "$BASE_URL/api/auth/login" \
  -H "Origin: $EXPECT_CORS_ORIGIN" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type")
if [ "$code" = "200" ] && [ "$acao" = "$EXPECT_CORS_ORIGIN" ]; then
  pass "OPTIONS 预检 → 200，access-control-allow-origin 精确回显 $EXPECT_CORS_ORIGIN"
elif [ "$code" = "403" ]; then
  fail "OPTIONS 预检 → 403：该来源不在 CORS_ALLOWED_ORIGINS 内，线上前端会全部跨域失败"
else
  fail "OPTIONS 预检 → code=$code, acao='${acao:-<缺失>}'（期望 200 且 acao 精确等于来源；allowCredentials=true 时 acao 不能是 *）"
fi

echo "[4/5] 非白名单来源必须被拒（证明白名单真在生效，而非退化成 *）"
code=$(http_code -X OPTIONS "$BASE_URL/api/auth/login" \
  -H "Origin: https://not-allowed.invalid" \
  -H "Access-Control-Request-Method: POST")
if [ "$code" = "403" ]; then
  pass "OPTIONS 预检（陌生来源）→ 403，符合预期"
else
  fail "OPTIONS 预检（陌生来源）→ $code（期望 403。若为 200，说明 CORS 被放宽到任意来源，属高危配置）"
fi

echo "[5/5] 未认证请求必须 401（鉴权未被配置变更绕过）"
code=$(http_code "$BASE_URL/api/auth/info")
[ "$code" = "401" ] && pass "GET /api/auth/info（无 token）→ 401" || fail "GET /api/auth/info（无 token）→ $code（期望 401；若为 200 说明鉴权被绕过）"

echo
if [ "$FAILURES" -eq 0 ]; then
  echo "✅ 全部通过（5/5）。仍请人工补一项：用轮换前的旧 token 请求受保护接口，应返回 401。"
  exit 0
fi
echo "❌ 有 $FAILURES 项未通过。"
exit 1
