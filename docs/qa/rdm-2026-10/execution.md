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
| P06 PRD 保护 | 完成 | 本机暂存 + 页签/页内返回/刷新离开提醒 + 服务端 `rdm_prd.row_version` 乐观锁（v3.34，写点递增、冲突拒绝）；仅浏览器前进/后退拦截未做（需 Data Router 迁移，单独立项） |
| P07 列表场景缓存 | 完成 | 用户/环境隔离 key、精确 pathname、TTL 24h、每账号 50 条、参数校验；单测 4 例 |
| P08 看板下钻与分页 | 完成 | 后端 BoardColumn 下发与 count 同源的 statuses；前端点击列带 statuses 下钻并在列表顶部显示可清除的条件；看板「再載入」至 200 条上限 |
| P09 SLA 运行取证 | 部分完成 | 机制存在性已确认（扫描/预警/升级/去重）；真实阈值跨期与投递未执行（需独立环境与测试渠道） |
| P10 UI 细节 | 部分完成 | 批次号全文/复制、个性化配置顺序稳定已做；宠物遮挡、双语全量收口未做 |
| P11 回归与清场 | 部分完成 | 类型检查、lint、5 道门禁通过；影响域测试见下；全量 verify/后端全量测试未执行（未提交） |
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
| **受限角色页内越权入口** | ❌ 已不作为通过项 | MF00033 在研發工作台可见「迭代排期 / 查看交付中需求 / 團隊負載」三个按钮，点击均进 403 页。**已修**：按钮按目标菜单权限隐藏（见 defects RDM-13） |

### 仍未覆盖（不得记为通过）

- V3 多交付项发布全链路（申请→测试闸门→四眼裁决→上线→验收）需要专门的发布批次与通知渠道，本轮未跑。
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
3. **全量门禁**：未执行 `npm run verify` 与后端全量 `mvn test`（本批未提交）。

### 本批补充完成的切片（上一版曾列为未完成，现已关闭）

- **服务端 PRD 并发版本**（v3.34）：`rdm_prd.row_version` 由迁移新增并登记 catalog；`savePrd` 在传入 `expectedRowVersion` 时比对并拒绝过期写入，落库用 SQL 自增（`row_version = row_version + 1`）；前端 `PrdForm` 回传打开时读到的版本。单测覆盖「不一致拒绝」与「未传不启用旧行为」。
- **看板下钻与加载更多**（P08）：`BoardColumn.statuses` 与列 `count` 同源下发；项目看板点击列跳需求清单并显示可清除的下钻条件（搜索不改丢该条件）；看板「再載入」逐段扩到 200 条（服务端单次上限）。

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

未执行：`npm run verify` 全量、后端全量 `mvn test`、生产构建与发布（本批未提交）。

## 回归风险与说明

1. `confirmLeave` 在“无脏页面”时必须**同步**返回 true；返回 Promise 会让页签切换延后一个微任务，已出现测试失败并被修复，后续不得改回统一 async。
2. 读取接口新增可选 `AbortSignal` 参数；调用方断言必须允许第二个参数，否则 `toHaveBeenCalledWith` 会因参数个数不匹配失败。
3. `PrdForm` 现在依赖 `AuthProvider` 与 `UnsavedChangesProvider`；单独渲染该页的测试必须补 Provider 包裹。
4. `AuthContext` 清登录态时调用 `clearSessionCaches()`，新增缓存模块必须注册清理函数，否则换账号会残留上一人的本机数据。

## 遗留决策：`/api/menus/tree` 返回全量菜单（RDM-14）

实测：仅授权 4 个 RDM 菜单的 `MF00033` 调 `/api/menus/tree` 仍拿到 36 个 RDM 菜单（含未授权菜单名与路径）。侧栏由前端 `filterMenusByPermission` 过滤，**不构成越权访问**（业务接口仍逐个 403），但属于菜单结构信息暴露，且把「可见性」压在客户端。

建议修法（单独立项，不在本轮扩大范围）：
1. 新增用户端接口 `GET /api/menus/my-tree`：按当前账号（角色 + 部门授权 + 系统准入）在服务端过滤后返回。
2. `GET /api/menus/tree` 保留给「菜单管理」页，加 `@RequirePermission(menu="menu-management")`（或菜单管理专属 action）。
3. 前端 `MenuContext` 切到 `/menus/my-tree`；`Sidebar` 的本地过滤保留作为兜底。
4. 回归点：菜单管理页仍需全量树；超管、受限角色、无系统准入账号三种视角；页签恢复与 30s 轮询行为不变。

## 交接说明

- 所有改动集中在 `src/pages/Rdm/**`、`src/api/rdm.ts`、`src/App.tsx`、`src/components/MenuTabs.tsx`、`backend` RDM 服务与迁移、双语文件。
- 新增迁移列保留，不做 DROP。
- 生产发布与数据库变更未执行。
