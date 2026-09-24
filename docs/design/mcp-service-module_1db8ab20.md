# MCP 服務模块开发计划

## 一、背景与前置修复

1. **「工具註冊中心」菜单点击弹「該功能模塊開發中」**：根因是改名迁移（`V_MENU_SEED v11`）尚未在数据库生效（后端未重启），前端已无旧 key `ai_tool_registry` 映射。**重启后端即自动解决**（旧菜单删除、重建为「AI 操作授權」），无需额外代码。
2. **连带坑修复（必须）**：`seedSystemMenus()` 重启时会 `DELETE ... menu_key LIKE '%ai%'`，会把独立初始化器种的 `ai-access-request`（AI 使用申請，[102_ai_access_request_menu.sql](backend/src/main/resources/102_ai_access_request_menu.sql)）一并删掉，而 `AiAccessRequestMenuDataInitializer` 是 `applyOnce` 不会重跑 → 菜单永久消失。修复：在 `DataInitializer.seedSystemMenus()` 的 menus map 中补入 `ai-access-request`（名称「AI 使用申請」、父级 ai-assistant、sort 10），点击导航由前端 `keyToPath` 兜底（与全系统种子菜单一致的模式）。

## 二、工具接入分析（需求 1）

**当前项目可接入的工具清单**（已有真实后端 API + 前端执行器）：

| 工具 | 数据域 | 现状 | 风险等级 |
|---|---|---|---|
| query_account_balance 賬戶餘額查詢 | 财务 | agent.ts 已实现（FinAccountController） | L1 只读 |
| query_approvals 審批狀態查詢 | 财务 | agent.ts 已实现（FinApprovalController） | L1 只读 |
| query_batches 批次查詢 | 财务 | agent.ts 已实现（FinBatchController） | L1 只读 |
| order_query 推廣訂單查詢 | 推广 | 后端 AdOrderController + api/adPromotion 齐备，执行器待写 | L1 只读 |
| store_query 門店信息查詢 | 商户 | 后端 StoreController + api/store 齐备，执行器待写 | L1 只读 |
| group_query 集團查詢 | 商户 | fetchMerchantGroups 齐备，执行器待写 | L1 只读 |
| usage_query 能耗/用量查詢 | AI | biz_llm_usage + AiMyCenterService 齐备 | L1 只读 |

**常备工具路线图**（后续迭代）：查询类（L1 只读，上表）→ 统计汇总类（L1/L2）→ 写操作类（L2 草稿确认 / L3-L4 审批流，与「AI 操作授權」页面的等级治理打通）。

**首批接入 2 个（真实可验证）**：`query_account_balance`（賬戶餘額）+ `query_approvals`（審批狀態）为**已安装**状态；`query_batches`（批次查詢）作为**未安装**的真实工具上架广场——用于端到端演示「广场安装 → AI 助手即刻获得能力」闭环。执行器复用 [agent.ts](src/api/agent.ts) 现有 3 个 handler，零新业务代码。

## 三、MCP 架构（MCP 风格工具注册表 + 统一执行协议）

- 对齐 MCP 的 `tools/list`（manifest 下发）与 `tools/call`（统一调用）语义：工具以 manifest 描述（tool_key、name、description、JSON Schema 参数、风险等级、分类、图标），**已安装工具的 manifest 由后端动态下发**给 AI 助手。
- 工具执行沿用现有安全链路：前端 JWT 直调后端业务 API（权限由服务端判定，与现网一致）；执行器 registry 按 tool_key 映射。
- 不引入标准 MCP SSE Server（自建 Web 助手经 `/api/llm` 代理调模型，Function Calling 即是模型侧 tool use；标准 MCP 端点留给未来外部 Agent 接入，架构不冲突）。
- 与「AI 操作授權」分工：广场管**接入**（安装/卸载），操作授權管**放行**（L0-L4/白名单治理）——本期只做接入层，操作授權页面后续接真实注册表。

## 四、后端改造

1. **新表 `mcp_tool`**（新增 `backend/sql/103_mcp_tool.sql` + 专用 `McpToolDataInitializer`，遵循项目"新 SQL 必须注册专用 DataInitializer"规范）：
   - 字段：id、tool_key(UNIQUE)、name、category、description、icon、version、risk_level(L0-L4)、params_json(JSON Schema TEXT)、enabled、installed、installed_by、installed_at、sort、deleted、created_at、updated_at
   - 种子 3 条：query_account_balance(installed=1)、query_approvals(installed=1)、query_batches(installed=0)，params_json 取自 agent.ts 现有 schema
2. **`McpToolController`**（`/api/mcp/tools`，权限校验照抄 AiAccessRequestController 的 MENU 常量模式）：
   - `GET /api/mcp/tools` 广场列表（全部上架工具 + 安装状态，按分类分组）
   - `GET /api/mcp/tools/installed` 已安装 manifest（登录即可，AI 助手动态拉取）
   - `POST /api/mcp/tools/{key}/install`、`DELETE /api/mcp/tools/{key}/install` 安装/卸载（记录 installed_by/at，幂等）
3. **`DataInitializer`**：
   - `ai-access-request` 并入主种子（见 一.2），`V_MENU_SEED` bump 至 v12
   - menus map 增加新菜单：`ai-mcp-service`「MCP 服務」父级 ai-assistant、sort 6（追加在能耗之後，避免与存量 sort 冲突，可在菜单配置自行调整）；`seedMenuEnglishNames` 补 "MCP Services"

## 五、前端改造

1. **新页面 `src/pages/McpService/index.tsx`**（路由 `/ai-mcp-service`）：
   - 顶部说明 Alert（接入层定位：安装后 AI 助手即刻具备能力）
   - 广场：分类筛选 + 工具卡片（图标/名称/tool_key/描述/参数个数/风险等级 Tag/安装 Switch），卸载二次确认
   - 已安装工具区（或 Tab）：含安装人/安装时间
   - 风格沿用 AiOperationAuth 页面（content-area + search-section + 卡片网格），遵循全局表单/列表风格规范；全部用户可见文案走 i18n（zh-TW/en）
2. **`agent.ts` MCP 化改造**：
   - 新增 `fetchInstalledMcpTools()`（api/mcpService.ts）；`sendAgentMessage` 启动时拉取 manifest 动态构造 `tools` 数组（替换硬编码的 3 个）
   - 执行器 registry：`Map<tool_key, handler>`，保留现有 3 个 handler；未匹配 tool_key 返回未知工具错误
   - System Prompt 能力范围段落由已安装工具 description 动态拼接，规则段保留
3. **菜单全链路**：Sidebar `keyToPath`/`keyToIcon`（RobotOutlined 或 ExtensionOutlined 图标）、MenuTabs、menuNameEn、Permission/types.ts（操作集/授权树/受控 key/路由映射）、App.tsx 路由 lazy import
4. **i18n**：zh-TW.json / en.json 新增 mcpService.* 命名空间（沿用 aiApply 的组织方式）

## 六、验证计划

1. `mvn compile` + `npm run typecheck` + eslint 全绿
2. 重启后端：确认旧「工具註冊中心」被重建为「AI 操作授權」、`ai-access-request` 菜单保留（回归 一.2 修复）、新「MCP 服務」菜单出现且 admin 可见
3. 端到端：MCP 广场安装 `query_batches` → 首页 AI 助手问「查一下最近的充值批次」→ 触发工具调用并返回真实数据；卸载后同问法确认工具不再下发
4. 回归：未安装前助手不暴露批次查询能力；安装状态刷新页面后持久

## 七、假设与边界

- 安装/卸载为全局生效（管理员维度），不做个人级安装；「用户自行选择安装」指有 MCP 服務菜单权限的管理员
- 本期不做标准 MCP SSE 端点与第三方 MCP Server 接入（广场展示的均为系统内置上架工具，"不定期对接新工具"= 后续版本向上架表插入新记录）
- AI 操作授權页面保持 mock 现状，不在本期打通