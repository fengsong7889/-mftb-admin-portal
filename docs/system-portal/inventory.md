# 统一门户 · 分系统改造 · 归属清单（阶段 A 产出）

> 本清单是「统一门户 + 分系统权限」改造的**唯一归属真值**，后端 `sys_menu.system_code` 种子、前端门户卡片、后续 `PermissionAspect` 系统准入判定都以此为准。所有变更必须同步更新此文档与 `backend/.../SystemCode.java`。
>
> 版本：v1（2026-09）
> 关联方案：`统一门户_分系统_权限改造_bcdcf6bc.md`

---

## 1. 系统清单（18 个业务系统 + 1 个公共入口）

> **命名规范（2026-10 统一）**：中文显示名一律「4字域名 + 系統」= 6 字，全部以「系統」结尾。
> 不再混用「中心 / 工作台 / 配置」——那类后缀属菜单级语义，会把独立系统降级成菜单。
> 真值唯一定义处：`SystemPortalSchemaInitializer#seedSystems()`（每次启动幂等刷回 `sys_system`），
> 必须逐字等于 `src/i18n/locales/zh-TW.json` 与 `en.json` 的 `portal.systems.<key>`。

| SystemCode | 中文显示 | 英文名 | 图标 key | 排序 | 说明 |
|---|---|---|---|---|---|
| `ads` | 廣告推薦系統 | Advertising & Recommendations | `AimOutlined` | 10 | 广告销售 / 商家推广 / 团购秒杀（店铺随心推已迁出） |
| `merchant` | 商戶運營系統 | Merchant Operations | `ShopOutlined` | 20 | 商户集团、门店、门店数据、地图规划（内部 BD/运营侧） |
| `seller` | 店鋪經營系統 | Store Operations | `ShopOutlined` | 25 | 店铺随心推购买入口与推广报表（商家自助侧，v199 从 ads 拆出） |
| `search` | 搜索運營系統 | Search Operations | `SearchOutlined` | 30 | 搜索词库、引导、策略、校验、报表 |
| `finance` | 財務結算系統 | Finance & Settlement | `AccountBookOutlined` | 40 | 账户余额、批次、明细、对账、审批中心 |
| `ai` | 人工智能系統 | Artificial Intelligence | `RobotOutlined` | 50 | 模型、配额、授权、MCP、审计、能耗 |
| `organization` | 組織編制系統 | Organization & Headcount | `ApartmentOutlined` | 55 | 法人主體、管理組織、職位職級、崗位編制（v289 从 hr 拆出独立系统，先交付法人/組織兩頁） |
| `payroll` | 薪酬福利系統 | Payroll & Benefits | `MoneyCollectOutlined` | 62 | 薪酬項目、薪酬標準（定調薪）、核算批次與工資單（v297 新建，本批只交付前兩頁） |
| `hr` | 人力資源系統 | Human Resources | `TeamOutlined` | 60 | 员工、组织、职位、员工动态 |
| `attendance` | 考勤假勤系統 | Workforce & Attendance | `ClockCircleOutlined` | 65 | 打卡/排班/班次/節假日/異常/請假額度/日報月報（v228 从 hr 拆出独立入口） |

> **v289（2026-10）新增 `organization`**：组织/编制是主数据治理面，与员工档案（人事管理）责任不同。**不得复用 `hr` 准入**——`org-center` / `hr-profile` 等旧 key 仍归 `hr`，新系统的 `hcm-org-legal` / `hcm-org-unit` 是全新 menu_key，否则「看人事档案」的人会自动获得「改法人/改编制」的写权。
| `eam` | 物資管理系統 | Asset Management | `InboxOutlined` | 70 | 资产、耗材、采购、库存、盘点 |
| `rdm` | 產研交付系統 | R&D Delivery | `ProjectOutlined` | 75 | 需求提交、审批、分配、研发交付、验收上线与产出看板（菜单已拍平为一级，无 rdm-center 目录） |
| `oa` | 流程審批系統 | Workflow Approval | `SolutionOutlined` | 80 | 流程中心、流程事项、审批配置、员工自助 |
| `meeting` | 會議管理系統 | Meeting Management | `VideoCameraOutlined` | 85 | 会议室档案、全员预约、参会人日程、钉钉邀约（v230 新增独立一级系统） |
| `doc` | 文檔中心系統 | Document Center | `CloudOutlined` | 87 | 騰訊文檔為內容中台：需求/人事/行政/制度/培訓文檔的統一索引、菜單門禁與查閱審計（doc:menu:v1.0 新增獨立一級系統） |
| `iam` | 權限管理系統 | Access Control | `SafetyCertificateOutlined` | 90 | 角色、功能授权、数据授权、菜单配置、账号安全 |
| `platform` | 平台支撐系統 | Platform Support | `SettingOutlined` | 100 | 通知渠道、规则中心、版本管理 |
| `i18n` | 翻譯管理系統 | Translation Management | `GlobalOutlined` | 110 | 翻译工作台、语言管理、导入导出、机翻引擎、翻译统计 |

**门户公共入口（不属于任一业务系统）：**

| 菜单 key | 归属 | 说明 |
|---|---|---|
| `home` | 保留 | 迁移为 `#/workbench`（个人工作台），任何登录用户可访问；不显示在门户卡片列表中，也不做系统准入判定 |

> `home` 的 `system_code = 'portal'`（哨兵值，与业务系统隔离），后端 `PermissionAspect` 见到 `system_code='portal'` 的接口时跳过系统准入判定，仅依赖既有登录态。

---

## 2. 顶级菜单 → 系统归属映射

来源：`backend/.../DataInitializer.java#seedSystemMenus` 顶级菜单段落，
以及 `SystemPortalSchemaInitializer#backfillTopLevelMenuSystem`（v45 起按「顶级菜单 → 系统」逐条登记）。

> **v45 结构变更：一级包装目录已全部退役。**
> `merchant_group` / `promotion_tool` / `seller-center` / `search` / `finance` / `ai-assistant` /
> `hr` / `asset-management` / `oa-center` / `permission` / `system-config` / `i18n-center` 这 12 个
> 「拆分业务系统前的壳」已从 `sys_menu` 物理删除，其子菜单提升为顶级。
> 原因：系统视图上线后侧边栏与 `/portal/systems/{code}/navigation` 完全按 `sys_menu.system_code` 裁剪，
> 这层壳没有任何运行时职责；过去靠前端 `Sidebar.SYSTEM_WRAPPER_KEYS` 硬编码展平来隐藏，
> 导致「菜单配置」里能看到、进入系统却根本不展示的幽灵一级目录。前端展平逻辑已同步删除。
> 退役清单的代码真值：`DataInitializer.RETIRED_SYSTEM_WRAPPERS`；
> 幂等自愈：`DataInitializer#retireSystemWrapperDirectories()`（每次启动）；
> 参考 SQL：`backend/sql/219_retire_system_wrapper_menus.sql`；
> 核验脚本：`python3 scripts/check-ghost-top-menus.py`（期望「幽灵一级目录 0 个」）。

| 现有顶级菜单 key | 中文 | 归属 SystemCode | 备注 |
|---|---|---|---|
| `home` | 首頁 | `portal`（公共） | 迁移为个人工作台 |
| ~~`merchant_group`~~ | 商戶集團管理 | `merchant` | **v45 已物理删除** — v45 已退役；子菜单 `merchant-group-list`（集團管理）、`store-list`（門店管理）提升为顶级 |
| `merchant_promotion` | 商家推廣工具 | `ads` |  |
| `promotion_tool` | 推廣通 | `ads` | v199 拆分后成为空壳目录，启用子项迁完后由启动自愈置 `status=0`；店铺随心推实际归属见下行 |
| `seller-center` | 商家工作台 | `seller` | v199 新增一级目录，承接 `promotion-sales-config`（購買入口）与 `promotion-report-group`（報表分析） |
| ~~`search`~~ | 搜索管理 | `search` | **v45 已物理删除** — v45 已退役；搜索配置/搜索引導/搜索詞庫/效果校驗/報表統計 提升为顶级 |
| ~~`finance`~~ | 財務管理 | `finance` | **v45 已物理删除** — v45 已退役；推廣金管理/商戶通對賬/審批管理 提升为顶级 |
| ~~`ai-assistant`~~ | 智能中心(AI) | `ai` | **v45 已物理删除** — v45 已退役；9 个 AI 菜单提升为顶级，归属锚点见 `SystemPortalSchemaInitializer.AI_TOP_LEVEL_MENUS` |
| `group-purchase` | 團購管理 | `ads` | 团购/秒杀归 ads（广告与推广） |
| ~~`hr`~~ | 集團人事(HR) | `hr` | **v45 已物理删除** — v45 已退役；員工檔案/入轉調離/基礎配置 提升为顶级 |
| ~~`asset-management`~~ | 物資管理 | `eam` | **v45 已物理删除** — v45 已退役；資產看板/耗材管理/資產運營/採購與供應/基礎數據 提升为顶级 |
| `rdm-dashboard` … `rdm-acceptance` | 需求總看板 / 需求工作台 / 提交需求 / 需求台賬 / 需求池·分配 / 產品需求處理 / 研發交付 / 需求驗收 | `rdm` | 8 个一级菜单，sort 16..23：顶部先给管理者看结果，其余按需求生命周期动线排列；其中「需求總看板」与「研發交付」已升为分组。由 `RdmMenuInitializer` 种子创建（v3.3 看板升分组，v3.2 研发交付升分组，v3.0 分类调整，v2.0 已拍平，旧 `rdm-center` 已软删退役） |
| `rdm-delivery` 及其子菜单 | 研發交付 | `rdm` | 一级**分组**（type=1、无 path），下挂三个二级菜单：`rdm-delivery-board`（交付工作台，/rdm-delivery）、`rdm-delivery-iteration`（迭代排期，/rdm-iteration）、`rdm-delivery-req`（交付中需求，/rdm-delivery-req）。非菜单子页：`/rdm-task`→board，`/rdm-iteration-form`→iteration，`/rdm-prd`与`/rdm-review`→`rdm-product`，`/rdm-change`→`rdm-requirement`。菜单 key 变更时由 v3.2 迁移把旧 `rdm-delivery` 上的 `sys_role_menu`/`sys_department_menu` 以 INSERT IGNORE 继承到子菜单（否则非超管升级当日点开为空） |
| `rdm-dashboard` 及其子菜单 | 需求總看板 | `rdm` | 一级**分组**（type=1、无 path），下挂六个二级菜单：`rdm-dashboard-board`（交付看板）、`rdm-dashboard-quality`（質量口徑）、`rdm-dashboard-version`（版本追溯）、`rdm-dashboard-report`（交付週報）、`rdm-dashboard-score`（產出積分，v3.4）、`rdm-dashboard-trend`（效能量趨勢，v3.4）。看板类接口（/analytics/*、/score/*）按子菜单 key 鉴权，不挂分组 key |
| `rdm-config-group` | 需求配置 | `rdm` | 一级分组（sort 24），下挂四个二级菜单：`rdm-config-status`/`rdm-config-routing`/`rdm-config-sla`/`rdm-config-score`（積分規則，v3.4 新增，采 VIEW_EDIT：配规则等于改所有人的分） |
| ~~`oa-center`~~ | OA中心 | `oa` | **v45 已物理删除** — v45 已退役；流程中心/流程事項/流程配置 提升为顶级 |
| ~~`permission`~~ | 權限管理 | `iam` | **v45 已物理删除** — v45 已退役；授權中心/角色管理/數據授權 提升为顶级 |
| ~~`system-config`~~ | 系統配置 | `platform` | **v45 已物理删除** — v45 已退役；規則總覽/規則中心/版本管理/通知渠道配置 提升为顶级。`menu-config`（菜單配置）归 `iam` 治理面，不随 platform |
| `i18n-center` | 多語言管理 | `platform` |  |
| `hcm-org-legal` | 法人主體 | `organization` | 顶级菜单，sort 66；法人是雇佣关系的法律一方，未核实的法人不得用于正式计薪 |
| `hcm-org-unit` | 管理組織 | `organization` | 顶级菜单，sort 67；`org_unit` 带法人外键与物化路径，禁止跨法人挂树 |
| `hcm-org-job-family` | 職務族 | `organization` | 顶级菜单，sort 68；族决定能力模型与薪酬带宽，有职位时只能停用不能删 |
| `hcm-org-job-grade` | 職位職級 | `organization` | 顶级菜单，sort 69；职位必须挂在启用中的族下，职级序号从 1 起 |
| `hcm-org-position` | 崗位與編制 | `organization` | 顶级菜单，sort 70；本期只落核定编制数，在职占用待 C2 任职事实反算 |
| `hcm-payroll-component` | 薪資項目 | `payroll` | 顶级菜单，sort 71；类型分應發/扣除/雇主成本，雇主成本不進員工實發 |
| `hcm-payroll-standard` | 薪酬標準 | `payroll` | 顶级菜单，sort 72；挂在雇佣上日期生效，同雇佣区间不得重叠 |
| `hcm-payroll-benefit` | 福利參保 | `payroll` | 顶级菜单，sort 73；同页两页签（方案 / 人員參保），费率分雇主/雇员，基数受方案上下限约束 |
| `hcm-payroll-rule` | 薪酬規則 | `payroll` | 顶级菜单，sort 74；城市×期間規則集 + 個稅級距，系統不內置任何默認費率 |
| `hcm-payroll-run` | 薪酬核算 | `payroll` | 顶级菜单，sort 75；批次試算→鎖定→工資單，鎖定後只讀 |
| `hcm-person` | 人員主檔 | `hr` | C3 新花名册（person 为事实源），与旧「員工管理」并存，C6 切换；不复用 hr-profile/employee-management 的写权 |
| `attendance-workbench` | 假勤工作台 | `attendance` | 顶级菜单，sort 26；待办只跳转流程事项，不承载审批动作 |
| `attendance-group` | 考勤組與規則 | `attendance` | 顶级菜单，sort 27；考勤结论的最小计算单位 |
| `attendance-shift` | 班次管理 | `attendance` | 顶级菜单，sort 28 |
| `attendance-holiday` | 節假日日曆 | `attendance` | 顶级菜单，sort 29 |
| `attendance-schedule` | 排班管理 | `attendance` | 顶级菜单，sort 30 |
| `attendance-punch` | 打卡記錄 | `attendance` | 顶级菜单，sort 31；只读账本 |
| `attendance-exception` | 異常處理 | `attendance` | 顶级菜单，sort 32；子页 `/attendance-exception-handle` 归同一菜单 |
| `hr-leave` | 請假管理 | `attendance` | **v228 从 `hr-profile` 迁入并提升为顶级**，sort 33；key/path/actions 未变，存量授权随行 |
| `hr-leave-quota` | 假期額度 | `attendance` | **v228 从 `hr-profile` 迁入并提升为顶级**，sort 34；同上 |
| `attendance-daily` | 考勤日報 | `attendance` | 顶级菜单，sort 35；**v1.1 補齊 `edit` 動作**（重算區間日報屬寫操作，缺 edit 則該能力對普通角色永遠授不出去） |
| `attendance-monthly` | 月度考勤匯總 | `attendance` | 顶级菜单，sort 36；冻结后为薪酬核算取数来源 |
| `attendance-setting` | 假勤設置 | `attendance` | 顶级菜单，sort 37；只含考勤口径参数，**不含审批流程配置**（归 `oa` 的流程配置） |
| `meeting-management` | 會議中心 | `meeting` | 顶级分组（type=1）；**meeting:menu:v1.2 由「會議管理」更名**（复用同一行只改显示名，menu_id 不变，存量授权随行）；sort 取「当前顶级最大值 + 10」而非写死，避免与后续新增系统互顶 |
| `meeting-admin` | 會議治理 | `meeting` | **meeting:menu:v1.2 新增**的第二个顶级分组（type=1），icon `MonitorOutlined`（已核对 sys_menu 无重复）；sort 取「會議中心 + 1」使两个一级菜单在侧边栏相邻；使用侧与行政治理侧分列，避免普通员工每次展开都要跳过三条治理入口 |
| `meeting-my` | 我的會議 | `meeting` | 挂在 `meeting-management`（會議中心）下，组内 sort 1；actions `view,edit`；非菜单子页 `/meeting-detail` 也归本菜单（钉钉邀约卡片直达） |
| `meeting-booking` | 會議室預約 | `meeting` | 挂在 `meeting-management`（會議中心）下，组内 sort 2；actions `view,edit`；写动作统一用 `edit`（菜单种子里没有 `create`，标注不存在的动作等于接口永久 403） |
| `meeting-room` | 會議室檔案 | `meeting` | **v1.2 从 `meeting-management` 迁到 `meeting-admin`**，组内 sort 1；actions `view,create,edit`；档案全员可读、仅行政可写，M1 不开放导出（无导出接口就不登记 export） |
| `meeting-record` | 預約記錄 | `meeting` | **v1.2 迁到 `meeting-admin`**，组内 sort 2；actions `view,edit`；`view` 决定能否看全量（行政视野），`edit` 决定能否代操作 |
| `meeting-config` | 預約規則 | `meeting` | **M2（v231 + meeting:menu:v1.1）新增**，**v1.2 迁到 `meeting-admin`**，组内 sort 3；actions `view,edit`。改全局規則與手動拉黑/撤銷都是寫操作；「能不能改」由服務層 `requireRecordManager` 錨在 `meeting-record:edit` 判定，菜單動作只決定能不能進頁面 |
| `doc-library` | 文檔庫 | `doc` | 頂級菜單（type=2，**doc:menu:v1.1 拍平**，對齊 rdm「菜單拍平為一級」形態，無分組殼）；actions `view,edit`；**權限粒度為菜單級統一（產品決策）**：持有 view 即全空間可見，edit 承載登記/編輯/刪除；非菜單子頁 `/doc-center/detail`、`/doc-center/register`、`/doc-center/edit` 均歸本菜單 |
| `doc-space` | 空間管理 | `doc` | 頂級菜單（**doc:menu:v1.1 拍平**）；actions `view,edit`；空間維護與騰訊文檔目錄同步/OpenAPI 用量查看入口；子頁 `/doc-space/form` 歸本菜單 |
| `doc-stats` | 閱讀統計 | `doc` | 頂級菜單（**P2 新增，doc:menu:v1.2**），icon `BarChartOutlined`；actions `view`（頁面純唯讀，不種 edit）；期間窗口（7/30/90 天）內按文檔聚合的閱讀口徑看板 |
| `doc-learning` | 學習路徑 | `doc` | 頂級菜單（**P2 新增，doc:menu:v1.3**），icon `FlagOutlined`；actions `view,edit`；新人入職包/培訓清單（有序文檔集合 + 本人完成度，已讀由留痕推導）；子頁 `/doc-learning/detail`、`/doc-learning/form` 歸本菜單 |

> 歷史分組 `doc-center-management` 已由 doc:menu:v1.1 解除（邏輯刪除+清授權）：系統視圖按 system_code 剪枝，一級分組沒有運行時職責只多一次展開。門戶業務域歸類：doc 屬「協作與交付」（collab），使用視角為全員查閱知識，空間治理入口留在系統內。

> **免登签到页 `/meeting-checkin?token=`（M2）不是菜单项**：它对应后端安全白名单里的 `/api/meeting/checkin-page/**`，
> 身份由 HMAC 令牌（绑人 + 绑会议 + 会议结束后 2 小时失效）校验；前端把它登记进 `pathToKey` / `ROUTE_MENU_KEY_MAP`
> 并归到 `meeting-my`，只是为了让页签与菜单高亮拿得到锚点，不代表该页需要登录态。

> **会议域三个新增/编辑独立页（非菜单项，UI 规范 §9.1 禁止用弹窗承载表单）**：
> `/meeting-room-form`（會議室檔案 新增/编辑，归 `meeting-room`）、
> `/meeting-booking-form`（新建预约，归 `meeting-booking`）、
> `/meeting-blacklist-form`（手動加入黑名單，归 `meeting-config`）。
> 三个页面都需在 `App.tsx` 注册路由 + `menuDataSource.pathToKey` + `Permission/types.ROUTE_MENU_KEY_MAP` 三处对齐，
> 否则路由守卫拿不到菜单 key（要么人人可进，要么永久 403）；带 `?id=` 时按 id 回查接口，刷新与粘贴 URL 都不丢上下文。

> **行政代订（`delegate_for_id`）不是新菜单，也不新增动作**：入参只有一个 `delegateForId`（sys_user.id），
> 权限锚沿用 `meeting-record:edit`（与手动释放、代取消同源，由服务层 `MeetingAccessGuard.resolveDelegateFor` 判定，
> 控制器注解只管菜单入口）。语义：**组织者仍是登录的行政**（保留改期/取消权），
> 实际使用人落 `delegate_for_id/delegate_for_name` 快照并**自动并入必参名单**，
> 因此他的日程、响应、签到全都天然挂载；时段冲突按**使用人**而不是行政判定（行政不出席这场会）；
> 黑名单**两人都查**（否则被限制的人只要找人代订就能继续占用窗口）；改期**不迁移**使用人，要换人只能取消重订。
> 代订人参与幂等哈希，同一 `requestKey` 换挂名对象会被判为不同请求而拒绝。

> **门户业务域归属（Portal `PORTAL_DOMAINS`）**：`meeting` 归 **協作與交付（collab）**，与 `oa`（流程审批）、`rdm`（产研交付）同域；
> 同期把 `org` 收窄为 **組織與人事**（只剩 `hr`、`attendance`）。
> 会议同时带行政与协作两种属性——会议室档案/预约规则/黑名单由行政维护（治理面），但使用者是全员排期开会（协作面）；
> 门户分类按使用者视角划分，所以归协作域，行政治理入口留在系统内部的「會議治理」一级菜单。
> 插画为专属两套构图（`data-scene='meeting'`，色调 `#0958D9`）：场景一「选房与忙闲」= 俯视会议桌 + 忙闲时间轴 + 时钟，
> 场景二「邀约与签到」= 邀约卡飞向三人 + 二维码扫码签到；只画时钟或日历会被读成考勤系统，所以会议桌必须常驻。

## 3. 叶子菜单归属规则

**规则：** 任何叶子菜单的 `system_code` = 其**根级父菜单**的归属系统。同一棵树的所有后代菜单必然同属一个系统，跨系统拆分叶子属于**违规**，改造阶段必须先归组再拆分。

以下 3 组叶子菜单是跨系统的常见混淆点，明确落位：

| 菜单 key | 现有父级 | 归属 | 说明 |
|---|---|---|---|
| `asset-claim`（領用資產）、`asset-borrow`（借用資產）、`asset-return`（歸還資產） | `asset-flow-ops` | `eam`（管理端） | 员工自助入口在 `oa` 系统下用**独立菜单 key** 表达（如 `my-assets` / `my-claims`）；本轮不新增，沿用现有 `MyAssets` / `MyClaims` 页面但**暂不纳入受控菜单**（现状即允许全部登录用户访问）。 |
| `purchase-request`（採購申請） | 曾挂 `oa-center` / 已迁移 | `oa` | 属于 OA 流程 |
| `approval-center`（審批中心） | `finance > approval` | `finance` | 保留在 finance，本轮不迁移至 `oa`；未来若要合并两套审批引擎再讨论 |
| `login-log`（員工動態） | `hr` | `hr` | 展示层保留；账号安全类操作（强制下线、密码重置）本轮仍由 HR 页面调用，Round 2 迁移到 `iam` |
| `hr-leave`（請假管理）、`hr-leave-quota`（假期額度） | 原挂 `hr-profile` | `attendance` | **v228 迁入考勤假勤系统**。迁移动作是把两条叶子提升为 `attendance` 顶级菜单（`parent_id = NULL`），而不是在 `hr-profile` 树内改子叶子归属——§3 的不变量是「一棵树同属一个系统」，留父级改子级正是违规形态。`ess-leave`（我的假期）属员工自助视图，仍留在 `hr` 的 `ess-center` 树下。 |
| `menu-config`（菜單配置） | `system-config` | `iam` | 系统配置类操作从 platform 迁至 iam；本清单里作为例外覆盖上表 |

> **例外说明**：`menu-config` 与 `role-management`、`function-permission`、`data-permission` 一样，属于「权限中心治理面」，即使物理上在 `system-config` 树下，也归 `iam`。这保证「谁能修改菜单/权限」由 `iam` 一处授权。

## 4. 未归属候选（阶段 A 未处理）

以下菜单当前是**未接后端的纯前端原型**（`BACKEND_CONNECTED_KEYS` 未登记），本轮不写入 `system_code`（保留 NULL，前端仍可见）：

- `waterfall-simulation`、`algorithm-simulation`、`merchant-score-insight`、`merchant-promotion-diagnose` — 商家推广工具 > 流量沙盘（原型）
- `promotion-report-overview`、`promotion-report-order`、`promotion-report-compare` — 商家工作台 > 报表分析（原型）

**处置策略：** 报表三兄弟随 `promotion-report-group` 归 `seller`（v199 拆分，`system_code` 显式设为 `seller`），但菜单 `status` 保持现状。理由：即便原型页也占用菜单槽位；未归属反而会让系统切换器看不到它们，导致后续清理困难。

## 5. 后端接口归属（MVP 阶段保守：只登记，不强制拒绝）

| 路径 | 归属系统 | `@RequirePermission` menu | 说明 |
|---|---|---|---|
| `/api/auth/**` | 公共 | — | 登录、登出、会话校验，跳过系统准入 |
| `/api/menus/tree` | 公共 | 无（当前所有登录用户可读） | 迁移到 `MenuPermissionGuard` 之前保持原行为；Round 2 加系统维度 |
| `/api/employees/**` | `hr` | `employee-management` |  |
| `/api/departments/**` | `hr` | `organization-management` / `data-permission` | 部门作为 HR 主数据；权限写路径归 `iam` |
| `/api/roles/**` | `iam` | `role-management` / `function-permission` |  |
| `/api/eam/assets/**` | `eam` | `asset-list` 等 |  |
| `/api/portal/context` | 公共 | 仅需登录态 | 新增 |
| `/api/systems/{code}/navigation` | 公共（读取） | 内部按 code 判定准入 | 新增 |

**未列出的接口：** MVP 阶段**不做**系统归属校验，只按现有 `@RequirePermission(menu, action)` 判定；Round 2 引入严格模式时统一扫描补齐。

## 6. 一次性迁移：从菜单授权反推系统准入

迁移规则（幂等，仅执行一次，不随重启重跑）：

1. 每个部门/角色，若它已经持有某系统下**任意一个启用菜单**的授权记录（`sys_role_menu` / `sys_department_menu`），则插入对应的系统准入（`sys_role_system` / `sys_department_system`）。
2. 已经内置的 `sys_admin` 角色（`sys_role.code='admin'`）与 `sys_user.role='admin'` 的超管**跳过**：后端按超管直通处理，不落关联表。
3. 若角色/部门只有菜单授权但对应菜单已 `deleted=1` 或 `status=0`，视为无有效来源，**不插入**。
4. 迁移后**冻结**：任何后续撤销系统权限必须走「权限中心 → 系统授权」页面（Round 2 交付），不再由菜单授权自动同步。这是防止「撤销系统又被菜单授权推回」的关键。

## 7. 下轮待办清单（Round 2+）

**Round 2 · 强拒绝与前端系统内视图**
- [ ] `PermissionAspect` 从"仅日志"切至严格拒绝模式（配置项 `system-portal.strict-mode`）。
- [ ] 前端 Sidebar / MenuTabs / HeaderBar 按 `currentSystemCode` 过滤；新增顶部系统切换器。
- [ ] 权限中心新增「系统授权」页（角色/部门 × 系统 × 菜单原子保存）。
- [ ] `/api/menus/tree` 拆分为 `/api/systems/{code}/navigation` + 内部完整树管理接口。
- [ ] 引入 `sys_permission_revision` 版本号，撤权立即生效跨实例。

**Round 3 · 边界与共享接口**
- [ ] HR 与 iam 边界拆分：员工写接口不再接受 `role`、`functionRoleIds`。
- [ ] 共享选择器最小 DTO（员工/部门/职位/门店/购买公司）+ 归属白名单。
- [ ] 员工自助 `consumable-claim` / `my-assets` / `my-claims` 归 `oa`，配套基础员工角色种子。
- [ ] OA 与业务系统的详情跳转与权限协作。

**Round 4 · 会话与运维**
- [ ] 统一服务端退出（撤销 `active_token`），跨标签页 `BroadcastChannel` 同步。
- [ ] 灰度开关与快速回退脚本。
- [ ] 迁移审计面板与差异对照。

---

## 8. 变更纪律

- **本文件是系统归属清单的唯一真值**，`SystemCode.java` 与本文件不一致时以本文件为准。
- 新增业务系统必须：(1) 在本文件添加条目 → (2) 更新 `SystemCode.java` → (3) 增加 `sys_system` 种子迁移 → (4) 补测试。缺任一步 CI 拒绝合并（Round 2 加门禁）。
- 叶子菜单新增时必须指定 `system_code`；菜单管理页在 Round 2 前手动通过 SQL/管理页设置。
