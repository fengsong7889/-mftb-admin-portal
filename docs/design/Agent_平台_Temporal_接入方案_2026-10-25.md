# 企業 Agent 平台 · Temporal 接入與遷移方案

> 狀態：待評審（本方案不改代碼，僅定義接入路徑與遷移步驟）
> 前置文檔：`docs/Enterprise_Agent_Platform_Progress_2026-10-23.md`（WP01–WP11 已完成）
> 目標：把 `AgentRunWorker`（單庫輪詢 + 租約）替換為 Temporal 持久化執行，取得跨實例定時觸發、Activity 重放、崩潰恢復與 exactly-once 語義。

---

## 一、為什麼要換（現狀的三個硬限制）

| 限制 | 現狀 | Temporal 之後 |
|---|---|---|
| 崩潰恢復 | 租約過期把 `running` 轉 `unknown`，**一律人工核實，不自動重跑** | Workflow 狀態由服務端持久化，Worker 重啟後從斷點續跑 |
| 跨實例定時 | `@Scheduled` 每個實例都會觸發，只能靠 CAS 搶奪 | 同一個 Workflow ID 天然去重，定時由 Workflow Timer 承擔 |
| 外部副作用 | 已發生的副作用無法判定，只能標 `unknown` | Activity 記錄在歷史中，`UNKNOWN` 只保留給真正無回執的外部動作（郵件/釘釘） |

**不變的邊界**：`AiToolPolicyServiceImpl.enforce` 對 `requireApproval=1` 的強制消費、預算池原子准入、知識 ACL、出域檢查、會話歸屬校驗——這些全部保留在 Activity 內部執行，不因換編排而放寬。

---

## 二、目標架構

```
POST /api/agent/platform/runs
        │  ① 落庫 ai_run(status=queued, idempotency_key)
        │  ② Temporal.start(AgentRunWorkflow, workflowId=run_no, taskQueue=ai-agent-run)
        ▼
┌───────────────────────── Temporal Server ─────────────────────────┐
│  AgentRunWorkflow（確定性代碼，不含 IO）                            │
│    ├─ Activity: prepareRun      准入/急停/模型授權/額度/出域/預算預占 │
│    ├─ Activity: callModel       模型調用（heartbeat 續租）           │
│    ├─ Activity: executeTool     工具執行（消費提案 + 寫回執）         │
│    ├─ Signal:  cancel           取消（未開始的步驟不再啟動）           │
│    └─ Query:   status           查詢步驟與進度                       │
└───────────────────────────────────────────────────────────────────┘
        │  ③ 每個 Activity 完成即寫 ai_run_step（現有投影表）
        ▼
GET /api/agent/platform/runs/{runNo}  →  讀 ai_run + ai_run_step（不變）
```

**關鍵不變式**

1. `workflowId = run_no`，`workflowIdReusePolicy = REJECT_DUPLICATE` —— 同一受理單永不重複執行。
2. Workflow 只做編排，**所有 IO（DB/模型/HTTP）都在 Activity**，保證重放安全。
3. Activity 冪等鍵 = `run_no + stepNo`，重試不會重複扣費或重複寫回執。
4. 取消用 Signal，不用「改數據庫字段輪詢」；`ai_run.cancel_requested` 僅作審計留痕。
5. `ai_run` 保留為**查詢投影**，前端 API 契約不變。

---

## 三、代碼結構（新增/改動清單）

| 文件 | 動作 | 說明 |
|---|---|---|
| `backend/pom.xml` | 改 | 新增 `io.temporal:temporal-sdk:1.25.x`（版本集中在 `<properties>`） |
| `service/agent/temporal/AgentRunWorkflow.java` | 新增 | `@WorkflowInterface`：`run(AgentRunInput)`、`@SignalMethod cancel()`、`@QueryMethod status()` |
| `service/agent/temporal/AgentRunWorkflowImpl.java` | 新增 | 只編排；超時/重試策略在此聲明 |
| `service/agent/temporal/AgentRunActivities.java` | 新增 | `@ActivityInterface`：`prepareRun` / `callModel` / `executeTool` / `finishRun` |
| `service/agent/temporal/AgentRunActivitiesImpl.java` | 新增 | **搬遷現有 Worker 邏輯**：`orchestration.orchestrate(...)` 與 `actionExecution` 調用不變 |
| `service/agent/temporal/TemporalRunService.java` | 新增 | `start(run)`、`signalCancel(runNo)`、`describe(runNo)`；開關關閉時拋 `UnsupportedOperationException` |
| `service/agent/platform/AgentRunWorker.java` | 改 | 保留但受 `ai.temporal.enabled` 抑制：`enabled && !temporalEnabled` 才輪詢 |
| `controller/AgentPlatformController` | 改 | `POST /runs` 按開關分流到 Temporal 或原受理邏輯；`POST /runs/{no}/cancel` 對 Temporal 走 Signal |
| `config/TemporalConfig.java` | 新增 | `WorkflowClient` / `WorkerFactory` Bean，全部來自配置，默認 `enabled=false` |
| `resources/292_temporal_run_link.sql` | 新增 | `ai_run` 增 `temporal_workflow_id`、`temporal_run_id`、`engine` 三列 + 索引 |
| `db/migrations/catalog.json` | 改 | 登記 `ai:agent-platform-core-v1.2`（依賴 v1.1） |

**Activity 重試與超時（決策值）**

| Activity | StartToClose | Retry | 非重試異常 |
|---|---|---|---|
| `prepareRun` | 30s | 3 次，指數退避 1s→30s | `BusinessException(4xx)` → 直接失敗 |
| `callModel` | 10m（heartbeat 30s） | 2 次 | 額度/授權拒絕不重試 |
| `executeTool` | 5m | 2 次（僅網絡類） | 提案已消費/已過期不重試 |
| `finishRun` | 30s | 5 次 | 無 |

> heartbeat 的意義：模型長調用期間 Worker 掛掉，Temporal 能在 heartbeat 超時後重派，而不是等 30 分鐘租約。

---

## 四、配置項（全部默認關閉）

```yaml
ai:
  temporal:
    enabled: ${AI_TEMPORAL_ENABLED:false}
    target: ${AI_TEMPORAL_TARGET:127.0.0.1:7233}
    namespace: ${AI_TEMPORAL_NAMESPACE:default}
    task-queue: ${AI_TEMPORAL_TASK_QUEUE:ai-agent-run}
    worker-concurrency: ${AI_TEMPORAL_WORKER_CONCURRENCY:4}
    workflow-timeout-minutes: ${AI_TEMPORAL_WORKFLOW_TIMEOUT:30}
  run:
    worker-enabled: ${AI_RUN_WORKER_ENABLED:false}   # 與 Temporal 互斥，見第五節
```

**啟動斷言**：`enabled=true` 且 `worker-enabled=true` 時直接啟動失敗，避免雙引擎同時領取同一受理單。

---

## 五、遷移步驟（四階段，每階段可獨立回滾）

### P0 · 只加依賴與配置（不改行為）
- 引入 SDK、新增 `TemporalConfig`（`enabled=false` 時不建立任何 Bean）、新增 `292` 遷移。
- 驗收：全量測試綠；`ops/readiness` 回傳 `engine=worker`；生產行為零變化。
- 回滾：回退提交即可。

### P1 · 雙寫影子模式（推薦觀察 1–2 週）
- `POST /runs` 仍走舊執行器，但額外 `start` 一個 `AgentRunWorkflow` 標記 `shadow=true`：只跑 `prepareRun`（准入/預算校驗），**不調模型、不執行工具**。
- 目的：驗證 Temporal 連通性、准入結果與舊執行器一致、預算預占/釋放無泄漏。
- 驗收：影子運行與真實運行的 `prepareRun` 結論一致率 100%；影子不產生費用（模型調用計數器為 0）。
- 回滾：`AI_TEMPORAL_ENABLED=false` 即刻停止。

### P2 · 灰度切換（按應用維度）
- `ai_application.temporal_enabled=1` 的應用走 Temporal，其餘走舊執行器；同一時刻 `worker-enabled=false`（舊執行器只處理灰度外應用時保持 true，用 `engine` 列區分領取範圍）。
- 建議先切 1 個內部應用（如 `demo-agent`），觀察 1 週：成功率、平均耗時、`unknown` 數量、預算差異。
- 驗收口徑：`ai_run.engine='temporal'` 的運行成功率不低於舊引擎；`unknown` 數量為 0（除外部回執）。
- 回滾：把該應用 `temporal_enabled=0`，新受理單回舊引擎；已啟動的 Workflow 可 `terminate` 並由人工對賬。

### P3 · 全量切換並下線輪詢
- 全部應用 `temporal_enabled=1`；`AI_RUN_WORKER_ENABLED=false` 長期保留；`AgentRunWorker` 標 `@Deprecated`，僅保留 `markStaleRunningUnknown` 作歷史清理。
- 觀察 2 週後刪除輪詢代碼與 `lease_*` 列的讀取邏輯（列保留，不刪）。
- 回滾：`AI_TEMPORAL_ENABLED=false` + `AI_RUN_WORKER_ENABLED=true`，未完成的 Temporal Workflow 需人工 `terminate` 並把對應 `ai_run` 置 `unknown`。

---

## 六、部署形態（需企業內網 + 獨立庫）

最小可用組合（本地/預發可 Docker Compose）：

```yaml
services:
  temporal:
    image: temporalio/auto-setup:1.25
    environment:
      DB: mysql8
      DB_PORT: 3306
      MYSQL_USER: temporal
      MYSQL_PWD: ${TEMPORAL_DB_PASSWORD}
      MYSQL_SEEDS: ${TEMPORAL_DB_HOST}
      DYNAMIC_CONFIG_FILE_PATH: config/dynamicconfig/development-sql.yaml
    ports: ["7233:7233"]
  temporal-ui:
    image: temporalio/ui:2.31
    environment:
      TEMPORAL_ADDRESS: temporal:7233
    ports: ["8233:8080"]
```

要點：
- **獨立 MySQL schema**（`temporal`）與業務庫分離，避免業務遷移影響編排歷史。
- 生產需 mTLS + 前端 UI 僅內網；`visibility` 用 SQL 進階檢索（`advanced-visibility`）。
- 容量估算：單 Workflow 歷史約 20–60 KB；按日均 1 萬運行、保留 30 天估算約 6–18 GB，需配 retention 與歸檔。

---

## 七、測試與驗收

| 層 | 方法 | 通過標準 |
|---|---|---|
| Workflow 單元 | `TestWorkflowEnvironment`（time-skipping） | 正常路徑、取消、Activity 重試、超時分支全覆蓋 |
| Activity 單元 | 現有 Mockito 方式 | 准入拒絕、預算拒絕、提案消費失敗均不重試 |
| 冪等 | 同一 `run_no` 重複 `start` | `REJECT_DUPLICATE` 生效，只產生 1 個 Workflow |
| 崩潰恢復 | 殺 Worker 進程後重啟 | Workflow 續跑，`ai_run_step` 不重複 |
| 灰度對照 | 同輸入雙跑（影子 vs 真實） | `prepareRun` 結論一致、無額外計費 |

---

## 八、風險與對策

| 風險 | 影響 | 對策 |
|---|---|---|
| Temporal 集群不可用 | 新受理單無法啟動 | `start` 失敗 **不落 queued**，直接 503 並提示稍後重試；不靜默降級到舊引擎（避免語義不一致） |
| Workflow 代碼非確定性 | 重放失敗、任務卡死 | Code review 硬規則：Workflow 內禁止 `new Date()`、`Math.random()`、直接 IO；用 `Workflow.currentTimeMillis()` / `SideEffect` |
| Activity 重試造成重複副作用 | 重複推送/重複扣費 | 冪等鍵 `run_no+stepNo`；外部調用要求供應方支持幂等鍵（釘釘 `msgKey`） |
| 歷史膨脹 | 存儲與檢索變慢 | `continue-as-new`（單 Workflow 事件 > 5 萬時）、retention 30 天 |
| 雙引擎並存 | 同一受理單被執行兩次 | 啟動斷言互斥 + `engine` 列過濾 + P3 收尾下線 |

---

## 九、與現有文檔的關係

- 本方案**不改變** `docs/Agent_Platform_Verification_Runbook.md` 的驗收步驟；P2 之後追加一節「Temporal 灰度驗收」。
- `docs/Enterprise_Agent_Platform_Progress_2026-10-23.md` 第「四、仍未完成」中「Temporal 真持久化執行」一項，在本方案 P3 完成後方可標記為已完成。
- 在此之前，對外表述保持：**「運行受理與步驟可查，崩潰不自動重跑，等人工核實」**。
