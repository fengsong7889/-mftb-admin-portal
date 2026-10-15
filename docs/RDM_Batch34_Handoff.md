# 产研交付系统（RDM）第三、四批改造 — 进度与交接说明

> 本文件为**交接文档**：记录当前进度、已完成并验证的成果、剩余待办任务的详细说明、关键契约签名、安全约束与验证方式，供接手人直接继续。
> 生成时间：2026-10-15。分支：`main`（HEAD=`3cc5693e`，与 origin/main 一致）。

---

## 0. 一句话现状

第三批（测试/验收/延期）后端业务闭环已基本落地到「延期承接」，**发布/紧急补验、第四批管理迁移、以及第三四批全部前端接线尚未完成**；剩余待办**不只是测试**，还包含大量后端与前端功能开发。详见 §4、§5。

- 批准计划文件（**不得修改**）：`/Users/yangjingjing/Library/Application Support/Qoder/SharedClientCache/cache/plans/RDM_Batch3-4_Release_Migration_aa05c26b.md`（状态：Executing）
- 原始规范：`/Users/yangjingjing/Desktop/SRAS/.qoder/plans/spec_22762caa.md`（§8.1 四批放行条件、§8.3 15 类验收场景、§8.4 灰度/可对账迁移/保留历史/兼容回滚）

---

## 1. 运行环境（接手前必读）

| 项 | 值 |
|---|---|
| 工作区 | `/Users/yangjingjing/Desktop/SRAS` |
| 后端根 | `/Users/yangjingjing/Desktop/SRAS/backend` |
| 数据库 | **用户已确认的独立测试库**，已授权结构迁移与测试数据写入；**非生产** |
| Java17 | `export JAVA_HOME=/Users/yangjingjing/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home`（默认 Java 25 不可用于本项目编译） |
| Maven | `/Users/yangjingjing/apache-maven-3.9.6/bin/mvn`（不在默认 PATH） |
| 运行中后端 | **PID 9557**，jar 模式，`target/mftb-admin.jar`（编译于 2026-10-15 14:48），端口 8080，`/api/health/ready`=200。**注意：该 jar 含到任务20为止的改动；任务21（延期承接）代码尚未重建进该 jar。** |
| 前端 | Vite dev，端口 3000，**Hash 路由**（非普通路径路由） |
| 重启规则 | 改 Java 源码后必须 `cd backend && bash restart-service.sh --rebuild`；禁止默认 `run-local.sh`；禁止手动 `kill -9` 端口；重启后必须验 `/api/health/ready`=200（不要用 captcha 端点当迁移就绪证据）。详见 `.qoder/rules/backend-restart.md`。 |
| 运行凭据 | `backend/.env.local`（DB_URL/DB_USERNAME/DB_PASSWORD/JWT_SECRET），已 gitignore，**禁止回显明文/写入版本控制文件** |

**API 约定**：REST 统一响应 `{code,message,data}`，成功 code=200，前端拦截器返回 data。新批次分页 `pageNo/pageSize` + `records/total`；旧需求分页 `page/size`。身份必须取认证主体 `SysUser.id`（不得把工号/姓名当数值用户 ID）。`scopeVersion`=业务范围版本，`version/expectedVersion`=并发乐观锁版本，**严禁混用**。

---

## 2. 已完成并**独立验证通过**的任务

| 任务 | 内容 | 验证证据 |
|---|---|---|
| **18** 统一数据契约与迁移基础 | 237/238 迁移 SQL（12 张新表 + 现有表补列）、`RdmBatch34Schema` 结构契约解析/校验类、catalog v3.0–v3.3 登记、`RdmSchemaMigrationInitializer` 接线；13 套 Entity+Mapper、现有实体补列、原子幂等 `executeOnce` 重构、DTO/VO 补 `requestId/expectedVersion`、`RdmConstants` 增量 | 离线：主源码 1453 + 测试 124 全量 javac 0 error；新增测试 18/18；Rdm*Test 160/160；全量离线套件 895 用例 0F/0E（Skipped 7=DB门控 Vehicle 测试） |
| **26** 测试库真实迁移与集成验证 | 在独立测试库 `--rebuild` 重启触发 v3.2/v3.3 迁移 | **D1 PASS**（237/238 真实落库 MySQL8：12 新表、STORED 生成列、CHECK/FK/唯一索引均 ENFORCED）；**D4 PASS**（活库结构契约 verify 45 项全就绪，两个独立 JVM 复现）；ready=200，0 ERROR；DB门控测试通道经 `VehicleConcurrencyIntegrationTest` 7/7 证明可用 |
| **19** V3 归属权限与范围版本保护 | V3 生命周期（create/selfSubmit/update/transition 白名单）、聚合需求不建执行项、任务归属 `deliveryItemId`、结构/依赖两端鉴权+并发防环、冻结后 PATCH 禁改范围/路径/状态、范围变更失效旧证据并被消费、身份与可见范围分离（`mine≠all`、`canSeeAll≠签署权`）、移除签署类守卫的 admin 代签直通 | 离线全量 922 用例 0F/0E（Skipped 7）；安全静态核对逐项 PASS；运行中服务未扰动 |
| **20** 多人测试与双路径验收 | 受理即冻结不可变轮次快照（范围/PRD/标准/构建/环境/用例集+mandatory）、多人追加执行、同轮 fail 不被 pass 掩盖、复测新轮旧轮只读、通过门禁按冻结唯一 caseId 统计（非记录数）、服务端权威 caseId 派生+fail-closed 映射、A/B 双路径验收、白名单校验、conditional 语义、最新适用证据+失效消费、四眼、评分独立、recordId 归属核对 | 离线全量 969 用例 0F/0E（Skipped 7）；A段/B段门禁静态核对逐项 PASS（含证据行号）；`ensureReleaseDisabledForV3` 未弱化 |

---

## 3. 已完成但**独立验证未走完**的任务（接手第一优先）

| 任务 | 状态 | 说明 |
|---|---|---|
| **21** 延期承接与问题解决闭环 | 代码完成，**独立验证被中断** | 开发工程师 Aaron 自报 `mvn -o compile`/`test-compile` EXIT=0、`Rdm*Test` **266 全绿**（新增 `RdmIssueServiceTest` 22 + `RdmWorkingDayCalculatorTest` 10）。首次验证者返回空报告无产物，二次验证被用户新指令取消。**接手后须重跑独立离线验证**（compile/test-compile/Rdm*Test=266/全量回归≈1001、门禁静态核对），通过后方可关闭并解锁任务27。验证要点见 §5 任务21。 |

Aaron 已交付内容（供验证与后续消费）：
- 新增 `service/RdmWorkingDayCalculator.java`（从 `RdmScheduleServiceImpl` 抽取的真实工作日公共能力，含请假/周末支援/按人例外）。
- 改 `RdmScheduleServiceImpl`（委托计算器，**构造函数新增第 12 参 `RdmWorkingDayCalculator`** —— 任何直接 `new` 它的测试须补参）。
- 重写 `RdmIssueService`：applyDefer 不立即解除严重缺陷阻断（仅 `approved`={pending_bind,effective} 才解除；rejected 回退 open）；bizDecisionRequired 服务端判定；申请人≠决定人、无 admin 代签、决定人取认证主体；bindFollowUp 数值 ID + 同项目/V3/已准入/交付写权限 + 唯一有效承接（DB `active_issue_id` 生成列 + `uk_rdm_followup_active_issue` 兜底）+ 双向来源用 `parentReqId`（**非** `structureParentReqId`）；resolveIssue 需修复证据+冻结 testRoundId+产品/业务验收 pass+承接+scopeVersion/buildId；cancel/merge/reassign 保留承接与历史；逾期按真实工作日升级 L1/L2/L3；8 个写操作接入 executeOnce。
- 改 `RdmIssueController`：`resolve` 带 body；新增 `POST /rdm/issue/bind`、`/{id}/cancel`、`/{id}/merge`、`/{id}/reassign`。
- **供任务27 消费的问题阻断契约**（准确签名）：
  - `boolean hasBlockingOpenIssue(Long deliveryItemId)`
  - `boolean hasBlockingOpenIssueByReq(Long reqId)`
  - `boolean hasBlockingIssues(Long deliveryItemId)`（既有名，委托 `hasBlockingOpenIssue`）
  - 口径：severity∈{critical,major} 且未关闭（非 resolved/cancelled/merged）且无「已批准」延期。
- **已知实现层歧义（非阻塞）**：`RdmIssue` 无「合并目标」专用列，merge 目标以 `impact` 追加不可变备注持久化（保留 sourceType/sourceId 溯源）；若后续需结构化列，须先扩契约（走迁移，不改已应用脚本）。

---

## 4. 关键契约与签名（接手直接消费，勿重复发明）

### 4.1 原子幂等（任务18）
```java
// service/RdmIdempotentService.java
<T> T executeOnce(IdempotentKey key, Supplier<T> businessAction, Class<T> resultType)
static String bindingRequestId(IdempotentKey key)   // SHA-256(userId|bizType|resourceKey|clientRequestId) 64位小写hex，复用 uk_request_id
String stableRequestHash(Object payload)            // 稳定序列化(字段/Map key 排序)后 SHA-256
// 旧 checkIdempotent/recordResult 保留并标 @Deprecated（当前无调用方）
```
- `IdempotentKey`（不可变+Builder，build 强校验）：`Long userId`(>0)、`String bizType/resourceKey/clientRequestId/requestHash`（非空白）。
- **事务边界**：executeOnce 自身即事务边界，**不得被包在活动事务里**。接入模式：public 幂等入口（无 `@Transactional`）+ 内部 `doXxx`（`@Transactional`，以 REQUIRED 加入 executeOnce 的写事务）。并发第二个请求 INSERT 撞 `uk_request_id` → `DuplicateKeyException` → 新只读事务重查：同 hash 且 completed→回放；hash 不同→CONFLICT；userId 不同→FORBIDDEN。业务异常整体回滚、不吞。
- 服务端派生天然幂等键（未改 DTO 契约）：如结构绑定 `structure_child:<childReqId>`、范围冻结 `freeze:scope_v<n>`、范围变更用**内容哈希**（避免版本已进导致重试双副作用）、测试执行 `exec:round{n}:{caseId}:{requestId}`、验收 `accept:{type}:{stage}:{判别子}`、延期/承接/解决见任务21。

### 4.2 迁移与结构契约（任务18/26，已落库）
- SQL 执行副本：`backend/src/main/resources/237_rdm_batch3_test_release.sql`、`238_rdm_batch4_migration.sql`（classpath 根加载）。**注意：237/238 仅在 resources 根，未放 `backend/sql/` 副本**（与 219/220 约定不一致，功能无碍，见 §7 技术债）。
- 版本键：`rdm:schema:v3.2`(237)、`rdm:schema:v3.3`(238)，已在 `catalog.json` 登记（executor=`rdmSchemaMigrationInitializer`，依赖链 v3.2→v3.1、v3.3→v3.2）。
- 12 张新表：`rdm_test_round`、`rdm_release_approval`、`rdm_release_attempt`、`rdm_release_exemption`、`rdm_release_exemption_decision`、`rdm_supplementary_verification`、`rdm_issue_followup`、`rdm_issue_resolution`（237）；`rdm_flow_config`、`rdm_migration_batch`、`rdm_migration_item`、`rdm_migration_audit`（238）。
- `rdm_flow_config`：灰度开关，`scope_key` 非空唯一（`GLOBAL` 或 `PROJECT:<数字ID>`），`v3_write_enabled`/`v3_release_enabled` 默认 **0（关闭）**；仅种子 1 条 GLOBAL，不自动开启项目。

### 4.3 测试/验收（任务20）
- 通过门禁：`RdmTestBatchService.isTestPassed(deliveryItemId)` —— 分母=冻结唯一 caseId + mandatory 全 pass；无有效冻结批次/无用例恒 false（**禁止从 QA 任务进度推导**）；消费 `RdmEvidenceInvalidation` 失效。
- 验收占位：`RdmAcceptanceRecordService.isOpenFactEstablished(Long deliveryItemId)` 当前 **protected 保守恒 false**；B 路径 post_release 业务验收门禁挂此方法。**任务27 实现发布/开放事实后应替换其返回逻辑（读真实开放事实），不改门禁编排。**
- 枚举权威值（**前后端必须一致，勿臆造**）：`acceptanceType`∈{product,business}；`stage`∈{pre_release,post_release}；`conclusion`∈{pass,fail,conditional}；`decision`∈{approved,rejected}；issue `sourceType`∈{test,acceptance,online,other}；延期 `dueAt`=`YYYY-MM-DD`；`conditionsJson/evidenceJson/*SnapshotJson` 均为 **JSON 字符串**（勿改对象）。

### 4.4 工作日能力（任务21）
```java
// service/RdmWorkingDayCalculator.java (@Component, 依赖 RdmWorkCalendarMapper)
LocalDate addWorkingDays(LocalDate start, int n, Long userId)
int workingDaysBetween(LocalDate from, LocalDate to, Long userId)
int overdueWorkingDays(LocalDate dueAt, LocalDate today, Long userId) // today<=dueAt 返 0
// 任务27 紧急补验「真实工作日期限」必须复用它，不得用简单周一至周五 cron
```

---

## 5. 剩余待办任务（详细说明 + 依赖 + 已知缺口）

> 依赖链：**21（验证收尾）→ 27 → 22 → 23 → 24 → 25**；任务14 为第二批遗留的浏览器复测，可并入 25 或独立补做。

### 任务27 — 完成发布硬门禁与紧急补验闭环（后端，blockedBy 21）
- **修复 `create→check→decide` 旁路**：`decideRelease`/每个动作都必须**重验硬门禁**（测试通过、按 A/B 路径的验收、`hasBlockingOpenIssue`=false、当前 scope/build 有效）并调用 V3 发布守卫；`applyRelease` 为真实门禁步骤。
- 审批快照 `RdmReleaseApproval` + `applicationSnapshotJson/approvalSnapshotJson` + 版本锁（`version/applicationVersion/expectedVersion`）。
- 部署/验证/**开放**为独立事实并**追加**（`RdmReleaseAttempt` append，不覆盖，**不得改已批准 buildId**）；追加回滚事实。
- 把任务20 的 `isOpenFactEstablished` 接**真实开放事实**（不改其门禁编排）。
- 四眼：申请人≠审批人、**管理员无自批**、`canSeeAll≠审批资格`。
- 紧急**仅产品补验**：`RdmSupplementaryVerification`（范围/构建/签署人/冻结期限/证据/逾期/版本）+ 独立批准（`RdmReleaseExemption`/`RdmReleaseExemptionDecision`）+ **真实工作日期限**（复用 `RdmWorkingDayCalculator`）+ 失败整改；**未验收不开放**。
- **灰度默认关闭**：`ensureReleaseDisabledForV3` 由「无条件阻断」演进为「仅当项目 `rdm_flow_config.v3_release_enabled=1` 且全部硬门禁通过才放行」；默认 GLOBAL 关闭、**不自动开启项目**（开启属任务22）。
- 已知历史缺口（研究结论）：现 `decide` 只判 checking+applicant 不重验门禁、`canSeeAll` 被误当审批资格与 admin 四眼豁免、部署可改批准后 buildId 且覆盖旧记录、验证通过直接 released 缺真实业务开放动作、缺批准快照/证据过期重验/追加回滚/紧急补验接口。

### 任务22 — 完成管理汇总、通知与安全迁移（后端，blockedBy 21,27）
- 统一两套统计/授权口径（`RdmSummaryService` 与 `RdmProjectService`）；修复：测试批次查询用集合条件并处理空集合（勿用 eq 处理 ID 集合）、不得混算历史验收、不得由任务状态推导测试/由交付状态推导验收、行级待裁决数与卡片口径一致、关闭项目≠交付完成、摘要/pending/checklist 补资源守卫、`mine` 不得因 null userId 变全量。
- PM 待办/催办通知：复用现有 outbox（事务内入队、提交后投递、领取互斥、失败重试、sending 超时回收），补**事件级唯一去重**（`rdm_notify_log` 已加 `dedupe_key` 唯一约束 + `object_type/object_id/event_version/receiver_user_id`，任务18 已建 `RdmNotifyLog` 实体）；修复入队失败 fallback 直接 sendOnce 可能绕过 dry-run 的问题。**测试通知不得发真实外部收件人，遵守既有 dry-run。**
- 统一报表与对账、项目下钻数据支撑。
- **存量迁移执行服务**（业务迁移留给本任务）：迁移批次/逐项预览/主责确认/执行前后版本与关联/结果审计（`rdm_migration_batch/item/audit`）；支持小批、暂停、**有新 V3 事实时拒绝盲目回滚**（不删证据/不删历史/不伪造测试验收签字评分上线证据）。
- **灰度管理**：项目级 `v3_write_enabled`/`v3_release_enabled` 开启/关闭能力（默认关闭）。

### 任务23 — 接通前端第三四批完整操作流程（前端，blockedBy 22）
> 前端页面多为第一二批所建，存在**真实缺口**，本任务补齐并接通后端新契约：
- `TestBatchDetail.tsx`：交付项选项当前用「数组位置+1」**伪造 ID**，必须改真实 `deliveryItemId`；接冻结轮次/多人执行/caseId。
- `IssueDetail.tsx`：`dueAt` 发送带时间值（应 `YYYY-MM-DD`）；决定发送 `approve/reject`（应 `approved/rejected`）；来源发送 `product_acceptance/biz_acceptance`（应 `test/acceptance/online/other`）；接延期承接/解决证据新端点（bind/cancel/merge/reassign）。
- `ReleaseBatchDetail.tsx`：发送错误 `approve/reject`；本地状态驱动按钮，未消费后端 `allowedActions` 与菜单权限交集。
- `AcceptanceList.tsx`/`AcceptanceForm.tsx`：V3 列表入口传 `deliveryItemId`，表单却忽略它仍调**旧整需求验收 API** —— 必须改走新批次验收（product/business、pre/post_release、conclusion、四眼、评分）。
- `ProjectOverview.tsx`：URL 不保留筛选/分页、负责人输入未进查询、只对当前页排序、三卡不可下钻、统计失败回零、暂停/恢复仅消息提示。
- `ProjectDetail.tsx`：返回丢失原查询条件；后端 actionUrl 使用未注册的 `/rdm/project/delivery` 路径，问题 ID 误套交付项地址。
- `RequirementList.tsx`/`Workbench.tsx`：todo 仍是旧状态集合缺「等待他人」、待办总数按分组直接相加存在重复、待补充从最近 6 条筛出非完整查询。
- `requirementExport.ts` 只导出已加载行（可复用 `weeklyReportExport.ts` 的 ExcelJS 多 Sheet 能力做全量项目报告）。
- **强制前端规范**（AGENTS.md + `.qoder/rules/frontend-ui-design-spec.md`）：列表页统计卡片必须在搜索区下方（`npm run check:stat-order`）；解释性长文本用 `HelpPopover` 非 `Tooltip`；`Modal.confirm` 须带 `custom-confirm-modal`（`npm run check:confirm-modal`）；i18n 同步；繁中文案；表单页遵循 `form-page-style.md`。前端验证：`npm run typecheck`、`npm run lint`、`npm run test:run`、上述门禁脚本。

### 任务24 — 验证完整契约与升级回归门禁（blockedBy 23）
- **DB 门控集成验证（用 `backend/.env.local` 的 DB_URL，测试库）**：D2 `@Version` 真实并发拒绝、D3 `executeOnce` 真实唯一约束并发回放/冲突、多人并发追加执行、`SchemaContractValidator.verify` 对活库列漂移检测。
- **抽取共享 `EvidenceValidityResolver`**：消除 `RdmDeliveryItemService`/`RdmTestBatchService`/`RdmAcceptanceRecordService` 三处重复的证据失效过滤逻辑（当前靠各自一致性测试对齐，存在漂移风险），补「三处并跑同输入断言输出一致」的差分测试。
- 升级回归门禁：V1/V2 不受影响、V3 不误入旧接口、共享层改动全量回归（`npm run verify` / `mvn test`）。
- 注意：并行跑多个 `@SpringBootTest` 上下文压本机 MySQL 可能触发 `socketTimeout=15000` 瞬时 `Communications link failure`（曾在 `TranslationDataInitializer` 出现、被自捕获、不影响 RDM 结论）；建议串行或调高该超时以避免误报。

### 任务25 — 完成真实角色浏览器闭环与收尾（blockedBy 24）
- **可见浏览器窗口**下按真实角色（PM/产品/业务/QA/发布负责人/管理员）走完整故事：分批交付、冻结测试、多人执行、A/B 验收、延期承接、发布硬门禁、紧急补验、灰度开启、下钻/待办/催办/报表/迁移预览确认。
- 补做**任务14**（第二批修复后真实浏览器复测，此前被取消，无通过证据）。
- 浏览器环境注意：`visibilityState=hidden` 会导致截图不可用/原生 click-fill 超时/rAF 暂停（统计卡动画停 0 不一定是数据错误）；需恢复可见窗口做真实交互；部分新 UI 硬刷新后才显示。
- **收尾清理**：删除临时验证产物目录 `.ben-verify/`（及可能存在的 `.neil-verify/`/`.owen-verify/`）；停止本轮临时进程；保留业务审计与历史事实（**不得删历史来"清理测试"**）。

---

## 6. 安全约束与既定决策（**接手不得弱化/绕过**）

1. 优先级：安全 > 正确性 > 可维护性 > 性能 > 风格。不确定默认拒绝、先问、不猜测放行。
2. **管理员无代签/自批豁免**；四眼：产品签署人≠业务签署人、申请人≠审批人。签署类守卫（requireProductAcceptor/requireBizAcceptor）无 admin 直通；管理岗守卫（协调/测试负责人/发布负责人/项目成员）保留 admin 查看/管理直通，但**管理≠签署/审批权**。
3. **先封发布旁路 → 再实现证据闭环 → 最后默认关闭的项目灰度开放**；不得先清空/弱化 `ensureReleaseDisabledForV3`。
4. 身份取认证主体 `SysUser.id`；`allowedActions` 只供 UI，后端每个写接口独立重鉴权；不信任前端传入的 userId/role/status/expectedVersion/scopeVersion/bizDecisionRequired。
5. 冻结范围不得被普通 PATCH 绕过；范围变更使关联测试/验收/发布证据失效但**保留历史**；无有效测试事实不得从 QA 任务 100% 推导通过；唯一用例按交付项+稳定 caseId 统计（非执行记录条数）；同轮失败不得被他人 pass 覆盖。
6. 原子幂等：业务前占位、绑定 userId/动作/资源/请求摘要、幂等结果与业务同事务、不吞全部异常、不用仅进程锁替代 DB 竞争保护、不强制旧 V1/V2 客户端新增必填参数。
7. 存量迁移**不补造**测试/验收/签字/评分/上线证据；产生 V3 新事实后不盲目恢复旧 flowVersion 或删关联（应暂停新写入/发布并兼容前滚）。
8. 不修改批准计划文件；不提交生产、不部署、不自动批量迁移生产数据；测试通知不发真实外部收件人（遵守 dry-run）。
9. 共享文件（`RdmAccessGuard`/`RdmConstants`/`RdmFlowVersionGuard`/`MyBatisPlusConfig`）集中串行维护，避免并行接口漂移；**不改共享 `MyBatisPlusConfig` 拦截器**（乐观锁插件已注册，顺序在分页之前，勿动）。

---

## 7. 已知技术债与观察项

- **证据失效过滤重复逻辑**（任务24 抽取 `EvidenceValidityResolver`）：见 §5 任务24。
- **237/238 SQL 放置约定不一致**：仅存于 `backend/src/main/resources/` 根，未按 219/220 约定在 `backend/sql/` 放参考副本（功能无碍）。
- **`@Deprecated` 旧幂等方法零调用方**：`checkIdempotent`/`recordResult` 向后兼容仅编译层成立、无测试覆盖。
- **merge 目标无专用列**：以 `impact` 备注持久化（§3）。
- **全局乐观锁拦截器**：`MyBatisPlusConfig` 的 `OptimisticLockerInnerInterceptor` 影响全应用所有 `updateById`（含 RdmProject/RdmDeliveryItem/EamLoss/Vehicle + 本轮 RdmTestBatch/RdmReleaseBatch/RdmIssue/RdmIssueDefer）；调整 InnerInterceptor 顺序需谨慎。
- 前端 `fetchEmployeeOptions` 返回工号，数值化会 NaN；发布负责人选项应使用 `fetchEmployees` 的数字 id（第二批已在 `ReleaseCenter.tsx` 局部修复，勿动其他模块共用的 `fetchEmployeeOptions`）。

---

## 8. 验证命令速查

```bash
# 后端离线（不触库、不重启服务）
export JAVA_HOME=/Users/yangjingjing/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home
cd backend
/Users/yangjingjing/apache-maven-3.9.6/bin/mvn -o compile
/Users/yangjingjing/apache-maven-3.9.6/bin/mvn -o test-compile
/Users/yangjingjing/apache-maven-3.9.6/bin/mvn -o test -Dtest="Rdm*Test" -DfailIfNoTests=false   # 期望 266（任务21后）
/Users/yangjingjing/apache-maven-3.9.6/bin/mvn -o test                                            # 全量离线，期望≈1001，Skipped 7=DB门控
# DB 门控集成测试（仅任务24，用测试库）： set -a; . ./.env.local; set +a; 再 mvn -o -Dtest=<IT> test

# 前端
cd /Users/yangjingjing/Desktop/SRAS
npm run typecheck && npm run lint && npm run test:run
npm run check:stat-order && npm run check:confirm-modal && npm run secret-scan

# 后端重启（改 Java 后；会触发迁移）
cd backend && bash restart-service.sh --rebuild   # 验 /api/health/ready=200
```
> 离线验证注意：`mvn -o compile` 常报 "Nothing to compile"（弱信号），需独立全量 javac 交叉验证；**切勿 `mvn clean`**（会删除运行中的 `target/mftb-admin.jar`）。IDE(JDT) 对 MyBatis-Plus `BaseMapper` 泛型重载常误报 ambiguous，以 `javac`(mvn) 结果为准；裸 `any()` 触发的重载歧义用 `any(XxxEntity.class)` 消除。

---

## 9. Git 状态与提交建议（重要）

- 当前 `main` 干净基线 HEAD=`3cc5693e`；工作区有 **155 个已跟踪修改 + 120 个未跟踪新增**，**0 staged**。
- 这些改动**混合了多个域**：本轮 RDM 第三四批（backend `com/mftb/admin/**` Rdm* + 237/238 SQL + 前端 `src/pages/Rdm/**`、`src/api/rdm.ts`、`src/constants/rdm.ts`），**以及此前批次和其他用户的改动**（会议/考勤/Vehicle/EAM/国际化/CI 等）。
- **提交建议**：不要 `git add -A` 一把梭（会扫入无关域与未验证代码）。按域分批提交，RDM 本轮建议范围：`backend/src/main/java/com/mftb/admin/**`（Rdm*/常量/迁移/DTO/entity/mapper/service/controller）、`backend/src/main/resources/23*.sql`、`backend/src/main/resources/db/migrations/catalog.json`、`backend/src/test/java/com/mftb/admin/**Rdm**`、`src/pages/Rdm/**`、`src/api/rdm.ts`、`src/constants/rdm.ts` 及相关测试。**提交前必须先跑 §8 门禁**（仓库 `.git/hooks` 无自动钩子，门禁靠主动执行）。
- 提交信息遵循 Conventional Commits 中文风格（如 `feat(rdm): 第三批延期承接与问题解决闭环`）。
- **本交接文档路径**：`docs/RDM_Batch34_Handoff.md`。

---

## 10. 任务板快照（交接时）

| ID | 任务 | 状态 | 依赖 |
|---|---|---|---|
| 1–13 | 第一、二批代码 | 已完成 | — |
| 14 | 第二批修复后真实浏览器复测 | **待补做**（此前取消，无通过证据） | 可并入 25 |
| 15/16/17 | 第三/四批执行前核实、隔离测试库授权 | 已完成 | — |
| 18 | 统一数据契约与迁移基础 | **已完成+已验证** | 15,16 |
| 26 | 测试库真实迁移与集成验证 | **已完成+已验证** | — |
| 19 | V3 归属权限与范围版本保护 | **已完成+已验证** | 18,26 |
| 20 | 多人测试与双路径验收 | **已完成+已验证** | 19 |
| 21 | 延期承接与问题解决闭环 | **代码完成，独立验证待重跑** | 19 |
| 27 | 发布硬门禁与紧急补验闭环 | 待开始 | 21 |
| 22 | 管理汇总/通知/安全迁移/灰度 | 待开始 | 21,27 |
| 23 | 前端第三四批完整操作流程 | 待开始 | 22 |
| 24 | 完整契约与升级回归门禁（含 DB 并发 D2/D3、抽取 EvidenceValidityResolver） | 待开始 | 23 |
| 25 | 真实角色浏览器闭环与收尾清理 | 待开始 | 24 |

---

## 11. 接手第一步建议

1. 重跑任务21 独立离线验证（§3、§5 任务21 要点）；通过后关闭任务21、解锁任务27。
2. 按 §5 顺序推进 27 → 22 → 23 → 24 → 25。
3. 每个后端任务：离线 compile/test-compile + Rdm*Test + 全量回归；到集成/浏览器阶段才在测试库 `--rebuild` 重启并验 `/api/health/ready`=200。
4. 严守 §6 安全约束；共享文件串行维护；不改批准计划；不提交生产、不部署。
5. 收尾按 §5 任务25 清理临时产物（`.ben-verify/` 等），保留历史与审计事实。
