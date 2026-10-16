# 产研交付系统（RDM）第三、四批改造 — 进度与交接说明（v2）

> 本文件为**交接文档（v2，2026-10-16 更新）**：记录当前真实进度、已完成并独立验证的成果、**当前工作区状态（含一处 RED）**、剩余待办、关键契约签名、安全约束与验证方式，供接手人直接继续。
> 分支：`main`。最后一次提交：`f82b02ab`（含到任务21为止 + 本交接文档 v1）。**f82b02ab 之后的全部改动（任务22/23/27/28/29/30/31/32/33）均未提交**，在工作区中。
> 批准计划文件（**不得修改**）：`.../cache/plans/RDM_Batch3-4_Release_Migration_aa05c26b.md`；原始规范 `.qoder/plans/spec_22762caa.md`。

---

## 0. 一句话现状

第三、四批**后端与前端功能已全部实现**，其中除任务33 外均已独立验证通过。**当前后端 test-compile 为 RED**（任务33 重构未收尾，见 §3），接手人**第一步必须先修复该 RED** 才能跑任何后端测试。剩余待办 = 任务33 收尾 + 任务24（集成/回归验证门）+ 任务25（浏览器闭环）+ 任务14（第二批浏览器复测）。

---

## 1. 运行环境

| 项 | 值 |
|---|---|
| 工作区 | `/Users/yangjingjing/Desktop/SRAS`；后端根 `backend/` |
| 数据库 | 用户确认的**独立测试库**（已授权迁移/测试写入，非生产） |
| Java17 | `export JAVA_HOME=/Users/yangjingjing/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home` |
| Maven | `/Users/yangjingjing/apache-maven-3.9.6/bin/mvn`（离线 `-o`） |
| 运行中后端 | **PID 9557**，jar 编译于 2026-10-15 14:48（**只含到任务20为止的代码**）。任务21/22/27/28/29/31/33 的后端代码**尚未**进该 jar；任务24 需 `cd backend && bash restart-service.sh --rebuild` 使其上线并验 `/api/health/ready`=200 |
| 前端 | Vite dev 端口 3000，Hash 路由；前端门禁基线 `test:run` **791 全绿** |
| 重启规则 | 改 Java 后 `restart-service.sh --rebuild`；禁 `run-local.sh` 默认、禁手动 kill 端口、禁 `mvn clean`（会删运行中 jar）；重启后验 ready=200 |
| 凭据 | `backend/.env.local`（gitignore，禁回显/入库） |

API 约定：`{code,message,data}`，成功 200，拦截器返回 data；新批次分页 `pageNo/pageSize`+`records/total`，旧需求 `page/size`；身份取 `SysUser.id`；`scopeVersion`=业务范围版本、`version/expectedVersion`=并发乐观锁，严禁混用。

---

## 2. 已完成并**独立验证通过**的任务

| 任务 | 内容 | 验证 |
|---|---|---|
| 18 | 数据契约层 + 237/238 迁移 + executeOnce | 离线全量 javac 0 error；新增测试全绿 |
| 26 | 测试库真实迁移（D1/D4） | 237/238 落库 MySQL8、活库契约 45 项通过、ready=200 |
| 19 | V3 归属权限/范围版本保护 | 全量 922 绿；安全静态核对全 PASS |
| 20 | 冻结测试轮次 + 双路径验收 | 全量 969 绿；门禁核对全 PASS |
| 21 | 延期承接与问题解决闭环 | 全量 1001 绿；14 项门禁 PASS |
| 27 | 发布硬门禁 + 紧急补验 | 全量 1130 绿；10 项门禁 PASS（含修复 snapshotScopeVersions 静默失效 BUG） |
| 28 | 幂等键 client_request_id 列宽归一化 | 中心 normalizeClientRequestId + 回归测试 |
| 22 | 统一事实源/待办/导出/对账 + 通知催办 | 全量 1311 绿；签名变更零波及 |
| 29 | 存量安全迁移 + V3 灰度管理 | 全量 1360 绿；「绝不伪造证据」独立核实（17 类事实 Mapper 零写入） |
| 31 | 发布批次 allowedActions 动作码 | Rdm*Test 643 绿（后端 UI-only，独立复核并入任务24/25） |
| 23 | 前端契约层 + 4 详情页修正 | 6 门禁全绿、772 测试绿、前后端契约 **0 漂移** |
| 32 | 考勤 ja/ko/ru i18n 缺键补齐 | 772/772 全绿 |
| 30 | 前端管理动线 + 迁移/灰度页面 | 6 门禁全绿、791 测试绿（新页面独立复核并入任务24/25） |

**测试基线（任务33 之前）**：后端 `Rdm*Test` **643**、全量 **1360**（Skipped 7 = VehicleConcurrency DB 门控）；前端 `test:run` **791**。

---

## 3. ⚠️ 当前工作区状态：任务33 进行中、后端 test-compile RED（接手第一步）

任务33「抽取共享 EvidenceValidityResolver」由 Kurt 实施到一半即中断（返回片段报告）：
- **已完成**：新建 `service/EvidenceValidityResolver.java`；`RdmDeliveryItemService`/`RdmTestBatchService`/`RdmAcceptanceRecordService` 三处改为委派它；三处旧的重复过滤方法（`loadInvalidatedEvidenceIds`/`loadInvalidatedBatchIds`/`loadInvalidatedAcceptanceIds` 等）已删除（grep 计数 0）。主源码 `mvn -o compile` 通过。
- **未完成（导致 RED）**：3 个测试文件仍按**旧构造签名** `new` 服务，test-compile 失败：
  1. `src/test/.../RdmDeliveryItemScopeGuardTest.java:76` — `RdmDeliveryItemService` 构造参数个数不符（新签名在 `RdmEvidenceInvalidationMapper` 之后**新增** `EvidenceValidityResolver` 参数）。
  2. `src/test/.../RdmAcceptanceDualPathTest.java:101` — 传入 `RdmEvidenceInvalidationMapper`，应为 `EvidenceValidityResolver`。
  3. `src/test/.../RdmTestRoundFreezeAndGateTest.java:99` — 同上。
- **缺失**：任务33 要求的**差分一致性测试**（证明解析器与三处消费点对同一输入输出一致）未写。

**接手第一步（恢复 GREEN）**：
1. 更新上述 3 处构造调用，补 `EvidenceValidityResolver`（mock 或用真实 `new EvidenceValidityResolver(evidenceInvalidationMapper)` 包裹同一 mocked mapper）。
2. 补差分一致性测试（对同一 `RdmEvidenceInvalidation` 集合，断言 `isTestPassed` / `hasProduct-BizAcceptancePassed` / `RdmDeliveryItemService` 状态回退三者判定一致）。
3. 跑 `mvn -o compile`、`mvn -o test-compile`、`mvn -o test -Dtest="Rdm*Test"`（应 ≥643 且 0F/0E）、全量 `mvn -o test`（应 ≥1360、Skipped≈7）。
4. 确认未弱化失效判定语义（范围变更后旧证据失效保留）。

> 若接手人判断该重构不值得保留，也可**安全回退**：恢复三处原私有过滤方法并删除 `EvidenceValidityResolver`（注意三处文件同时含任务22/27/29 等其它已验证改动，回退时**只**还原失效过滤相关片段，勿整文件回滚到 f82b02ab，否则会丢失任务22/27/28/29/31 的工作）。

---

## 4. 剩余待办任务（依赖链：33 → 24 → 25；14 可并入 25）

### 任务33（收尾，见 §3）
抽取共享 EvidenceValidityResolver + 差分测试，恢复 GREEN。

### 任务24 — 验证完整契约与升级回归门禁（blockedBy 33）
1. **后端上线**：`restart-service.sh --rebuild` 使全部第三四批代码进测试库，验 ready=200、迁移 v3.2/v3.3 幂等复验无 ERROR。
2. **DB 门控集成**（用 `.env.local` 的 DB_URL）：D2 `@Version` 真实并发拒绝；D3 `executeOnce` 真实唯一约束并发回放/冲突；多人并发追加执行；`SchemaContractValidator` 活库列漂移检测；`uk_rdm_notify_dedupe`、`uk_rdm_flow_scope`、`uk_rdm_migration_active_req` 唯一约束并发兜底。注意并行多 `@SpringBootTest` 上下文可能触发 `socketTimeout=15000` 瞬时 `Communications link failure`（自捕获、非缺陷），建议串行或调高超时。
3. **全量回归**：后端 `mvn test`（≥1360+33 差分）、前端 `npm run verify`/全部门禁（791）。
4. **独立复核任务30 新页面**：StockMigration（主责确认/拒绝盲目回滚呈现/迁移项标注「未测试/未验收/未发布」）、GrayscaleConfig（仅管理员/默认关闭/双独立开关/HelpPopover/开启≠放开门禁）。
5. **升级回归**：V1/V2 不受影响、V3 不误入旧接口。
6. 收尾抽取项确认：EvidenceValidityResolver 已统一（本任务前置）。

### 任务25 — 真实角色浏览器闭环 + 收尾（blockedBy 24）
- **可见浏览器窗口**按真实角色（PM/产品/业务/QA/发布负责人/管理员）走完整故事：分批交付→冻结测试→多人执行→A/B 验收→延期承接→发布硬门禁→紧急补验→灰度开启→下钻/待办/催办/报表/迁移预览确认。
- 补做**任务14**（第二批修复后真实浏览器复测，此前取消、无通过证据）。
- 浏览器注意：`visibilityState=hidden` 致截图/click/fill 超时、统计卡动画停 0 不一定是数据错误；需可见窗口；部分新 UI 硬刷新才显示。
- **清理**：删除临时验证目录 `.ben-verify/ .adam-verify/ .peter-verify/ .sean-verify/ .grant-verify/`（均已被 `.gitignore` 的 `.*-verify/` 忽略）；停止本轮临时进程；**保留业务审计与历史事实，不得删历史来"清理测试"**。

---

## 5. 关键契约与签名（接手直接消费，勿重复发明）

- **原子幂等**：`RdmIdempotentService.executeOnce(IdempotentKey, Supplier<T>, Class<T>)`；`bindingRequestId`=SHA-256(userId|bizType|resourceKey|clientRequestId)→request_id（复用 uk_request_id）；`normalizeClientRequestId` 为 client_request_id(VARCHAR64 ascii) 唯一中心兜底（>64 或非可打印 ASCII→sha256Hex）；public 幂等入口无 @Transactional + doXxx @Transactional。
- **问题阻断**：`RdmIssueService.hasBlockingOpenIssue(Long deliveryItemId)` / `hasBlockingOpenIssueByReq(Long reqId)`（severity∈{critical,major} 且未关闭 且无已批准延期）。
- **工作日**：`RdmWorkingDayCalculator.addWorkingDays/workingDaysBetween/overdueWorkingDays(start,n,userId)`（真实日历：请假/周末支援/按人例外）。
- **开放事实**：`RdmAcceptanceRecordService.isOpenFactEstablished(itemId)` 委派 `RdmOpenFactService`（open attempt opened + deployment.openStatus=opened + 批次 released + 快照含 item + 无更晚 rollback；rollback 后回 false）。
- **发布动作码（allowedActions，前后端逐字一致）**：`view, add_item, apply, decide, deploy, verify, open, rollback, exemption_apply, exemption_decide, supplementary_complete`；推进码受灰度门控（未开启不下发），`rollback` 止损例外仍下发；decide/exemption_decide 四眼（非申请人、真实成员、无 admin/canSeeAll 直通）。
- **灰度**：`rdm_flow_config` scope_key 非空唯一（GLOBAL / PROJECT:<id>）；`isV3ReleaseEnabled` 两级、GLOBAL 熔断优先、默认关闭；管理写接口 `RdmFlowConfigService`（仅管理员、审计写 sys_permission_audit_log、同事务）。
- **迁移**：`RdmStockMigrationService` 预览只读/主责确认/小批/暂停/对账/拒绝盲目回滚（有新 V3 事实→拒绝+自动暂停+前滚）/逆向只封存不删除；**绝不伪造**测试/验收/签字/评分/上线证据；迁移项 source=stock_migration、DI_PREPARING。
- **汇总/导出/对账**：`RdmProjectFactService`（唯一权威事实源）`exportBundle/reconcile/itemFacts/todoBoard/cards/projectFactPage`；HTTP `GET /api/rdm/project/export-bundle|reconciliation|{id}/item-facts|{id}/todo-board|stats|{id}/urge`。
- **通知去重**：dedupe_key=SHA-256(objectType|objectId|eventVersion|receiverUserId)，fail-closed（不全→不发、不群发）；eventVersion=`VERSION:<并发版本>` 或 `DATE:<提醒日>`；fallback 不绕过 dry-run。
- **枚举权威值**：acceptanceType product/business；stage pre_release/post_release；conclusion pass/fail/conditional；decision approved/rejected；issue source test/acceptance/online/other；dueAt=YYYY-MM-DD；release checkType test/acceptance/defect/dependency/scope；*Json 字段为 JSON 字符串。
- **前端已知小项**：`RdmTodoNotifyResult` 契约层只声明 3 字段，页面层用 additive `UrgeNotifyResult`（ProjectDetail）展示完整 10 字段；如需沉淀到契约层属契约变更需复验。

---

## 6. 安全约束（接手不得弱化/绕过）

1. 安全>正确性>可维护性>性能>风格；不确定默认拒绝、先问。
2. 管理员**无**代签/自批豁免；四眼（产品≠业务签署人、申请人≠审批人）；签署类守卫无 admin 直通。
3. 先封发布旁路→证据闭环→默认关闭的项目灰度开放；不弱化 `ensureReleaseDisabledForV3`；开启灰度≠放开发布门禁。
4. 身份取认证主体；allowedActions 只供 UI，后端独立重鉴权；不信任前端传入 userId/role/status/scopeVersion/bizDecisionRequired。
5. 冻结范围不被 PATCH 绕过；范围变更失效旧证据但保留历史；无有效测试事实不得推导通过；唯一用例按交付项+稳定 caseId 统计；同轮 fail 不被他人 pass 覆盖。
6. 存量迁移不补造证据；有新 V3 事实不盲目回滚（暂停+前滚）。
7. 不改批准计划；不提交生产/不部署/不自动批量迁移生产数据；测试通知不发真实外部收件人（守 dry-run）。
8. 共享文件（RdmAccessGuard/RdmConstants/RdmFlowVersionGuard/MyBatisPlusConfig）串行维护、只追加不重排；不改共享 MyBatisPlusConfig 拦截器。

---

## 7. 验证命令速查

```bash
# 后端离线（不触库、不重启）
export JAVA_HOME=.../temurin-17.jdk/Contents/Home; cd backend
/Users/yangjingjing/apache-maven-3.9.6/bin/mvn -o compile
/Users/yangjingjing/apache-maven-3.9.6/bin/mvn -o test-compile
/Users/yangjingjing/apache-maven-3.9.6/bin/mvn -o test -Dtest="Rdm*Test"   # 基线643（33收尾后应≥643）
/Users/yangjingjing/apache-maven-3.9.6/bin/mvn -o test                      # 基线1360，Skipped≈7
# 前端
cd /Users/yangjingjing/Desktop/SRAS
npm run typecheck && npm run lint && npm run test:run    # 基线791
npm run check:stat-order && npm run check:confirm-modal && npm run secret-scan
# DB 门控（仅任务24）：set -a; . backend/.env.local; set +a; 再 mvn -o -Dtest=<IT> test
# 后端上线（任务24）：cd backend && bash restart-service.sh --rebuild  # 验 ready=200
```
> `mvn -o compile` 报 "Nothing to compile" 为弱信号，需独立全量 javac 交叉验证；**切勿 `mvn clean`**。IDE(JDT) 对 MyBatis-Plus 泛型重载常误报，以 javac/mvn 为准。

---

## 8. Git 状态与提交建议

- HEAD=`f82b02ab`（含到任务21 + 交接文档 v1）。**任务22/23/27/28/29/30/31/32/33 全部未提交**。
- 因任务33 当前 RED，**不建议此刻整体提交**；建议先完成任务33 收尾恢复 GREEN，再按域分批提交（RDM 后端 / RDM 前端 / 考勤 i18n 分开），提交前跑 §7 全部门禁（仓库无 pre-commit 钩子，门禁靠主动执行）。
- 提交信息用 Conventional Commits 中文风格。`.gitignore` 已含 `.*-verify/`（验证临时产物不入库）。

---

## 9. 任务板快照（交接时）

| ID | 任务 | 状态 |
|---|---|---|
| 1–13 | 第一、二批代码 | 完成 |
| 14 | 第二批浏览器复测 | **待补做**（并入25） |
| 15/16/17 | 核实/测试库授权 | 完成 |
| 18/26/19/20/21/27/28/22/29/31 | 后端第三四批 | **完成+已验证** |
| 23/32/30 | 前端第三四批 | **完成+已验证** |
| 33 | EvidenceValidityResolver 抽取 | **进行中·RED**（§3，接手第一步） |
| 24 | 集成/回归验证门 | 待开始（blockedBy 33） |
| 25 | 浏览器闭环+收尾 | 待开始（blockedBy 24） |

## 10. 接手第一步清单
1. 修 §3 的 3 处测试构造 + 补差分测试 → 恢复后端 GREEN（643/1360）。
2. 按 §4 推进 24 → 25（含 14）。
3. 每步离线门禁先行；集成/浏览器阶段才 `--rebuild` 上线并验 ready=200。
4. 严守 §6；共享文件串行；不改批准计划；不提交生产/不部署。
5. 收尾清理 §4 临时目录，保留历史与审计。

---

## 11. 任务33 收尾结果与一次菜单登记缺陷修复（2026-10-16 追加）

**任务33 已完成并验证 GREEN**：
- 三处测试构造改为注入真实 `new EvidenceValidityResolver(mockMapper)`（包同一 mock，桩数据口径不变）；
- 新增 `RdmEvidenceValidityResolverTest`（15 例）：以「失效登记表 + Wrapper 等值条件」在测试内复现数据库过滤，
  期望值由**独立手算 oracle** 给出，断言解析器与测试门禁 / 验收门禁 / 交付项状态推导四点一致；
  纯单测环境需静态注册 `TableInfo` 才能物化 `LambdaQueryWrapper` 条件（`getSqlSegment()` 触发）；
- **变异验证**（证明非空跑）：删 `evidenceType` 条件 → 6 例失败；删 `deliveryItemId` 条件 → 6 例失败；已还原；
- 语义未弱化：失效登记仍**只读过滤、不删除**（`evidenceInvalidationMapper` 仅 `insert` 一处写入）；
- 门禁：`mvn -o test-compile` GREEN；`Rdm*Test` **658**（643+15）0F/0E；后端全量 **1393** 绿 / Skipped 7。

**用户实测反馈的缺陷（不是「未开发」）**：`項目總覽 / 測試工作台 / 發布中心` 三个菜单点击提示「該功能模塊開發中，敬請期待」。
- 根因：页面与路由早已交付（`src/pages/Rdm/{ProjectOverview,TestWorkbench,ReleaseCenter}.tsx` + `App.tsx` 路由），
  但 `RdmMenuInitializer` 种子的 `rdm-dashboard-project / rdm-delivery-test / rdm-delivery-release` **未登记进前端真值表**；
  `Sidebar.handleMenuClick` 只查 `keyToPath`，查不到就落到开发中兜底提示。
- 门禁盲区：`check-menu-consistency.mjs` 只解析 `ensureMenu(...)` 形式的域初始化器，数组式 `String[][] MENUS` 种子完全未覆盖，故当时 CI 全绿。
- 修复（纯前端登记，无后端/DB 变更）：
  1. `menuDataSource.keyToPath` += 3 条；`pathToKey` += 7 条子页归属（按后端 `@RequirePermission` 锚点：
     `/rdm-project-detail`→project、`/rdm-test-detail`、`/rdm-issue`→test、`/rdm-release-detail`、`/rdm-grayscale`→release、
     `/rdm-delivery-item`→delivery-board、`/rdm-stock-migration`→rdm-delivery）；
  2. `Permission/types.ts`：`MENU_ACTIONS_MAP`（与后端 `VIEW_EXPORT`/`DELIVERY_ACTIONS` 逐字一致）、
     `CONTROLLED_MENU_KEYS`、`ROUTE_MENU_KEY_MAP` 同步补齐 —— 此前这三个路由**不受路由守卫保护**；
  3. `check-menu-consistency.mjs` 新增数组式种子解析（校验 5/6，现覆盖 22 条）；
  4. `Sidebar.test.tsx` 新增 9 例回归（真值表完整 / 点击进页面不误报 / 未授权 403）。
- 验证：`typecheck`、`lint`（0 error）、`check:menu`、`stat-order`、`confirm-modal`、`check:i18n`、`secret-scan` 全通过；
  前端 `test:run` **792 passed**（= 基线 791 + 新增 9），仅 `Recommend/AlgorithmAdd.traffic`、`TrafficAlgorithmConfig`
  两文件 8 例在本机 **60s 超时**（单跑该两文件 89/89 通过，与本次改动无关）。→ **任务25 执行浏览器闭环时，前端门禁必须串行单跑，不要与后端 `mvn test` 并行**，否则该两文件会假失败。

---

## 12. V3 三菜单 UI 规范对齐 + 新增表单弹窗拆独立页（2026-10-16 续）

### 12.1 列表页 UI 合规（§E/§B 系列）

用户截图反馈的版式问题与修复（均已自测通过）：

| 页面 | 违规 | 修复 |
|---|---|---|
| 項目總覽 | 自造 `div.search-fields` 拿不到 `.search-section .ant-form-inline` 的 4 列 grid → 搜索区退化成竖排单列 | 改回标准 `Form layout="inline"` + `Form.Item` |
| 項目總覽 | 3 张统计卡被 `repeat(items.length,1fr)` 拉满整行 | `StatCards` 新增可选 `columns`，本页传 4（不改默认值，不冲击其它页面） |
| 項目總覽 | 导出/新增左右位置颠倒、导出未用 `.btn-export` | 导出/迁移/灰度/下鑽 chip 移左，新增 + 字段设置移右 |
| 項目總覽 | 缺列配置；操作列「更多」带 `DownOutlined` 图标 | 接 `useColumnConfig`；去图标 |
| 測試工作台 / 發布中心 | 各写一套 `Row/Col + Statistic + 28px 自定义色卡`（§B.7 旧式静态卡） | 统一改 `StatCards`（含 `AnimatedNumber` 计数动画 + hover）；`statCard.ts` 按已登记色值补 `danger` |
| 測試工作台 | 搜索区内联写死 grid（gap 写反） | 删内联，走全局 `.search-section` |
| 發布中心 | 搜索控件内联写死 `width:180/140/160/240` | 删内联，由全局给 100% |
| 三页 | 缺列配置 / pageSize 变更未回第 1 页 / 測試工作台缺 `pageSizeOptions` | 接 `useColumnConfig`；`onChange` 改「改页长回第 1 页」 |
| 測試批次詳情 | 執行摘要 7 张 `Row/Col + Statistic` 旧式卡 | 改 `StatCards(columns=4)`，通過率圆盘作为附属读数并列；内表分页补三件套 |
| V3 灰度管理 | 用 antd `Card size="small" title=...` 做模块分组（§B.6/§9.1 禁止） | 改模块标准 `.rdm-card` + `.rdm-card-title` + `.rdm-icon-block`（与 ProjectDetail 同口径） |

### 12.2 §9.1：新增表单弹窗 → 独立页

- 新建 `src/pages/Rdm/TestBatchSubmit.tsx`（`/rdm-test-submit`）与 `ReleaseBatchCreate.tsx`（`/rdm-release-create`）：
  统一 `RdmFormHeader` + `.rdm-form-section` 模块卡 + `.form-footer`；表单校验通过才调 API（§B.3）。
- 两个列表页的 `<Modal>` 及其 state/handler 已删除，按钮改 `navigate`。
- **顺带修正**：測試負責人/執行人/發布負責人由「手填用户 ID」改为员工远程搜索下拉（`RemoteSearchSelect` + `fetchEmployeeIdOptions`，值取 `sys_user.id`），
  姓名由下拉 label 带出，不再手填；`fetchEmployeeIdOptions` 提取到 `src/api/employee.ts` 共用（保留「不能用 fetchEmployeeOptions，其 value 是工号」这条坑注释）。
- 登记：`App.tsx` 两条 lazy 路由；`menuDataSource.pathToKey` 与 `Permission/types.ts.ROUTE_MENU_KEY_MAP` 各补 2 条（锚点=父菜单，不扩权）。
- 回归：`RdmV3FormPages.test.tsx` 7 例（路由跳转不弹 Modal / 必填未齐不调接口 / 页面形态）。

### 12.3 本轮验证

`typecheck` 0 error；`eslint` 0 error；`check:menu`、`check:stat-order`(142 页)、`check:confirm-modal`(236 处)、`check:i18n`、`secret-scan` 全通过；
`vitest src/pages/Rdm` **9 files / 54 tests 全绿**；全量 `npm run verify` 收尾重跑（上一轮仅 `AssetManagement/assetParameters.test.tsx` 1 例因机器负载超时，单独复跑 5/5 通过）。

### 12.4 未做（已登记，需另行决策）

1. **§D.4 详情页「最后更新人」footer**：`TestBatchDetail/ReleaseBatchDetail/IssueDetail` 的 VO 只有 `updatedAt`、**没有更新人字段**，
   补齐需后端 VO + 查询改动（属后端契约变更），不做半截方案。
2. **§H i18n**：RDM 全域文案仍硬编码繁体；`check-i18n-coverage.py` 的 DOMAINS 未含 rdm，门禁不拦；
   属已知「RDM 模块整体 i18n」独立批次，不宜零散替换。
3. **§D.1 头部组件**：RDM 七个详情/表单页统一用模块自有的 `RdmFormHeader`（橙色渐变，含 badge/right 槽），
   未改用全局 `DetailPageHeader`（紫色渐变）——模块内已有统一实现，替换属纯样式迁移，收益低、回归面大，暂不切。
4. **动作类 Modal 保留**：退回/復測/記錄部署/驗證/開放/回滾/裁決/延期/範圍變更等均为「动作+少量输入+二次确认」，
   与仓库既有约定一致（如采购订单明细 `ItemEditModal`），不在 §9.1 的实体新增范围内，保持不改。

