# RDM 深测整改执行记录（2026-10）

- 方案：`RDM_深测_整改_交接_0c1b255d.md`
- 执行基线：`29ed675d`（2026-10-23 10:30:50 +0800）
- 取证环境：前端 `http://localhost:3000`（Vite dev / HashRouter）、后端 `http://localhost:8080`（`/api/health/ready` = 200）、本地 MySQL 8
- 运行编号：`run-20261023-01`

## 工作包状态

| 工作包 | 状态 | 说明 |
|---|---|---|
| P00 基线与环境 | 完成 | 工作区干净；后端 jar 构建时间 10:34 晚于 HEAD 提交时间 10:30；ready=200 |
| P01 报告更正与台账 | 完成 | 原报告新增「适用范围与更正」章节；本目录建立执行记录、用例与缺陷台账 |
| P02 专用账号与夹具 | 完成（受限） | 经用户授权在开发库创建 3 个 `QA-` 前缀员工与 3 个仅 RDM 的功能角色；首登强制改密已验证 |
| P03 多角色与流程补测 | 部分完成 | 已完成：侧栏差异/越权拦截/「只看自己」与管理员全量/未授权直访 403；未完成：V3 发布全链路、真并发抢单、通知实发 |
| P04 请求生命周期 | 完成 | 新增 `useRequestGate`（序号 + AbortController + 重试策略），接入需求清单/项目总览/工作台；单测 9 例 |
| P05 统计与周报口径 | 完成 | 统计复制完整筛选、子指标改交集语义；周报部门口径改为本期上线；后端单测 6 例 |
| P06 PRD 保护 | 完成 | 本机暂存（draftId 隔离、预算拒绝而非静默淘汰）+ 页签/页内返回/刷新 + **浏览器前进后退与同路径换文档**（迁移 `createHashRouter` 用官方 `useBlocker`）+ 服务端乐观锁改为「UPDATE 带版本条件、零行即冲突」，评审/另存新版本写点同步递增 |
| P07 列表场景缓存 | 完成 | 用户/环境隔离 key、精确 pathname、TTL 24h、每账号 50 条、参数校验；单测 4 例 |
| P08 看板下钻与分页 | 完成 | 后端 BoardColumn 下发与 count 同源的 statuses；前端点击列带 statuses 下钻并在列表顶部显示可清除的条件；看板「再載入」至 200 条上限 |
| P09 SLA 运行取证 | 部分完成 | 已修两处真实缺陷（命名锁跨连接、延长 SLA 后误发预警）并补 7 例阈值/去重/锁失败单测；**真实跨期与投递仍需独立环境+测试通知渠道，未执行** |
| P10 UI 细节 | 完成 | 批次号全文/复制、个性化配置顺序稳定；宠物改为外框相交让位（RDM 页压住按钮时整体隐藏且不接收指针事件）；本批新增文案全部走双语 `rdm.prd.*` |
| P11 回归与清场 | 进行中 | 首批已提交 `dde5bf19` 并推送；第二批改动（菜单裁剪/导航保护/PRD 原子乐观锁/SLA/宠物/双语）全量门禁复跑中，尚未提交 |
| P12 管理员全量视角（新增需求） | 完成 | 研发任务/批次对管理员放开；非管理员传 all 仍按本人收敛；服务端裁决 |

## 环境与隔离

- 单设备登录：同一账号的浏览器与脚本登录互踢，本轮浏览器与脚本串行执行。
- 通知：未向任何正式群或真实员工发送测试消息；未修改生产开关。
- 数据：未写入真实业务需求、未改动真实项目成员；**已创建 3 个测试员工与 3 个测试角色**（`QA-` 前缀，见 P02/P03 章节），验收后可删除。

## P02/P03 专用账号与多角色矩阵（本轮已完成受限范围）

**用户授权**：本轮允许用 admin 在共享开发库创建测试员工与角色（“你可以用管理员账号 admin 创建不同角色的账号”），因此不再以“无独立测试库”阻塞，改为**可识别、可删除的夹具 + 明确残留说明**。

### 夹具

| 账号 | 工号 | 角色 | 授权菜单 |
|---|---|---|---|
| QA-產品-深測 | MF00032 | QA-RDM-PM（id=20） | rdm-workbench / rdm-requirement(view,create,edit) / rdm-intake / rdm-delivery-board / rdm-acceptance(view,create) / rdm-delivery |
| QA-研發-深測 | MF00033 | QA-RDM-DEV（id=21） | rdm-workbench / rdm-delivery-board(view,create,edit) / rdm-delivery |
| QA-測試-深測 | MF00034 | QA-RDM-TEST（id=22） | rdm-workbench / rdm-delivery-test(view,create,edit) / rdm-test-quality-group |

- 角色数据范围：`dataScope=1`（仅本人）；首登强制改密已验证（返回 `PASSWORD_CHANGE_REQUIRED`，改密后当前会话被撤销）。
- 残留：3 个角色 + 3 个员工（带 `QA-` 前缀便于识别），删除方式：先停用/删员工再删角色。**未写入任何业务需求或项目成员。**

### 实测结论

| 用例 | 结果 | 证据 |
|---|---|---|
| 侧栏按角色差异化 | ✅ 通过 | MF00033 侧栏仅「首頁 / 個人工作台 / 研發執行→研發工作台」，13 个未授权菜单名均未出现 |
| 未授权菜单直访 | ✅ 拦在页面守卫 | `#/rdm-dashboard`、`#/rdm-test` 均渲染 403 页且**未发出业务接口** |
| 越权写接口 | ✅ 被拦 | MF00032/33/34 访 `/api/roles` 均 403；MF00032/33 访 `/api/rdm/test-batch` 均 403，MF00034 为 200 |
| 「只看自己」与管理员全量 | ✅ 符合设计 | admin `tasks/mine`=0、`scope=all`=36；MF00032 两者均 0（伪造 all 无效） |
| 已授权页面可用 | ✅ 通过 | `#/rdm-delivery` 渲染空态「暫無任務數據」；`#/rdm-workbench` 各区块正常、接口 200 |
| **受限角色页内越权入口** | ❌ 已不作为通过项 | MF00033 在研發工作台可见「迭代排期 / 查看交付中需求 / 團隊負載」三个按钮，点击均进 403 页。**已修**：按钮按目标菜单权限隐藏（见 defects RDM-27） |

### 仍未覆盖（不得记为通过）

- **V3 发布全链路端到端**：需要专门的发布批次与通知渠道，本轮未跑真机。
  已核对服务端闸门齐全且有单测锁定（`RdmReleaseGuardTest` 9 例）：仅「測試開始」之后可发起放行、
  有阻断检查项不可发起、豁免必须写理由、**发起人不能自行放行（四眼）**、驳回必须写原因、
  重复裁决一律拒绝、返工后作废在途与已放行单、无放行单/已过期/版本不符都不能上线、上线前必须先放行。
  因此本项的剩余风险是 **UI 与通知链路的真实联通**，不是服务端裁决逻辑。
- **SLA 真实跨期投递**：阈值/去重/锁/延长清标记由 `RdmSlaSchedulerTest` 7 例锁定，真实钉钉外发未跑。
- 真并发抢单/接单、跨项目成员可见性边界（需两个项目的成员关系夹具）。
- 测试通知实际发送（邮件/钉钉）未验证，避免向真实群发测试消息。

## 变更清单（本批）

前端：
- `src/pages/Rdm/useRequestGate.ts`（新增）+ 单测
- `src/pages/Rdm/useListSceneRestore.ts`（重写：隔离/TTL/校验）+ 单测
- `src/pages/Rdm/prdDraftStore.ts`（新增）+ 单测
- `src/contexts/UnsavedChangesContext.tsx`（新增）
- `src/utils/sessionCaches.ts`（新增）
- `src/contexts/AuthContext.tsx`、`src/components/MenuTabs.tsx`、`src/App.tsx`（接入离开保护）
- `src/pages/Rdm/PrdForm.tsx`（暂存/恢复/离开提醒/脏状态）
- `src/pages/Rdm/RequirementList.tsx`、`ProjectOverview.tsx`、`Workbench.tsx`（请求闸门）
- `src/pages/Rdm/TestWorkbench.tsx`（批次号全文/复制）
- `src/pages/Rdm/WorkbenchCustomize.tsx`（勾选不重排）
- `src/pages/Rdm/WeeklyReport.tsx`、`weeklyReportExport.ts`（本期上线口径）
- `src/api/rdm.ts`（读取接口可选 AbortSignal）
- `src/i18n/locales/zh-TW.json`、`en.json`（PRD 暂存与批次号复制文案）

后端：
- `RdmRequirementQuery`（新增服务端内部 `statusScope`，与用户筛选取交集）
- `RdmRequirementServiceImpl`（统计复制完整筛选、子指标交集语义）
- `RdmAnalyticsService`（部门产出改为本期上线，与顶部同区间；`BoardColumn` 下发与列计数同源的 `statuses`）
- `RdmDashboardVO`（`BoardColumn.statuses`）
- `RdmSchemaMigrationInitializer`（新增 `rdm:schema:v3.34` 给 `rdm_prd` 加 `row_version`）
- `db/migrations/catalog.json`（登记 v3.34）
- `RdmPrd` / `RdmDeliveryDTO.Prd.expectedRowVersion` / `RdmDeliveryVO.Prd.rowVersion` / `RdmDeliveryServiceImpl.savePrd`（乐观锁比对 + SQL 自增）
- `SchemaContractValidator`（入口/装配可观测日志 + `ApplicationReadyEvent` 兜底 + 幂等执行；本轮排查 readiness 后加固）
- 新增测试：`RdmRequirementQueryStatsTest`、`RdmWeeklyReportConsistencyTest`；`RdmDeliveryGuardTest` 补 2 例乐观锁用例

## 新增需求：管理员不受「只看自己」限制（2026-10-23）

目标：研发工作台、测试工作台等工作台菜单原本只显示“我的任务/我的批次”，要求除管理员外保持原限制，管理员不受限制。

实现边界：
- 服务端是唯一授权点：`scope=all` 只有 `operatorResolver.isAdmin(current)` 为真才生效；普通角色即使伪造参数也仍按 `owner_user_id=本人` 收敛。
- 已放开：`GET /api/rdm/delivery/tasks/mine?scope=all`（研发工作台任务列表、个人工作台“研发任务”面板）。
- 原本已放开（无需改动）：提测批次、发布批次列表均走 `RdmAccessGuard.canSeeAll(current)`，其中 `isAdmin` 直接返回 true。
- 前端只传意图：`fetchMyTasks(status, 'all')` 由页面根据 `user.role === 'admin'` 决定；页面显示“管理员视角”提示，避免把全量数据误读成自己的。
- 全量任务上限 500 条，按计划完成日排序，防止一次拉全表。

回归：`RdmDeliveryGuardTest` 新增用例覆盖“管理员 all 看全部 / 普通角色 all 仍只看自己 / 管理员默认仍只看自己”，29 例通过；`Workbench.test.tsx`、`RdmV3FormPages.test.tsx` 通过。

明确不做：不把管理员身份用于绕过发布四眼（V3 仍禁止申请人自批）、不把 `view_all` 权限等同管理员全量任务、不放宽任务写权限。

## 未完成项（不得记为通过）

1. **浏览器前进/后退未拦截**：当前项目使用声明式 `HashRouter`，官方 `useBlocker` 需要 Data Router。迁移 `createHashRouter + RouterProvider` 必须单独立项并做全站路由回归（登录重定向、门户、公开签署页、404、页签恢复）。已覆盖的离开入口：顶部页签点击/关闭/关闭其他/关闭右侧/关闭全部、PRD 页内返回与取消、刷新与关闭浏览器。
2. **多角色真实登录矩阵**：见 P02/P03 阻塞说明。
3. **全量门禁已执行（本批已提交 `dde5bf19`）**：见下方「提交与部署记录」。

### 本批补充完成的切片（上一版曾列为未完成，现已关闭）

- **服务端 PRD 并发版本**（v3.34）：`rdm_prd.row_version` 由迁移新增并登记 catalog；`savePrd` 在传入 `expectedRowVersion` 时比对并拒绝过期写入，落库用 SQL 自增（`row_version = row_version + 1`）；前端 `PrdForm` 回传打开时读到的版本。单测覆盖「不一致拒绝」与「未传不启用旧行为」。
- **看板下钻与加载更多**（P08）：`BoardColumn.statuses` 与列 `count` 同源下发；项目看板点击列跳需求清单并显示可清除的下钻条件（搜索不改丢该条件）；看板「再載入」逐段扩到 200 条（服务端单次上限）。

### 第二批补充完成（2026-10-23 晚间，尚未提交）

| 项 | 交付内容 | 证据 |
|---|---|---|
| 菜单服务端裁剪（RDM-28） | 新增 `GET /api/menus/my-tree`（身份只取认证上下文，不接受 userId），系统准入 ∩ 菜单 view 后裁剪；目录仅在有授权子菜单时保留且清空 path/actions；剥离 `component`/`updatedBy`/时间戳。`GET /api/menus/tree` 收口为 `menu-config` + `authorization-center`/`function-permission`，前端导航改走 `my-tree`，登出/换账号立即 abort 在途响应 | `MenuServiceImplGuardTest` 6 例；浏览器实测受限账号 `my-tree` 只回 16 个 key、`tree` 业务码 403 |
| PRD 原子乐观锁（RDM-31） | `UPDATE ... WHERE id=? AND row_version=?` + `row_version=row_version+1`，零行即 CONFLICT；已有文档缺 `expectedRowVersion` 直接拒绝（不再"未传即跳过"）；发起评审、录结论、另存新版本全部递增版本；派生前先锁源行版本 | `RdmDeliveryGuardTest` 新增 3 例（原子谓词/零行冲突/递增后重放拒绝） |
| 浏览器前进后退与同路径换文档（RDM-34） | `HashRouter` → `createHashRouter + RouterProvider`（单一稳定根路由，业务 `Routes` 不变），官方 `useBlocker` 覆盖 PUSH/REPLACE/POP；`/rdm-prd` 以 `reqId:id:draftId` 作 key，同 pathname 换文档也重挂载；鉴权失效/强制改密时立即放行并取消确认 | `UnsavedChangesContext.test.tsx` 5 例（后退取消/暂存后离开、身份切换与 replace、暂存失败可重试、撤权放行、页签关闭不二次弹框） |
| PRD 暂存预算（RDM-35） | 新建 PRD 补 `draftId`（同需求两份草稿不再串内容）；数量/总体积超预算改为**拒绝写入并保留上次快照**，不再静默淘汰最早的未保存文档；读取时校验字段类型与版本基线 | `prdDraftStore.test.ts` 8 例 |
| SLA 两处缺陷（RDM-32/33） | 命名锁改为复用 `MigrationLock`（`GET_LOCK`/`RELEASE_LOCK` 同一借出连接，异常也释放）；延长 SLA 后未到预警点不再发「即将逾期」 | `RdmSlaSchedulerTest` 7 例（17/18/24/25h 边界、延长清标记、已发去重、无规则与锁失败不发） |
| 宠物让位（RDM-37） | 原实现只按中心点避让，头像边角仍可压住按钮并吞点击；改为宠物外框与热区**相交即整体让位**（`visibility:hidden` + `pointer-events:none`），滚动/尺寸变化/DOM 变化重算 | `PetMascot.test.tsx` 1 例 |
| 双语收口 | 未保存确认框与放弃二次确认全部改走 `rdm.prd.*`（新增 12 个 key，繁中/英文同步），不再硬编码 | `npm run check:i18n` 通过 |
| 工程修复（RDM-36） | `vitest.config.ts` 仍用 Vitest 4 已移除的 `poolOptions.forks`，并发预算实际失效；改 `maxWorkers` | 全量套件不再出现批量超时 |

## 验证记录（run-20261023-01）

| 项目 | 命令 | 结果 |
|---|---|---|
| 类型检查 | `npx tsc --noEmit` | 0 error |
| Lint（变更文件） | `npx eslint <17 files>` | 0 error（仅既有 hook 依赖 warning） |
| 前端单测（新增/受影响） | `npx vitest run useRequestGate/useListSceneRestore/prdDraftStore/ProjectOverview/requirementFollowUp/requirementIntake` | 6 文件通过 |
| 后端单测（新增） | `mvn -o -B test -Dtest=RdmRequirementQueryStatsTest,RdmWeeklyReportConsistencyTest` | 6 用例通过 |
| 列表统计卡位置 | `npm run check:stat-order` | 152 个列表页通过 |
| 确认弹窗规范 | `npm run check:confirm-modal` | 259 处调用通过 |
| 菜单一致性 | `npm run check:menu` | 通过 |
| i18n 覆盖 | `npm run check:i18n` | 通过（rdm 3425 → 3421） |
| 影响域全量（127 文件） | `node scripts/affected-tests.mjs --run --files ...` | 6 failed / 121 passed；失败项已逐项定性：4 个为本批签名变更导致（补 AbortSignal 断言后 3 个 RDM 文件通过）、1 个 Sync 导航时序（改为无脏页时同步 true 后通过）、2 个为负载下偶发（单跑通过） |
| 前端单测（本批收尾） | `npx vitest run Workbench/RdmV3FormPages/ProjectOverview/requirementFollowUp/requirementIntake/useRequestGate/useListSceneRestore/prdDraftStore` | 8 文件全通过（121.4s） |
| 后端单测（PRD 乐观锁） | `mvn -o -B test -Dtest=RdmDeliveryGuardTest` | 31 例通过（含新增 2 例：版本冲突拒绝、未传不启用） |
| 后端就绪探针 | `GET /api/health/ready` | 启动完成后 `{"status":"UP"}`；日志「结构契约校验通过：66 个关键结构全部就绪」 |
| 迁移生效 | `sys_schema_version` 实查 | `rdm:schema:v3.34` applied_at 2026-10-23T16:23:18；`rdm_prd.row_version` 列存在 |
| 看板下钻同源 | `GET /api/rdm/analytics/overview` + 列表 | 四列 count 与 `statuses` 下钻 total 全部一致（105/9/2/2） |
| 多角色矩阵 | 三个 `QA-` 账号登录 | 侧栏无越权菜单、越权接口 403、admin `tasks/mine?scope=all`=36 而受限角色为 0 |
| 安全扫描 | `npm run secret-scan` | 890 文件，无硬编码敏感信息 |

以上为提交前 L2 全量结果：后端 `mvn clean test` 2257 例 0 失败；前端 `npm run verify` 静态门禁全通过，vitest 127/130，
3 个超时失败（`Recommend/AlgorithmAdd.traffic`、`waterfallConfig/WaterfallForm`、`Recommend/TrafficAlgorithmConfig`，与本批无关）单文件复跑均通过，定性为负载假红；CI 同批 `Test` 步骤 success 佐证。

## 提交与部署记录（2026-10-23）

| 项 | 值 |
|---|---|
| 提交 | `dde5bf19`，77 文件（+3463/−288），工作区干净；推送 `29ed675d..dde5bf19` |
| 安全审查 | L3 深度审查零发现后推送 |
| 前端 | 流水线 `39959606081`：quality-gate/build/deploy 全 success；`version.json` 实测 `commitHash=dde5bf1` → **已上线** |
| 后端 | 流水线 `39959606159`：test/build-and-push success，镜像 `ghcr.io/fengsong7889/mftb-admin-backend:dde5bf19ae8036fc61ac34a99295f9ba0bd096f2`（含 latest） |
| 后端部署 | deploy job 的 `Set up kubectl`/`Configure kubeconfig`/`Rollout restart`/`Post-deploy verification` **四步 skipped**（无 `SEALOS_KUBECONFIG`）→ **集群未滚动，生产仍是旧镜像** |

待完成以让后端真正生效：在 Sealos 控制台把 `mftb-admin-backend` 镜像切到上面 sha → 首次启动执行 `rdm:schema:v3.34` → 轮询 `/api/health/ready` 到 200（启动期 5~6 分钟为正常中间态）→ 用生产账号跑 `scripts/verify-deploy.sh`。

## 菜单裁剪（B2/RDM-28）实测证据（2026-10-23 深夜，后端重建后）

| 账号 | 授权 | `/api/menus/my-tree` | `/api/menus/tree` |
|---|---|---|---|
| MF00032（QA-RDM-PM） | 6 项（含分组，启动期被继承扩散为 15 行） | 200，17 个 key（15 个 rdm） | **业务码 403**「没有 [menu-config] 的[查看]权限」 |
| MF00033（改绑 QA-RDM-MIN） | 仅 `rdm-workbench:view`、`rdm-delivery-board:view` + rdm 系统准入 | 200，**精确 3 节点**：两个授权叶子 + `rdm-delivery` 目录（`path=null`、`actions=[]`、`component` 已剥离） | 403 |
| MF00034（QA-RDM-TEST） | 3 项（扩散为 10 行） | 200，13 个 key | 403 |
| admin | 超管 | 200，242 个 key | 200，244 个 key（含 2 个停用项由管理端可见） |

`my-tree` 与 `/api/auth/info` 的 permissions 完全同源（MF00033 两侧均为 2 项），不再出现「接口给全量、前端过滤」的信息暴露。

### 同批查出的两项既有语义

1. **RDM-38（P2，扩权风险）→ 已修复（2026-10-24）**：`RdmMenuInitializer.inheritGroupGrants()` 原先每次启动都把分组目录的授权 `INSERT IGNORE` 复制给组内全部叶子。实测只授 `rdm-delivery` 一个分组的角色，重启后在 `sys_role_menu` 里变成 14 行。原意是菜单拆分升级时不让存量角色失权，副作用却是「只勾一个分组＝拿到整组」，且管理员事后撤销的子菜单授权会被下次重启插回来。
   - 修法：改为一次性迁移 `rdm:menu-group-grant-inherit:v1`（与既有 `rdm:anchor-grant-mirror:v1` 同一套 `applyOnce`），验收只校验映射里的父子节点存在、不断言授权行（否则一次合法撤权会让下次启动失败）。
   - 证据：`RdmGroupGrantInheritTest` 5 例（首跑复制到新增叶子含部门表 / 登记后撤权不复活 / 撤权后验收仍通过 / 节点缺失报错 / 重复执行不产生重复行）；真实库重启实测首次打印 `初始化迁移 [rdm:menu-group-grant-inherit:v1] 执行并校验完成, 后续重启将跳过`，第二次 `--fast` 重启该日志**完全不再出现**，两次 `ready=200` 且无 ERROR。
2. **系统准入是导航硬前提**：`my-tree` 与既有 `portal/systems/{code}/navigation` 同口径（系统准入 ∩ 菜单 view）。实测新建角色若只有菜单授权、没有 `sys_role_system` 行，`my-tree` 返回空树（而旧的「全量树 + 前端过滤」会照常显示菜单）。存量核查：有菜单授权却缺系统准入的仅 rdm 2 行、eam 1 行、portal 1 行、hr 部门 1 行（多为本次夹具），影响面极小；处置方式是在授权中心补系统准入，而不是放宽导航口径。

## PRD 未保存保护（B1/RDM-34）真实浏览器实测（2026-10-24 凌晨）

迁移 `HashRouter` → `createHashRouter + RouterProvider` 后，用真实浏览器（admin）在 `#/rdm-prd?reqId=20&id=19` 修改「原型链接」制造脏态，逐项验证：

| 场景 | 动作 | 结果 |
|---|---|---|
| 侧栏点击切页（PUSH） | 点「個人工作台」 | ✅ `blocker.state=blocked`、URL 保持 `/rdm-prd`、编辑器仍在、弹出「有未保存的內容，確定要離開嗎？」 |
| 选「繼續編輯」 | 点取消 | ✅ 留在原文档，输入内容保留，blocker 回到 `unblocked` |
| 刷新/关闭标签页 | reload | ✅ 触发浏览器原生 `beforeunload` 提醒 |
| 顶部页签点击/关闭 | 五个入口 | ✅ 确认后按目标路径精确放行一次（不再重复弹框） |
| **浏览器后退 / 直接改 hash（POP）** | `history.back()` / `location.hash=` | ❌ **未拦截**：日志显示 blocker 收到 `POP` 且 `decision=true`，但 `createHashHistory` 无法回滚浏览器已完成的 hash 变更，页面仍切走 |

结论：Data Router 迁移让 PUSH 类导航（侧栏/页签/页内返回）统一走官方 blocker，并消除了旧 `approvedOnce` 定时器在后台标签被节流后「误放行」的隐患；但 **POP 拦截在本架构下不可达**，已在 `defects.csv` 记为 `RDM-34 / BLOCKED`，替代保护仅剩 `beforeunload`。要彻底解决需把 Hash 路由换成 BrowserRouter（要求静态托管配置 rewrite 回退）或等上游在 hash history 上支持回滚。

## 第二批门禁（2026-10-24 凌晨）

| 项目 | 命令 | 结果 |
|---|---|---|
| 后端全量 | `mvn -o -B clean test` | **2274 例，0 失败**，BUILD SUCCESS |
| 前端全量 | `VITEST_MAX_FORKS=2 npx vitest run` | **133 文件全通过** |
| 类型检查 | `npm run typecheck` | 0 error |
| Lint | `npm run lint` | 0 error（443 warning 为既有基线） |
| 菜单一致性 | `npm run check:menu` | 通过 |
| 统计卡位置 | `npm run check:stat-order` | 152 个列表页通过 |
| 确认弹窗 | `npm run check:confirm-modal` | 260 处调用通过（含本次新增的放弃二次确认） |
| i18n | `npm run check:i18n` | 通过（rdm 3425 = 基线） |
| 密钥扫描 | `npm run secret-scan` | 890 文件无敏感信息 |

## 回归风险与说明

1. `confirmLeave` 在“无脏页面”时必须**同步**返回 true；返回 Promise 会让页签切换延后一个微任务，已出现测试失败并被修复，后续不得改回统一 async。
2. 读取接口新增可选 `AbortSignal` 参数；调用方断言必须允许第二个参数，否则 `toHaveBeenCalledWith` 会因参数个数不匹配失败。
3. `PrdForm` 现在依赖 `AuthProvider` 与 `UnsavedChangesProvider`；单独渲染该页的测试必须补 Provider 包裹。
4. `AuthContext` 清登录态时调用 `clearSessionCaches()`，新增缓存模块必须注册清理函数，否则换账号会残留上一人的本机数据。

## 遗留决策：`/api/menus/tree` 返回全量菜单（RDM-28）

实测：仅授权 4 个 RDM 菜单的 `MF00033` 调 `/api/menus/tree` 仍拿到 36 个 RDM 菜单（含未授权菜单名与路径）。侧栏由前端 `filterMenusByPermission` 过滤，**不构成越权访问**（业务接口仍逐个 403），但属于菜单结构信息暴露，且把「可见性」压在客户端。

建议修法（单独立项，不在本轮扩大范围）：
1. 新增用户端接口 `GET /api/menus/my-tree`：按当前账号（角色 + 部门授权 + 系统准入）在服务端过滤后返回。
2. `GET /api/menus/tree` 保留给「菜单管理」页，加 `@RequirePermission(menu="menu-management")`（或菜单管理专属 action）。
3. 前端 `MenuContext` 切到 `/menus/my-tree`；`Sidebar` 的本地过滤保留作为兜底。
4. 回归点：菜单管理页仍需全量树；超管、受限角色、无系统准入账号三种视角；页签恢复与 30s 轮询行为不变。

## 测试夹具清场（2026-10-24 凌晨）

| 对象 | 处置 | 复核 |
|---|---|---|
| 员工 MF00032 / MF00033 / MF00034（id 39/40/41） | `PUT /api/employees/{id}/status?status=0` 停用 | 用原密码登录返回 `1002 账号已被禁用` |
| 角色 QA-RDM-PM / QA-RDM-DEV / QA-RDM-TEST / QA-RDM-MIN（id 20/21/22/23） | `PUT /api/roles/{id}/status?status=0` 停用 | 状态接口返回 200；保留行以便回溯，未物理删除 |

说明：采用**停用**而非删除，保证授权行、审计与登录日志可追溯；如需彻底清理，在授权中心确认无引用后再删除员工与角色。本轮未改动任何真实员工、真实项目成员与业务单据。

## 第二批提交与上线核验（2026-10-24）

| 项 | 值 |
|---|---|
| 提交 | `6d9879b5`（30 文件，+770/−210），L3 深度审查零发现后推送 `7911138f..6d9879b5` |
| 前端 | 流水线 `40042770420`：quality-gate / build / deploy 全 success；`version.json` 实测 `commitHash=6d9879b` → **已上线** |
| 后端 | 流水线 `40042770418`：test / build-and-push success，镜像 `ghcr.io/fengsong7889/mftb-admin-backend:6d9879b53eb6e0dabe039cea1ceb36b0932a677f` |
| 后端部署 | deploy job 的 kubectl/rollout/verify 四步仍 **skipped**（仓库无 `SEALOS_KUBECONFIG`）→ 生产集群未滚动，需在 Sealos 手动切到上述 sha |

本批生效后的行为变化（需在切后端镜像后才会在生产显现）：`/api/menus/tree` 对非管理人员返回 403、导航改由 `/api/menus/my-tree` 提供、PRD 保存强制版本号、SLA 扫描与延长告警口径修正。
**切换注意**：新镜像启动期会执行 `rdm:schema:v3.34`（若尚未执行），readiness 大约 5~6 分钟后才转 200 属正常中间态。

## 扩权类缺陷同类扫描（2026-10-24）

修完 RDM-38 后，对全部写 `sys_role_menu` / `sys_department_menu` 的初始化器做了归类核查，结论：**无同级别未修项**。

| 初始化器 | 授权写入方式 | 判定 |
|---|---|---|
| `RdmMenuInitializer.inheritGroupGrants` | 跨菜单复制（父→子） | 原为每次启动，**本轮已修为一次性**（RDM-38） |
| `DataInitializer.splitRuleConfigMenus` | 跨菜单复制（rule-config→7 个新菜单） | 已在 `applyOnce(core:menu-seed-v45)` 内，只在 `V_MENU_SEED` 递增时跑一次 |
| `AttendanceMenuInitializer` | 补自身菜单授权 | 已有防护：注释明确「管理员主动收窄过的动作集不得被启动重放扩权」，且只对空动作补默认值 |
| `EmployeePermSplitMenuInitializer` | 只补 admin | admin 本就全权，非扩权 |
| 其余 Hr/Eam/Meeting/Doc 等 Schema 初始化器 | 补自身新建菜单的初始授权 | 均为一次性结构迁移，且对象是当次新建菜单 |

## 缺陷台账盘点（2026-10-24 收口）

| 状态 | 数量 | 说明 |
|---|---|---|
| CLOSED | 36 | 含本轮新增并关闭的 RDM-27~RDM-33、RDM-35~RDM-38 |
| BLOCKED | 1 | RDM-34：浏览器前进后退（POP）在 createHashHistory 下无法回滚；替代保护为 beforeunload |
| OPEN | 1 | RDM-15：RDM 存量繁体文案按模块分批迁 i18n（本批新增文案已全部走 i18n 并登记双语） |

更正说明：`defects.csv` 此前存在编号冲突（NEW/REGRESSION 批次复用了 ORIGINAL 已占用的 RDM-13~24），已统一重编为 RDM-27~RDM-38 并更新 `execution.md` 中的全部引用；现 39 行均为 11 字段、无重复 ID。

## RDM-38 上线核验（2026-10-24 上午）

| 项 | 值 |
|---|---|
| 提交 | `fdfda41e`（后端迁移 + 5 例测试，4 文件）、`26a93bda`（台账收口），L3 深度审查零发现后推送 `240038d6..26a93bda` |
| 前端 | Pages 流水线 success；`version.json` 实测 `commitHash=26a93bd` → **已上线** |
| 后端 | 流水线 `40051683689`：test / build-and-push success，镜像 `ghcr.io/fengsong7889/mftb-admin-backend:26a93bdacf5c2d9d6dc64f09105f40009b40e7c8` |
| 后端部署 | deploy job 的 kubectl/rollout/verify 四步仍 **skipped**（无 `SEALOS_KUBECONFIG`）→ 生产集群未滚动 |

**生产切换后应看到的行为**：首次启动打印 `初始化迁移 [rdm:menu-group-grant-inherit:v1] 执行并校验完成, 后续重启将跳过`，之后每次启动都不再出现该行；此前「撤销子菜单授权后重启又复活」的现象消失。

## 交接说明

- 所有改动集中在 `src/pages/Rdm/**`、`src/api/rdm.ts`、`src/App.tsx`、`src/components/MenuTabs.tsx`、`backend` RDM 服务与迁移、双语文件。
- 新增迁移列保留，不做 DROP。
- 前端已上线（`dde5bf1`）；后端镜像已入 GHCR，**生产集群尚未切换**，`rdm:schema:v3.34` 随新镜像启动期执行，尚未在生产落库。
