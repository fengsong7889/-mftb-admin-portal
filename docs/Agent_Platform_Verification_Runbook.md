# 企業 Agent 平台 · 獨立機器驗收手冊

> 目的：在**獨立機器**上一次性跑完全量門禁與瀏覽器驗收，避免在開發機（記憶體/CPU 不足）上並發構建互相清空 `target/`。
> 前置：Node 20、JDK 17、Maven 3.9、MySQL 8 可達；`backend/.env.local` 已配置 `DB_URL/DB_USERNAME/DB_PASSWORD/JWT_SECRET`。

## 0. 進入目錄與環境

```bash
cd <repo>
npm ci --legacy-peer-deps
export JAVA_HOME=<jdk17>
MVN=<maven>/bin/mvn
```

## 1. 後端全量（必須獨佔，不要與其他 Maven 並行）

```bash
cd backend
$MVN clean test -B | tee /tmp/backend-full.log
grep -E "Tests run: [0-9]+, Failures" /tmp/backend-full.log | tail -1
grep -E "BUILD (SUCCESS|FAILURE)" /tmp/backend-full.log
```

預期：`Failures: 0, Errors: 0`，`BUILD SUCCESS`。
常見假紅：另一個進程執行 `clean` 導致 `NoClassDefFoundError` / `Could not modify all classes`；等對方結束後重跑。

## 2. 前端全量

```bash
cd ..
npm run lint
NODE_OPTIONS=--max-old-space-size=6144 npx tsc --noEmit
npm run check:menu
npm run check:stat-order
npm run check:confirm-modal
npm run check:i18n
npm run secret-scan
VITEST_MAX_FORKS=1 npx vitest run
```

低配機器建議 `VITEST_MAX_FORKS=1`；偶發超時先串行復現，不要放大超時掩蓋。

## 3. 啟動並確認遷移

```bash
cd backend
bash restart-service.sh --rebuild
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8080/api/health/ready   # 期望 200
```

日誌中確認（或直接查庫）：

```sql
SELECT version_key, applied_at FROM sys_schema_version
WHERE version_key LIKE 'ai:agent-platform%' ORDER BY version_key;
-- 期望 3 行：core-v1.0 / core-v1.1 / menu-v1.0

SELECT COUNT(*) FROM sys_menu WHERE menu_key LIKE 'agent-%' AND deleted=0 AND status=1;
-- 期望 8

SELECT menu_key, parent_id FROM sys_menu WHERE menu_key LIKE 'agent-%' ORDER BY sort_order;
-- 8 個 parent_id 均非空且指向 agent-platform
```

## 4. 瀏覽器驗收（admin 登入）

1. 側欄出現一級「企業 Agent」，展開 8 個二級：平台總覽 / 應用與版本 / 預算與配額 / 動作提案 / 知識授權 / 數據與端點 / 運行中心 / 評測與發布。
2. 逐頁打開，確認：
   - 無 403、無白屏、無 console 報錯；
   - 總覽四張卡為真實計數（未配置時為 0），就緒面板列出阻斷項；
   - 各表格為「接口數據」，空態顯示 antd Empty 而非報錯；
   - 語言切到 English，頁籤/表頭/按鈕/長說明均為英文，無中英混排；
   - 切回繁中，文案恢復。
3. 權限驗收：用一個**非 admin** 且未勾選 `agent-*` 的角色登入，側欄不應出現該分組；勾選 `agent-overview` 後刷新可見，且只能看到總覽。

## 5. 接口冒煙（複用瀏覽器 Token，勿重複登入以免互踢）

```bash
TOKEN=<從瀏覽器 localStorage mftb_token 取>
for p in ops/readiness applications budget-pools actions data-policies endpoints runs eval/cases releases; do
  printf "%-18s " "$p"
  curl -s -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:8080/api/agent/platform/$p" | head -c 120; echo
done
```

期望：均返回 `{"code":200,...}`；未配置時列表為空數組。

## 6. 上線前必須由業務完成（否則能力被拒）

1. `POST /api/agent/platform/data-policies`：逐系統登記資料等級。
2. `POST /api/agent/platform/endpoints`：批准模型端點可接收等級與有效期（默認 90 天）。
3. `POST /api/agent/platform/knowledge/{docId}/acl`：給知識文檔授權（否則檢索返回空）。
4. 上述完成後，`GET /ops/readiness` 的 `blocking` 應為空；此時才考慮 `AI_RUN_WORKER_ENABLED=true`。

## 7. 回滾

- 代碼：`git revert <本輪提交>`；前端只影響新增 8 條路由與一級菜單。
- 菜單：把 `agent-platform` 及其 8 個子菜單 `status=0`（或刪除），不影響 AI 助手既有菜單。
- 數據庫：新增 15 張表為獨立表，舊功能不讀寫；回滾無需刪表，停用入口即可。
- 執行器：`AI_RUN_WORKER_ENABLED=false` 立即停止後台領取（默認已關）。
