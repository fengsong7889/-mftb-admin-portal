# 统一门户 · 分系统改造 · 归属清单（阶段 A 产出）

> 本清单是「统一门户 + 分系统权限」改造的**唯一归属真值**，后端 `sys_menu.system_code` 种子、前端门户卡片、后续 `PermissionAspect` 系统准入判定都以此为准。所有变更必须同步更新此文档与 `backend/.../SystemCode.java`。
>
> 版本：v1（2026-09）
> 关联方案：`统一门户_分系统_权限改造_bcdcf6bc.md`

---

## 1. 系统清单（13 个业务系统 + 1 个公共入口）

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
| `hr` | 人力資源系統 | Human Resources | `TeamOutlined` | 60 | 员工、组织、职位、员工动态 |
| `eam` | 物資管理系統 | Asset Management | `InboxOutlined` | 70 | 资产、耗材、采购、库存、盘点 |
| `rdm` | 產研協同系統 | R&D Collaboration | `ProjectOutlined` | 75 | 需求提交、审批、分配、研发交付、验收上线与产出看板（菜单已拍平为一级，无 rdm-center 目录） |
| `oa` | 協同辦公系統 | Office Collaboration | `SolutionOutlined` | 80 | 流程中心、流程事项、审批配置、员工自助 |
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

## 3. 叶子菜单归属规则

**规则：** 任何叶子菜单的 `system_code` = 其**根级父菜单**的归属系统。同一棵树的所有后代菜单必然同属一个系统，跨系统拆分叶子属于**违规**，改造阶段必须先归组再拆分。

以下 3 组叶子菜单是跨系统的常见混淆点，明确落位：

| 菜单 key | 现有父级 | 归属 | 说明 |
|---|---|---|---|
| `asset-claim`（領用資產）、`asset-borrow`（借用資產）、`asset-return`（歸還資產） | `asset-flow-ops` | `eam`（管理端） | 员工自助入口在 `oa` 系统下用**独立菜单 key** 表达（如 `my-assets` / `my-claims`）；本轮不新增，沿用现有 `MyAssets` / `MyClaims` 页面但**暂不纳入受控菜单**（现状即允许全部登录用户访问）。 |
| `purchase-request`（採購申請） | 曾挂 `oa-center` / 已迁移 | `oa` | 属于 OA 流程 |
| `approval-center`（審批中心） | `finance > approval` | `finance` | 保留在 finance，本轮不迁移至 `oa`；未来若要合并两套审批引擎再讨论 |
| `login-log`（員工動態） | `hr` | `hr` | 展示层保留；账号安全类操作（强制下线、密码重置）本轮仍由 HR 页面调用，Round 2 迁移到 `iam` |
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
