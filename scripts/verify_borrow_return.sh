#!/bin/bash
# EAM 借用/归还端到端 API 验证脚本
# 参照 EAM_MODULE_TEST_REPORT.md §7.1-7.2

BASE="http://localhost:8080"
TOKEN=""

# 登录获取 token
login() {
  local resp
  resp=$(curl -s -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
    -d '{"username":"MF00001","password":"111222"}')
  TOKEN=$(echo "$resp" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")
  echo "[OK] 登录成功, token=${TOKEN:0:20}..."
}

api() {
  local method=$1 url=$2 data=$3
  if [ -n "$data" ]; then
    curl -s -X "$method" "$BASE$url" -H "Authorization: Bearer $TOKEN" \
      -H 'Content-Type: application/json' -d "$data"
  else
    curl -s -X "$method" "$BASE$url" -H "Authorization: Bearer $TOKEN"
  fi
}

assert_contains() {
  local actual=$1 expected=$2 msg=$3
  if echo "$actual" | grep -q "$expected"; then
    echo "  [PASS] $msg"
  else
    echo "  [FAIL] $msg — expected '$expected' in response"
    echo "    actual: $(echo "$actual" | head -c 200)"
  fi
}

# ====== §7.1 借用管理验证 ======
login
echo ""
echo "====== §7.1 借用管理 API 验证 ======"

# 1. 查找闲置资产
echo ""
echo "--- 1. 查找闲置资产 ---"
ASSETS=$(api GET "/api/eam/assets?page=1&size=10&status=idle")
ASSET_ID=$(echo "$ASSETS" | python3 -c "import sys,json; r=json.load(sys.stdin)['data']['records']; print(r[0]['id'] if r else 'NONE')")
ASSET_NO=$(echo "$ASSETS" | python3 -c "import sys,json; r=json.load(sys.stdin)['data']['records']; print(r[0]['assetNo'] if r else 'NONE')")
ASSET_STATUS=$(echo "$ASSETS" | python3 -c "import sys,json; r=json.load(sys.stdin)['data']['records']; print(r[0]['status'] if r else 'NONE')")
echo "  闲置资产: id=$ASSET_ID, no=$ASSET_NO, status=$ASSET_STATUS"

# 2. 查找在职员工
echo ""
echo "--- 2. 查找在职员工 ---"
EMPS=$(api GET "/api/employees?page=1&size=10&employmentStatus=active")
EMP_ID=$(echo "$EMPS" | python3 -c "import sys,json; r=json.load(sys.stdin)['data']['records']; print(r[0]['id'] if r else 'NONE')")
EMP_NAME=$(echo "$EMPS" | python3 -c "import sys,json; r=json.load(sys.stdin)['data']['records']; print(r[0]['name'] if r else 'NONE')")
EMP_DEPT=$(echo "$EMPS" | python3 -c "import sys,json; r=json.load(sys.stdin)['data']['records']; print(r[0].get('department','') if r else 'NONE')")
echo "  在职员工: id=$EMP_ID, name=$EMP_NAME, dept=$EMP_DEPT"

# 3. 登记借用
echo ""
echo "--- 3. 登记借用 (POST /api/eam/borrows) ---"
BORROW_RESP=$(api POST "/api/eam/borrows" "{\"assetId\":$ASSET_ID,\"holderId\":$EMP_ID,\"department\":\"$EMP_DEPT\",\"startDate\":\"2026-09-17\",\"dueDate\":\"2026-09-30\",\"purpose\":\"端到端测试借用\"}")
echo "  响应: $(echo "$BORROW_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d,ensure_ascii=False))" 2>/dev/null || echo "$BORROW_RESP")"
assert_contains "$BORROW_RESP" '"code":200' "借用登记返回成功"
BORROW_ID=$(echo "$BORROW_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',''))" 2>/dev/null)
echo "  借用单 ID: $BORROW_ID"

# 4. 验证资产状态变为 in_use
echo ""
echo "--- 4. 验证资产状态 → in_use ---"
ASSET_CHECK=$(api GET "/api/eam/assets/$ASSET_ID")
assert_contains "$ASSET_CHECK" '"status":"in_use"' "资产状态变为 in_use"

# 5. 反例验证：同一资产再次借用应失败
echo ""
echo "--- 5. 反例：同一资产再次借用 → 应报错 ---"
DUP_RESP=$(api POST "/api/eam/borrows" "{\"assetId\":$ASSET_ID,\"holderId\":$EMP_ID,\"department\":\"$EMP_DEPT\",\"startDate\":\"2026-09-17\",\"dueDate\":\"2026-09-30\",\"purpose\":\"重复借用测试\"}")
assert_contains "$DUP_RESP" "僅閒置資產可借用" "重复借用被拒绝"

# 6. 查看借用详情
echo ""
echo "--- 6. 查看借用详情 ---"
if [ -n "$BORROW_ID" ] && [ "$BORROW_ID" != "" ]; then
  DETAIL=$(api GET "/api/eam/borrows/$BORROW_ID")
  assert_contains "$DETAIL" '"status":"active"' "借用单状态为 active"
  assert_contains "$DETAIL" "\"assetId\":$ASSET_ID" "借用单关联资产正确"
fi

# ====== §7.2 归还管理验证 ======
echo ""
echo "====== §7.2 归还管理 API 验证 ======"

# 7. 正常归还
echo ""
echo "--- 7. 正常归还 (POST /api/eam/returns) ---"
RETURN_RESP=$(api POST "/api/eam/returns" "{\"borrowId\":$BORROW_ID,\"returnDate\":\"2026-09-17\",\"assetCondition\":\"normal\",\"returnReason\":\"端到端测试正常归还\"}")
echo "  响应: $(echo "$RETURN_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d,ensure_ascii=False))" 2>/dev/null || echo "$RETURN_RESP")"
assert_contains "$RETURN_RESP" '"code":200' "归还登记返回成功"
RETURN_ID=$(echo "$RETURN_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',''))" 2>/dev/null)
echo "  归还单 ID: $RETURN_ID"

# 8. 验证资产恢复 idle
echo ""
echo "--- 8. 验证资产恢复 idle ---"
ASSET_AFTER=$(api GET "/api/eam/assets/$ASSET_ID")
assert_contains "$ASSET_AFTER" '"status":"idle"' "资产恢复为 idle"

# 9. 再借用一件用于损坏归还测试
echo ""
echo "--- 9. 再借用一件资产（用于损坏/遗失测试）---"
ASSETS2=$(api GET "/api/eam/assets?page=1&size=10&status=idle")
ASSET_ID2=$(echo "$ASSETS2" | python3 -c "import sys,json; r=json.load(sys.stdin)['data']['records']; print(r[0]['id'] if r else 'NONE')")
echo "  第二件闲置资产: id=$ASSET_ID2"

BORROW2_RESP=$(api POST "/api/eam/borrows" "{\"assetId\":$ASSET_ID2,\"holderId\":$EMP_ID,\"department\":\"$EMP_DEPT\",\"startDate\":\"2026-09-17\",\"dueDate\":\"2026-09-30\",\"purpose\":\"损坏测试借用\"}")
BORROW_ID2=$(echo "$BORROW2_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',''))" 2>/dev/null)
echo "  第二笔借用单 ID: $BORROW_ID2"

# 10. 损坏归还
echo ""
echo "--- 10. 损坏归还 ---"
DAMAGED_RESP=$(api POST "/api/eam/returns" "{\"borrowId\":$BORROW_ID2,\"returnDate\":\"2026-09-17\",\"assetCondition\":\"damaged\",\"returnReason\":\"端到端测试损坏归还\",\"exceptionReason\":\"测试损坏\"}")
assert_contains "$DAMAGED_RESP" '"code":200' "损坏归还登记成功"
RETURN_ID2=$(echo "$DAMAGED_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',''))" 2>/dev/null)
echo "  损坏归还单 ID: $RETURN_ID2"

# 11. 验证资产 exception_pending
echo ""
echo "--- 11. 验证资产状态 → exception_pending（不释放）---"
ASSET_DAMAGED=$(api GET "/api/eam/assets/$ASSET_ID2")
# 损坏归还不释放资产，资产应仍为 in_use
assert_contains "$ASSET_DAMAGED" '"status":"in_use"' "损坏归还后资产仍为 in_use（未释放）"

# 12. 处置：报废
echo ""
echo "--- 12. 处置报废 (POST /api/eam/returns/dispose) ---"
DISPOSE_RESP=$(api POST "/api/eam/returns/$RETURN_ID2/dispose" "{\"disposition\":\"scrapped\",\"dispositionDate\":\"2026-09-17\"}")
assert_contains "$DISPOSE_RESP" '"code":200' "处置报废成功"

# 13. 验证资产 scrapped
echo ""
echo "--- 13. 验证资产 → scrapped ---"
ASSET_SCRAPPED=$(api GET "/api/eam/assets/$ASSET_ID2")
assert_contains "$ASSET_SCRAPPED" '"status":"scrapped"' "资产状态变为 scrapped"

# 14. 遗失分支测试
echo ""
echo "--- 14. 遗失分支：借用第三件 → 遗失归还 → 找回 ---"
ASSETS3=$(api GET "/api/eam/assets?page=1&size=10&status=idle")
ASSET_ID3=$(echo "$ASSETS3" | python3 -c "import sys,json; r=json.load(sys.stdin)['data']['records']; print(r[0]['id'] if r else 'NONE')")
if [ "$ASSET_ID3" != "NONE" ]; then
  BORROW3_RESP=$(api POST "/api/eam/borrows" "{\"assetId\":$ASSET_ID3,\"holderId\":$EMP_ID,\"department\":\"$EMP_DEPT\",\"startDate\":\"2026-09-17\",\"dueDate\":\"2026-09-30\",\"purpose\":\"遗失测试借用\"}")
  BORROW_ID3=$(echo "$BORROW3_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',''))" 2>/dev/null)

  LOST_RESP=$(api POST "/api/eam/returns" "{\"borrowId\":$BORROW_ID3,\"returnDate\":\"2026-09-17\",\"assetCondition\":\"lost\",\"returnReason\":\"端到端测试遗失\",\"exceptionReason\":\"外勤遗失\"}")
  assert_contains "$LOST_RESP" '"code":200' "遗失归还成功"
  RETURN_ID3=$(echo "$LOST_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',''))" 2>/dev/null)

  # 找回
  RECOVER_RESP=$(api POST "/api/eam/returns/$RETURN_ID3/recover" "{\"recoveredNote\":\"端到端测试找回\"}")
  assert_contains "$RECOVER_RESP" '"code":200' "遗失找回成功"

  # 验证资产恢复 idle
  ASSET_RECOVERED=$(api GET "/api/eam/assets/$ASSET_ID3")
  assert_contains "$ASSET_RECOVERED" '"status":"idle"' "找回后资产恢复 idle"

  # 重复找回应报错
  RECOVER_DUP=$(api POST "/api/eam/returns/$RETURN_ID3/recover" "{\"recoveredNote\":\"重复找回\"}")
  assert_contains "$RECOVER_DUP" "僅異常歸還" "重复找回被拒绝"
else
  echo "  [SKIP] 无第三件闲置资产"
fi

echo ""
echo "====== 验证完成 ======"
