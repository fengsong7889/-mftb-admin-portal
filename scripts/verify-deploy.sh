#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# 部署验收脚本 (verify-deploy.sh)
# ─────────────────────────────────────────────────────────────────────────────
# 用途：对目标环境做严格的发布后验收（就绪探针 + 关键业务接口），任一断言失败即非零退出。
#
# 环境变量（不写入任何凭据到本文件）：
#   BASE_URL   必填，目标后端基址，如 https://mftb-admin-api.cloud.sealos.io
#   VERIFY_USER 必填，验收账号（建议最小权限专用账号，勿用管理员）
#   VERIFY_PASS 必填，验收账号密码
#   BUILD_TAG  选填，期望的部署版本标识（配合 /api/health 或 product_version 校验）
#
# 用法：
#   BASE_URL=... VERIFY_USER=... VERIFY_PASS=... bash scripts/verify-deploy.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

: "${BASE_URL:?必须设置 BASE_URL，例如 export BASE_URL=https://mftb-admin-api.cloud.sealos.io}"
: "${VERIFY_USER:?必须设置 VERIFY_USER（最小权限验收账号）}"
: "${VERIFY_PASS:?必须设置 VERIFY_PASS}"
BASE_URL="${BASE_URL%/}"

CURL_TIMEOUT=( --connect-timeout 5 --max-time 20 )

fail() { echo "❌ $*" >&2; exit 1; }
pass() { echo "✅ $*"; }

# ── 0. 就绪探针（迁移/结构契约校验必须通过）──
READY_CODE=$(curl -s "${CURL_TIMEOUT[@]}" -o /dev/null -w "%{http_code}" "$BASE_URL/api/health/ready" || echo "000")
[ "$READY_CODE" = "200" ] || fail "就绪探针未通过 (HTTP $READY_CODE)：数据库迁移/结构校验未就绪，禁止视为发布成功"
pass "就绪探针通过 (ready=200)"

# ── 1. 登录换取 Token（不回显 token）──
LOGIN_JSON=$(curl -s "${CURL_TIMEOUT[@]}" -X POST "$BASE_URL/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"employeeCode\":\"${VERIFY_USER}\",\"password\":\"${VERIFY_PASS}\"}") \
  || fail "登录请求失败"

TOKEN=$(printf '%s' "$LOGIN_JSON" | python3 -c "import json,sys
try:
    d=json.load(sys.stdin)
except Exception:
    sys.exit(0)
print(d.get('data',{}).get('token') or d.get('token') or '')")

[ -n "$TOKEN" ] || fail "登录未返回 token（可能账号密码错误或业务码非成功）"
pass "登录成功（token 已获取，不回显）"

AUTH="Authorization: Bearer $TOKEN"

# ── 2. 通用接口断言：HTTP 200 + 业务 code==200 + 返回结构为 JSON ──
check_api() {
  local name="$1" url="$2"
  local body http_code
  body=$(curl -s "${CURL_TIMEOUT[@]}" -w $'\n%{http_code}' -H "$AUTH" "$url") \
    || { echo "❌ [$name] 请求失败" >&2; return 1; }
  http_code=$(printf '%s' "$body" | tail -n1)
  local json
  json=$(printf '%s' "$body" | sed '$d')
  [ "$http_code" = "200" ] || { echo "❌ [$name] HTTP $http_code" >&2; return 1; }
  printf '%s' "$json" | python3 -c "import json,sys
d=json.load(sys.stdin)
code=d.get('code')
assert code==200, f'业务码非 200: {code} / {d.get(\"message\")}'
assert isinstance(d.get('data'), (dict, list)), 'data 结构异常'" \
    || { echo "❌ [$name] 响应业务码/结构校验失败" >&2; return 1; }
  pass "[$name] 校验通过"
}

check_api "门店列表" "$BASE_URL/api/stores?page=1&size=1"
check_api "赠送列表" "$BASE_URL/api/gifts?page=1&size=1"
check_api "金字招牌计价列表" "$BASE_URL/api/ad/pricing/signboard?page=1&size=1"

pass "全部验收项通过：目标环境数据库就绪且关键接口正常${BUILD_TAG:+ (版本 $BUILD_TAG)}"
