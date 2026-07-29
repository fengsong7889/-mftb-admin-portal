#!/bin/bash
set -e
echo "=== 登录 ==="
TOKEN=$(curl -s -X POST https://mftb-admin-api.cloud.sealos.io/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"employeeCode":"MT0001","password":"111222"}' | python3 -c "import json,sys;print(json.load(sys.stdin).get('token',''))")
echo "token=${TOKEN:0:20}..."

echo "=== 门店列表 ==="
curl -s -H "Authorization: Bearer $TOKEN" "https://mftb-admin-api.cloud.sealos.io/api/stores?page=1&size=3" | python3 -c "
import json,sys
d=json.load(sys.stdin)
for r in d.get('records',[])[:3]:
    print(f\"  {r.get('storeCode')}  {r.get('storeName')}  bizChannel={r.get('bizChannel')}\")"

echo "=== 赠送列表 ==="
curl -s -H "Authorization: Bearer $TOKEN" "https://mftb-admin-api.cloud.sealos.io/api/gifts?page=1&size=3" | python3 -c "
import json,sys
d=json.load(sys.stdin)
for r in d.get('records',[])[:3]:
    print(f\"  groupCode={r.get('groupCode')}  groupName={r.get('groupName')}  storeCode={r.get('storeCode')}  storeName={r.get('storeName')}\")"

echo "=== 消费列表 ==="
curl -s -H "Authorization: Bearer $TOKEN" "https://mftb-admin-api.cloud.sealos.io/api/gifts/consume?page=1&size=3" | python3 -c "
import json,sys
d=json.load(sys.stdin)
for r in d.get('records',[])[:3]:
    print(f\"  groupCode={r.get('groupCode')}  groupName={r.get('groupName')}  storeCode={r.get('storeCode')}  storeName={r.get('storeName')}\")"
