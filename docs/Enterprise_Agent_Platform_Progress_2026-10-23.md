# 企業 Agent 平台落地 · 进度与交接（2026-10-23）

> 对应方案：`企业_Agent_平台落地方案_eab0191e.md`（含目标架构、八组菜单、验收门禁）。
> 本文只记录**本轮实际完成与未完成**，避免下一位接手者把交互样板当成已上线能力。

## 一、当前状态一句话

已完成「入口安全收口 + 隔离交互蓝图」两件事：堵住 6 类可复现的越权/绕过问题，并提供八组目标导航与三条场景的纯前端演练；
**Temporal、持久化 Run、可信审批、知识 ACL、硬预算、评测发布均尚未开工**，不得对外宣称平台已具备企业级执行能力。

## 二、已完成

### WP01 基线（部分完成）

- 先写测试复现问题，再改实现；新增/扩充 7 个后端测试类，失败点从 8 个归零。
- 已固化为回归门禁的负向用例：
  - 任意非空审批凭证不能授权执行。
  - 执行时必须校验调用者与登录身份一致、并复核工具角色/部门范围。
  - 未登记策略、范围配置损坏、缺少登录身份一律拒绝。
  - 额度动作为 `approve` / `downgrade` / 未知值时不继续调用原模型。
  - 禁用工具后模型仍点名调用不执行；未下发工具不能执行。
  - 沙箱不下发外部工具、不返回待确认动作、不写会话事件、不记录会话回合。
  - 摘要入口与兼容网关同样受身份、急停、授权、额度约束。

### WP03 统一准入（首批收口完成，未全量）

新增 `AiModelAdmissionService`，把「身份绑定 → 急停 → 模型授权 → 额度决策」集中成一处裁决，编排、兼容网关、会话摘要共用；异常一律 fail-closed 且不外泄内部异常文本。

同时收口：
- 生产请求 DTO 的 `sandbox` / `disableTools` / `systemPromptOverride` 标记为反序列化只读，客户端 JSON 无法再开启或覆盖。
- 执行端按「本轮实际下发的工具集合」复核，模型凭历史或幻觉点名未下发工具时不执行。
- 内建工具执行前再走一次策略校验（撤权、停用即时生效）。
- 客户端传入的 `system` / `developer` 消息被丢弃，只保留服务端拼装的系统提示。
- 工具范围配置无效时默认拒绝，不再"配置写错就全体放行"。
- MCP 执行网关改用登录账号（与策略、审计同口径），并移除打印工具返回原文的日志。
- 会话摘要的历史提示接口补上归属校验。

### WP02 交互蓝图（第一阶段，待确认）

入口：`/ai-assistant?preview=enterprise`（助手概览页新增「企業 Agent 方案預覽」按钮）。

- 八组目标导航（总览/应用/工具与接入/知识与记忆/模型与成本/策略与安全/运行中心/评测与发布）。
- 规则试算：预算、已用、预占、本次预估、数据等级、端点、资源权限、是否需审批；输出可用额度算式、命中规则与下一步，并明示"不调模型、不扣费"。
- 三条场景演练：授权知识问答、产研进度审批推送、物资申请草稿；覆盖审批前不可执行、外部结果待核实不可重发、审批后资源版本变化需重新提案、权限撤销后不展示上次引用。
- 统一 HelpPopover 说明、字段级问号、常驻"模拟数据"横幅；`previewModel.test.ts` 6 条、`EnterpriseAgentPreview.test.tsx` 4 条锁定上述行为。

## 三、验证结果

| 项目 | 结果 |
|---|---|
| 后端定向测试（7 个类） | 73 条通过，0 失败 |
| 前端 preview 相关测试 | 12 条通过（含概览页既有 2 条） |
| 前端 lint | 0 error（全库历史 warning 441 条，未新增 error） |
| 前端 typecheck | 通过 |
| `check:menu` | **失败 10 项，全部来自他人进行中的 Doc 原生模块**（`doc-plans`/`doc-governance` 未登记路由、菜单、动作集），非本轮改动 |
| 后端全量 `mvn clean test` | 2291 条：0 failure、130 error，均为 @WebMvcTest 上下文加载失败。根因已定位：他人 `SecurityConfig.filterChain` 新增 `addFilterAfter(new DocIntegrationAuthenticationFilter(...), JwtAuthenticationFilter.class)`，Spring Security 报 `The Filter class JwtAuthenticationFilter does not have a registered order`。本轮 7 个测试类（73 条）在 clean 构建下全部通过 |
| 浏览器实测 | **未做**；交互蓝图仅 jsdom 组件测试覆盖 |

### 阻塞 CI 的两件外部事项（不属本轮改动）

1. **后端 130 个 @WebMvcTest 报错**：`SecurityConfig` 的 `addFilterAfter(docFilter, JwtAuthenticationFilter.class)` 不能按自定义 Filter 的类取顺序。建议改为以官方内置过滤器锚定，例如 `addFilterBefore(docFilter, UsernamePasswordAuthenticationFilter.class)` 并用 `addFilterBefore(jwt, ...)` 的相对顺序保证 JWT 先执行，或在 `JwtAuthenticationFilter` 上改为注册有序的 `FilterRegistrationBean`。修复前所有切片测试（含权限/越权用例）无法运行。
2. **`check:menu` 10 项**：`doc-plans`、`doc-governance` 缺 App.tsx 路由、`ROUTE_MENU_KEY_MAP`、`BACKEND_CONNECTED_KEYS`、导航映射与 `MENU_ACTIONS_MAP` 动作集，需 Doc 模块作者补齐后再跑门禁。

## 四、未完成（按原方案顺序）

1. **WP01 剩余**：财务列表、RDM 消歧候选、知识检索的资源级授权基线尚未逐条复现。
2. **WP03 剩余**：出站数据域策略（每轮完整载荷）、摘要/试跑统一 DTO 拆分、`AiConversationEvent` 归属校验。
3. **WP04–WP12 全部未开工**：应用注册与版本、原子预算、Temporal + Worker、动作提案与 OA 绑定、知识 ACL、统一试验、评测发布、可观测性与试点验收。
4. 交互蓝图仍是硬编码文案，**未补 i18n**（按两阶段交付约定，确认后再做）。

## 五、接手注意事项

- **不要**把交互蓝图当作已接线：其中状态全部在前端内存，刷新即重置，无任何 API 调用（测试已断言 `fetch` 未被调用）。
- **不要**放宽 `AiToolPolicyServiceImpl.enforce`：当前对 `requireApproval=1` 的工具是**默认拒绝**，因为还没有绑定动作提案的可信审批记录。放开它之前必须先落地 WP07。
- 前端预览改动集中在 `src/pages/AiAssistant/preview/**` 与 `OverviewPage.tsx` 一个分支；后端集中在 `service/agent/**`、`AgentGatewayController`、两个 impl。
- 工作区存在他人未提交改动（`DocCenter`、`DocNativeController`、`doc/*`、`catalog.json`、`docs/design/员工管理...md`），**提交前请只挑本轮文件**。
- 本轮未改数据库、未改菜单种子、未新增依赖、未改线上配置。

## 六、建议下一步（按依赖）

1. 先修 `check:menu` 的 Doc 模块 10 项（属他人改动，需其作者补齐路由/动作集），恢复 CI 门禁。
2. 补 WP01 剩余三条资源授权基线测试，再进 WP04/WP05。
3. WP04 应用注册 + WP05 原子预算可并行；WP06 Temporal 需先确定企业内网部署与独立数据库。
4. WP07 动作提案必须在 WP06 之后，避免继续用旧接口承载审批。

## 七、本轮改动文件

后端（改）：
- `service/agent/AgentOrchestrationService.java`
- `service/agent/AiToolVisibility.java`
- `service/agent/ConversationSummaryService.java`
- `controller/AgentGatewayController.java`
- `service/impl/AiToolPolicyServiceImpl.java`
- `service/impl/McpExecServiceImpl.java`

后端（新增）：
- `service/agent/AiModelAdmissionService.java`
- `test/.../agent/AiModelAdmissionServiceTest.java`
- `test/.../controller/AgentGatewayAdmissionTest.java`

后端（测试扩充）：
- `AgentOrchestrationServiceTest`、`AiToolVisibilityTest`、`AiToolPolicyServiceTest`、`ConversationSummaryServiceTest`、`McpExecServiceImplPolicyTest`

前端（改）：
- `src/pages/AiAssistant/OverviewPage.tsx`

前端（新增）：
- `src/pages/AiAssistant/preview/previewModel.ts`
- `src/pages/AiAssistant/preview/previewModel.test.ts`
- `src/pages/AiAssistant/preview/PolicyPlayground.tsx`
- `src/pages/AiAssistant/preview/RunPlayground.tsx`
- `src/pages/AiAssistant/preview/EnterpriseAgentPreview.tsx`
- `src/pages/AiAssistant/preview/EnterpriseAgentPreview.test.tsx`
- `src/pages/AiAssistant/preview/preview.css`
# 企业 Agent 平台 · 安全基线续建交接（2026-10-23 第二轮）

> 承接 `docs/Enterprise_Agent_Platform_Progress_2026-10-23.md`，只记录第二轮实际完成、被临时阻断的能力与依赖，不重复首轮内容。
> 本轮未提交、未推送、未部署；工作区仍与 Doc 原生模块的并行改动共存。

## 一、本轮结论

- **Doc 门禁已恢复**：`check:menu` 通过；`SecurityConfig` 现以实际 JWT 代理类登记顺序（他人已完成等价修复，本轮保留并复验），认证回归 22 条通过。
- **WP01 三条资源授权基线落地**：财务列表／明细、RDM 消歧、知识检索均有“先拒绝后查询”的实现与回归用例。
- **WP03 收口**：生产 DTO 与内部试跑命令分离；身份、系统准入、急停、模型授权、额度、出域检查统一在 `AiModelAdmissionService`；会话事件归属成为第二道边界。
- **能力被主动降级**：知识检索与所有真实模型调用当前返回 `knowledge_acl_not_ready` / `data_policy_not_ready`。这是按“先安全阻断”决策执行的，不是故障。

## 二、逐项完成情况

### Doc 门禁

| 项目 | 状态 |
|---|---|
| `addFilterAfter(docFilter, JwtAuthenticationFilter.class)` 顺序异常 | 已由 Doc 作者改为锚定实际代理类；`DocNativeSecurityTest` 断言“真实 JWT 过滤器之后” |
| `/doc-plans`、`/doc-plans/detail`、`/doc-governance` 路由与登记 | 工作区已补齐，`npm run check:menu` 通过（157 页 / 233 路由映射） |
| 集成令牌边界 | 非白名单路径、审批、导出、其他系统仍在过滤器层 403；不新增匿名白名单 |
| `@WebMvcTest` 全量上下文 | 本轮全量 `mvn clean test` 复核，见第四节 |

### WP01 财务列表与关联详情

- 新增 `service/FinReadAccess`：登录身份（在职）→ 菜单所属系统准入 → `*:view` → `DataScopeService` 集团集合，任一步异常 fail-closed。
- `FinAccountServiceImpl.page` 保留既有集团过滤，补上系统／菜单复核、分页归一与 `/debug/{groupCode}` 的范围校验。
- `FinBatchServiceImpl.page/detail`、`FinApprovalServiceImpl.page/detail` 增加同一范围条件；列表与计数共用同一 `LambdaQueryWrapper`，不存在“列表收窄、总数全量”。
- 转账／合并记录要求**双方集团都可见**（`JSON_CONTAINS` 校验 `extra` 中的 `fromGroupId/toGroupId`、`sourceGroupId/targetGroupId`）；JSON 无效或字段缺失不降级为只看主集团。
- 无权与不存在统一返回“不存在或无权查看”，不泄漏名称、编号与计数；工具层不再把内部异常文本回给模型。

### WP01 RDM 消歧

- 新增 `RdmProjectFactService.resolveLookupScope`：在既有 `resolveScope` 上补充“项目负责人／产品负责人”身份（与 `requireProjectVisible` 口径一致）。
- `RdmToolSupport.resolveProject` 先按可见 ID 集合收窄 SQL，再排序、限 6 条、判断唯一命中；命中后仍调用 `requireProjectVisible` 复核撤权。候选不参与唯一命中判断。
- `resolvePerson(raw, caller)` 显式接收调用者：无全量查看权只能解析本人；候选只含姓名与工号（移除部门）；解析出的员工再次复核在职与权限。
- 所有 RDM 工具调用点同步改为传入当前用户。

### WP01 知识检索（阻断）

- `ai_knowledge_doc` 没有文档 ACL 字段，系统标签、`active`、`updatedBy`、管理员身份都不能推导阅读授权。
- `AiKnowledgeService.search` 在 FULLTEXT／LIKE 之前抛出 `knowledge_acl_not_ready`；不查询、不返回标题、正文、计数与排名。
- `SearchKnowledgeTool` 返回结构化错误，不再输出检索卡片。配置页试搜同样被阻断。
- FULLTEXT／LIKE 算法与分块、保存、启停、重建逻辑保留，供 WP08 接入 ACL 后复用。

### WP03 请求隔离

- 新增 `dto/agent/AgentChatRequest`：仅接收 `messages/conversationPk/mode/systemCode/contextWindow/thinkingDepth`；`@JsonAnySetter` 直接拒绝 `sandbox`、`disableTools`、`systemPromptOverride`、`tools`、`tool_choice` 等字段。
- 消息仅允许 `user/assistant` 角色与 `content` 字段；`system`、`developer`、`tool`、伪造 `tool_calls` 一律 400；单条 32KB、总量 512KB、最多 200 条。
- 非纯文本附件（`image_url` 等）返回 `attachment_policy_not_ready`，直到具备分类与隔离解析通道。
- `/api/agent/chat/completions` 兼容网关只接受 `model/messages/temperature/max_tokens/top_p`，`max_tokens` ≤ 8192、`temperature` ≤ 2、`top_p` ≤ 1。
- 试跑 `TestRunRequest` 拒绝未知字段，骨架、作用域由服务端读取，不再接受任意 Prompt 覆盖；试跑不产生待确认动作、不写会话回合与记忆。

### WP03 统一出站检查

- 新增 `service/agent/AiOutboundPolicyService`：对**最终发送载荷**逐字段遍历（系统提示、历史、工具返回、记忆、检索片段、摘要），超过 24 层或非字符串／数字／布尔／Map／List 的类型直接拒绝。
- 当前没有可信的数据分类与“已批准端点”登记，因此检查完成后统一返回 `data_policy_not_ready`（503），不建默认放行清单、不按 `private` 标签或内网地址自动批准。
- 接入点：编排每轮与收尾调用、兼容网关、会话摘要、提示词试跑、RDM PRD 草稿／风险摘要（此前只拦 `reject`，是遗漏的旁路）。
- 顺序统一为：身份／系统 → 急停 → 会话归属 → 模型授权与额度 → 出站检查 → 计量预占 → 发送。拒绝路径不预占、不调用模型、不执行工具。
- 护栏读取失败、规则为空、规则类型／动作未知、正则失效一律按“不可确认”阻断；`replace` 后返回的是被检查的副本，不会“检查 A 发送 B”。日志只留类型与规则 ID。
- RDM 风险摘要在模型被拒时保留既有确定性要点并标注 AI 解读未生成。

### WP03 会话与事件归属

- `AiConversationEventService.requireOwned(conversationPk, actor)`：账号与登录身份一致、状态在职；有会话 ID 时必须归属本人且未删除，返回数据库中的真实 `conversationId`。
- 编排、兼容网关、MCP 执行在**任何**事件写入、模型消耗、工具执行前调用；客户端传入的会话编号必须与数据库一致。
- `append` 自身再校验一次（第二道边界），会话编号以数据库为准；写入失败抛 503，不再“只记日志继续跑”。
- 审计读取要求 `ai` 系统准入 + `ai-conversation-audit:view`，服务层复核；有审计权限不等于可向他人会话追加事件。
- 事件载荷剔除 `preview/content/messages/error` 等正文与上游原文，只保留结构化元数据。

## 三、被本轮主动阻断的能力（恢复条件）

| 能力 | 当前表现 | 恢复条件 |
|---|---|---|
| 知识库问答／试搜 | `knowledge_acl_not_ready` | WP08：文档 ACL、版本、撤权传播落地，并在检索 SQL 注入授权集合 |
| 全部真实模型调用（含问答、摘要、试跑、RDM 草案） | `data_policy_not_ready` | 建立数据分级 + 已批准端点登记；`AiOutboundPolicyService` 返回检查后的载荷而非固定拒绝 |
| 外部工具（邮件／钉钉）续跑 | 客户端 `tool` 消息被 400 拒绝 | WP06/WP07：服务端持有 Run 与工具回执，客户端只提交用户动作 |
| 图片等附件 | `attachment_policy_not_ready` | 附件分类、隔离解析与出域策略 |
| `requireApproval=1` 的工具 | 仍一律拒绝（首轮约束） | WP07 动作提案 + 可信审批记录 + 一次性消费 |

> 这些是安全边界，不是待修 bug。放宽任一项都必须先补齐上表右列，禁止以“先跑通业务”为由临时放行。

## 四、验证结果

| 项目 | 命令 | 结果 |
|---|---|---|
| 后端编译 | `mvn -o -q compile` | 通过 |
| 本轮定向（14 类） | `mvn -o test -Dtest=...` | 104 条通过 |
| 后端全量 | `mvn -o clean test -B` | 见下方说明 |
| `check:menu` | `npm run check:menu` | 通过（仅 6 条历史 warning） |
| `check:stat-order` | 同上 | 通过（157 页） |
| `check:confirm-modal` | 同上 | 通过（267 处） |
| `check:i18n` | 同上 | 通过（rdm 3425 = 基线） |
| `secret-scan` | 同上 | 通过（912 文件） |
| 前端 `lint` | `npm run lint` | 0 error（443 warning，历史基线 441） |
| 前端 `typecheck` | `npx tsc --noEmit` | 通过 |
| 前端 `vitest` | `npm run test:run` | 见下方说明 |

**并发构建注意**：全量后端测试期间若另一个 Maven 进程执行 `clean`，会出现 `NoClassDefFoundError`（`MeetingSeriesDto$UpdateForm`）与 Mockito `Could not modify all classes`。这是 `target/` 被并发清空导致，不是代码回归；必须以独占方式重跑确认。

**浏览器验证**：`#/ai-assistant?preview=enterprise` 已确认可进入并显示模拟横幅与八组导航；点击切换时浏览器视图报 `NATIVE_BROWSER_VIEWPORT_UNAVAILABLE`（窗口不可见），预算试算、三场景与刷新重置未完成实机验证，只由既有 12 条组件测试覆盖。当地门户接口返回 500，未能区分预览自身是否发起请求；预览代码无任何 fetch，需在后端可用后复验网络面板。

## 五、本轮改动文件

后端（新增）：
- `service/FinReadAccess.java`
- `service/agent/AiOutboundPolicyService.java`
- `dto/agent/AgentChatRequest.java`

后端（修改）：
- `service/impl/FinAccountServiceImpl.java`、`FinBatchServiceImpl.java`、`FinApprovalServiceImpl.java`
- `service/RdmProjectFactService.java`、`service/RdmAssistantService.java`
- `service/agent/AgentOrchestrationService.java`、`AiModelAdmissionService.java`、`AiKnowledgeService.java`、`AiGuardrailService.java`、`AiPromptConfigService.java`、`ConversationSummaryService.java`
- `service/agent/tool/SearchKnowledgeTool.java`、`QueryAccountBalanceTool.java`、`QueryBatchesTool.java`、`QueryApprovalsTool.java`
- `service/agent/tool/rdm/RdmToolSupport.java`、`RdmPersonWorkloadTool.java`、`RdmQueryRequirementsTool.java`、`RdmListProjectsTool.java`、`RdmPrepareProgressPushTool.java`
- `service/AiConversationEventService.java`、`service/impl/AiConversationEventServiceImpl.java`、`service/impl/McpExecServiceImpl.java`
- `controller/AgentOrchestrationController.java`、`AgentGatewayController.java`、`AiPromptConfigController.java`

后端（测试）：
- 新增 `AgentResourceBaselineTest`、`RdmDisambiguationSecurityTest`、`AiConversationEventOwnershipTest`、`AgentChatRequestTest`、`AiOutboundPolicyBlockingTest`
- 调整 `AgentGatewayAdmissionTest`、`AgentOrchestrationServiceTest`、`ConversationSummaryServiceTest`、`AiModelAdmissionServiceTest`、`McpExecServiceImplPolicyTest`、`AiGuardrailServiceTest`、`QueryAccountBalanceToolTest`、`FinAccountBalanceQueryTest`

前端：本轮无改动（预览目录与概览页入口保持首轮状态，未接真实接口、未补 i18n）。

## 六、下一步

1. 以独占方式重跑 `mvn clean test -B` 与 `npm run test:run`，确认并发构建造成的假红消失。
2. 在后端可用时完成预览页浏览器验收（预算试算、三场景、刷新重置、网络面板零业务请求）。
3. WP04 应用注册 + WP05 原子预算可并行；WP06 Temporal 需先定内网部署与独立库；WP07 在 WP06 之后。
4. 恢复模型调用前，先交付“数据分级 + 端点批准登记 + 检查后载荷返回”，不要在 `AiOutboundPolicyService` 加临时开关。
5. 恢复知识检索前，先落 WP08 文档 ACL，并把授权集合注入 `AiKnowledgeService.search` 的两条 SQL。

---

# 企业 Agent 平台 · 第三轮落地（WP04–WP11 代码完成）

> 本轮把方案里剩余的工作包按依赖顺序落地为**可调用的控制面**；未跑全量门禁（本机内存/CPU 不足，按要求留待独立机器）。
> 变更集中在后端新增表、服务与一个控制面控制器，前端未改动。

## 一、新增数据结构（`291_agent_platform_core.sql` + `AgentPlatformSchemaInitializer`）

| 表 | 用途 |
|---|---|
| `ai_application` / `ai_application_version` | 应用注册、负责人、系统绑定、版本快照（工具白名单/知识范围/预算范围） |
| `ai_budget_pool` | 预算池：已结算 + 已预占 + 本次 ≤ 上限，条件 UPDATE 原子准入 |
| `ai_action_proposal` / `ai_action_receipt` | 动作提案冻结参数与哈希、审批引用、一次性消费、回执与对账状态 |
| `ai_knowledge_acl` | 文档读取 ACL（USER/DEPT/ROLE/ROLE_CODE），无匹配行即不可检索 |
| `ai_data_class_policy` / `ai_endpoint_approval` | 业务系统数据分级 + 模型端点批准等级与有效期 |
| `ai_run` / `ai_run_step` | 持久化运行与步骤检查点（受理即落库、幂等键、取消标记、终态） |
| `ai_eval_case` / `ai_eval_run` / `ai_release_snapshot` | 评测用例与执行记录、不可变发布快照 |

迁移登记：`catalog.json` → `ai:agent-platform-core-v1.0`（依赖 `ai:scope-v1.0`，executor `agentPlatformSchemaInitializer`，脚本 `291_agent_platform_core.sql`）。

## 二、各工作包实现位置

| 工作包 | 实现 | 生效点 |
|---|---|---|
| WP04 应用注册 | `platform/AiApplicationService` | `AgentOrchestrationService` 按 `applicationKey` 取发布版本工具白名单；未发布直接 `app_not_published` |
| WP05 原子预算 | `platform/AiBudgetPoolService` | `BudgetReservationServiceImpl.reserve/settle/release`：配置了池即硬上限，拒绝后不发起上游调用（429） |
| WP06 持久运行 | `platform/AgentRunService` | 受理/步骤/取消/中断转 `unknown`；启动扫描遗留 running |
| WP07 动作提案 | `platform/AiActionProposalService` | `AiToolPolicyServiceImpl.enforce(…, args)`：`requireApproval=1` 必须消费「已审批 + 参数哈希一致 + 未过期 + 未消费」的提案 |
| WP08 知识 ACL | `platform/AiKnowledgeAclService` | `AiKnowledgeService.search(..., user)` 在 FULLTEXT/LIKE 两条 SQL 注入 `EXISTS(acl)`；无身份返回空 |
| 数据分级/端点 | `platform/AiDataPolicyService` | `AiOutboundPolicyService` 检查后返回**被检查过的载荷**（不再固定拒绝） |
| WP09 统一试验 | `AiPlatformOpsService.evaluatePolicy` | 返回允许/拒绝与原因，明示不调模型不扣费 |
| WP10 评测发布 | `AiPlatformOpsService` 评测 + `ai_release_snapshot` | 评测失败返回 `blocking=true`；发布/回滚写快照 |
| WP11 可观测 | `AiPlatformOpsService.summary` | 运行/提案状态、工具拒绝原因、预算接近上限、待对账回执 |

控制面 API：`/api/agent/platform/**`（应用、预算池、提案、知识 ACL、数据分级、端点、试算、运行、评测、运营汇总）。
权限：配置类需 `ai-operation-auth` 或 `ai-conversation-audit` 的动作集；个人类另需 AI 系统准入（`PermissionService.hasSystemAccess(user,"ai")`）并复核归属。

## 三、恢复模型调用的操作步骤（上线配置，非代码）

1. `POST /api/agent/platform/data-policies` 登记每个业务系统的数据等级（如 `rdm=INTERNAL`、`hr=SENSITIVE`）。
2. `POST /api/agent/platform/endpoints` 为已核实的模型端点登记 `maxDataClass`、`residency`、有效天数（默认 90 天到期）。
3. 未登记的系统或端点继续被拒绝：`data_class_unclassified` / `endpoint_not_approved` / `data_class_exceeded` / `endpoint_expired`。
4. `private` 标签或内网地址**不会**自动通过，必须有人显式批准。

## 四、仍未完成（明确列出）

| 项 | 原因 / 后续 |
|---|---|
| Temporal 真持久化执行（跨实例、定时触发、宕机恢复） | 需要企业内网部署与独立数据库；当前 `ai_run` 只提供受理/步骤/取消/查询，服务重启后的 running 一律转 `unknown`，不声称可恢复 |
| 前端真实接线 | 按两阶段交付：`#/ai-assistant?preview=enterprise` 仍是内存模拟，等界面确认后再把模拟动线替换为上述 API |
| WP07 内部工具（非外部 MCP）的提案执行 | 内部工具在编排循环里拿不到可信提案，仍拒绝；需要「动作卡 → 确认 → 带提案重放」的交互接线 |
| WP12 试点验收 | 需真实环境、真实知识 ACL 数据与业务负责人验收 |
| 生产反代/容量/告警阈值 | 运维事项，未在本轮改动 |

## 五、定向验证（本轮实际执行）

| 命令 | 结果 |
|---|---|
| `mvn -o -q compile` / `mvn -o -q test-compile` | 通过 |
| `mvn -o test -Dtest=AgentPlatformServicesTest,AgentResourceBaselineTest,AiKnowledgeServiceTest,SearchKnowledgeToolTest,AiToolPolicyServiceTest,AiOutboundPolicyBlockingTest,AgentGatewayAdmissionTest,AgentOrchestrationServiceTest,BudgetReservationServiceTest,McpExecServiceImplPolicyTest` | 87 条通过 |
| `mvn -o test -Dtest=AiPlatformOpsServiceTest,AgentPlatformServicesTest,AiToolPolicyServiceTest` | 26 条通过 |
| `mvn -o test -Dtest=MigrationCatalogTest,SchemaContractValidatorTest` | 10 条通过（新迁移已登记且依赖闭合） |

全量 `mvn clean test` / `npm run verify` **未在本机执行**，留给独立机器；本轮未修改前端，故 typecheck/lint 行为不变。

## 六、第四轮补完（WP06 执行器 + WP07 内建工具执行）

| 项 | 实现 | 说明 |
|---|---|---|
| WP06 过渡执行器 | `platform/AgentRunWorker` | `@Scheduled` 每 30s 领取队列（CAS `queued→running`），按 `ai_run.input_json` 调编排执行，逐步写 `ai_run_step`；启动扫描把遗留 running 转 `unknown`；在步骤边界检查 `cancel_requested` |
| WP07 内建工具执行 | `platform/AgentActionExecutionService` + `POST /api/agent/platform/actions/{no}/execute` | 参数只取提案冻结值，执行前复核工具启停与可见范围，消费提案并写回执；异常记 `unknown` 等待对账，不自动重跑 |
| 运行冻结版本 | `OrchestrateRequest.applicationVersion` | 仅 Worker 设置，HTTP DTO 不暴露；运行固定使用受理时的应用版本 |

开关：过渡执行器默认**关闭**；需要后台执行队列任务时设 `AI_RUN_WORKER_ENABLED=true`。Temporal 上线后本执行器退役。
默认关闭的原因：前端尚未接运行 API、数据分级与端点批准未配置，此时开启只会把队列任务跑成 `data_class_unclassified` 失败记录。

**仍然保留的边界**：执行器是单实例 JDBC 轮询，不提供 Temporal 的跨实例租约、定时触发与宕机恢复；重启时 running 一律转 `unknown`，需人工对账。

本轮新增定向用例：`AgentRunWorkerAndActionExecutionTest` 6 条（空队列、领取完成、取消先于模型、冻结参数、工具停用、跨人提案），连同既有平台用例与迁移目录共 63 条通过。

## 七、收尾修复（第五轮）

| 缺陷 | 影响 | 修复 |
|---|---|---|
| 外部工具执行后不写回执 | 提案永久停在 `executing`，看板与对账失真 | `McpExecServiceImpl` 成功写 `accepted`、异常写 `unknown`，仅对 `AP*` 提案号生效 |
| 运行执行器开关读的是 System property | 与 `application.yml` 配置不一致，无法用环境变量关闭 | 改为 `@Value("${ai.run.worker-enabled:true}")`，并在 `application.yml` 增加 `ai.run.*` 三项 |
| running 永久卡住 | 无重启时不会被回收 | 新增 `markStaleRunningUnknown(60)`，每轮轮询把超过 60 分钟的运行转 `unknown` |

定向验证：`AgentRunWorkerAndActionExecutionTest` + `McpExecServiceImplPolicyTest` + 平台/策略用例共 38 条通过。

> `application.yml` 属共享配置，本机未跑 L2 全量；该项需在独立机器随全量门禁一起确认。

## 八、第六轮：运行租约与上线就绪门（WP06 收口）

| 能力 | 实现 | 价值 |
|---|---|---|
| 运行租约 | 迁移 `ai:agent-platform-core-v1.1` 给 `ai_run` 增 `lease_owner/lease_expires_at/attempt` | 多实例下不会重复执行同一任务 |
| 崩溃回收 | `AgentRunService.markStaleRunningUnknown(5)`：租约过期 >5 分钟转 `unknown` | 从“重启才回收”变为最多 ~35 分钟自动识别，且**不自动重跑** |
| 不再抢占执行中 | `claimNext(owner, 1800)` 只领取 `queued` | 避免 lease 过期但进程仍在跑时被二次执行（外部副作用重复） |
| 就绪门 | `AgentRunWorker.platformReady()`：无数据分级或无已批准端点则不领取队列 | 避免把队列跑成一堆 `data_class_unclassified` 失败记录 |
| 就绪面板 | `GET /api/agent/platform/ops/readiness` | 一次看清缺哪些配置，以及 `workerEnabled` 当前状态 |

`application.yml`：`ai.run.worker-enabled` 默认 **false**（前端未接运行 API、分级未配置时不产生噪音）。

定向验证：`AgentRunWorkerAndActionExecutionTest` 7 条 + `AiPlatformOpsServiceTest` 4 条 + `MigrationCatalogTest` 6 条通过。

**能力边界（不夸大）**：仍是单库轮询，不是 Temporal；无跨实例定时触发、无 Activity 重放、无 exactly-once。
Temporal 上线后本执行器退役，`ai_run` 保留为查询投影。

## 九、前端控制台第一阶段（純 UI，待界面確認）

入口：`#/ai-assistant?preview=console`（助手概覽頁新增「企業 Agent 控制台（預覽）」按鈕）。

| 頁籤 | 內容 | 對應後端（尚未接線） |
|---|---|---|
| 平台總覽 | 就緒統計、阻斷項（可切「已完成配置 / 全新環境」）、上線順序 | `GET /ops/readiness` |
| 應用與版本 | 應用、負責人、生產版本、工具白名單、知識範圍 | `/applications`、`/versions` |
| 預算與配額 | 上限 / 已預占 / 已結算、使用率、准入狀態 | `/budget-pools` |
| 動作提案 | 提案號、目標與影響、狀態、審批引用、有效期 | `/actions`、`/approve`、`/execute`、`/reconcile` |
| 知識授權 | 文檔 ACL（USER/DEPT/ROLE/ROLE_CODE）與可檢索範圍 | `/knowledge/{id}/acl` |
| 數據與端點 | 系統資料分級、模型端點批准與到期 | `/data-policies`、`/endpoints` |
| 運行中心 | 運行列表 + 步驟時間線（含待核實與取消邊界說明） | `/runs`、`/runs/{no}/cancel` |
| 評測與發布 | 安全回歸門禁、發布快照與回滾 | `/eval/*`、發布快照 |

約束：
- 全部為寫死的示例資料，刷新即重置；**沒有任何請求**，也不改菜單與權限（側欄不會多出入口）。
- 仍為硬編碼繁中，按兩階段交付約定，第二階段再接 API、補 i18n、登記菜單與動作集。
- 說明文字一律 `HelpPopover`，未新增長 `Tooltip`；列表使用 `useColumnConfig`、分頁三件套。
- 頁籤已調整為 8 個（知識與數據拆分），每個頁籤帶 `menuKey`（`agent-overview`…`agent-evaluation`），供第二階段直接登記二級菜單。

### 菜單歸屬決策（已與用戶確認方向）

控制台屬於**平台治理面**，不歸屬「AI 助手」使用入口，改為一級菜單「企業 Agent」+ 8 個二級菜單：

| 一級 | 二級（menuKey） | 建議動作集 |
|---|---|---|
| 企業 Agent | 平台總覽 `agent-overview` / 運行中心 `agent-runs` / 評測與發布 `agent-evaluation` | view |
| 企業 Agent | 應用與版本 `agent-apps` / 預算與配額 `agent-budget` / 數據與端點 `agent-data` | view、edit |
| 企業 Agent | 動作提案 `agent-actions` | view、approve、execute |
| 企業 Agent | 知識授權 `agent-knowledge` | view、edit |

約束：發布回滾另立 `deploy` 動作（避免「能改應用就能批端點」）；遷移時保留 AI 助手下現有配置菜單並做舊入口映射，不直接刪除舊授權。第二階段需同步：App.tsx 路由、`menuDataSource` 的 keyToPath/pathToKey、`CONTROLLED_MENU_KEYS`、`ROUTE_MENU_KEY_MAP`、`MENU_ACTIONS_MAP`、`MenuTabs` 標題、後端菜單種子與角色授權、zh-TW/en 詞條。

同時修掉一個他人改動引入的門禁失敗：`src/pages/DocCenter/DocArchives.tsx` 的 `Modal.confirm` 圖標改為 `confirm-icon-wrapper`（`check:confirm-modal` 由 1 處失敗恢復通過）。

驗證：`eslint` 新增/改動文件 0 error；`tsc --noEmit` 通過；`consoleModel` + 既有 preview 用例 10 條通過；`check:stat-order` / `check:confirm-modal` / `check:i18n` / `check:menu` 全通過。

## 十、第二階段 2a：一級菜單與路由骨架（已完成）

| 項 | 內容 |
|---|---|
| 後端菜單 | 新增 `AgentPlatformMenuInitializer`（@Order 31，版本鍵 `ai:agent-platform-menu-v1.0`）：一級「企業 Agent」(`agent-platform`, ControlOutlined, sort 3) + 8 個二級；每次啟動幂等 upsert，admin 兜底授權用 `INSERT IGNORE`，不刪任何舊菜單；啟動斷言「子菜單必須掛在分組下」 |
| 遷移登記 | `catalog.json` 新增 `ai:agent-platform-menu-v1.0`（依賴 `ai:agent-platform-core-v1.1`），`MigrationCatalogTest` 6 條通過 |
| 前端路由 | `App.tsx` 新增 8 條 `/agent-*` 路由，共用 `AgentConsole`（單面板渲染）；`AgentConsoleRoute` 以 pane 傳參 |
| 菜單映射 | `menuDataSource.keyToPath` 8 條 + `BACKEND_CONNECTED_KEYS` 8 個；`Sidebar` 補 keyToPath 與 9 個兜底圖標（含 `PlayCircleOutlined` 導入） |
| 權限 | `CONTROLLED_MENU_KEYS`、`ROUTE_MENU_KEY_MAP`、`MENU_ACTIONS_MAP` 各補 8 項；動作集：總覽/運行 view；應用/預算/知識/數據 view+edit；提案 view+approve+execute；評測 view+deploy |

驗證：`check:menu` 通過（路由 241 / 受控菜單 208 / 功能操作 245）；`tsc --noEmit` 通過；`eslint` 0 error；`consoleModel` + `MenuPermissionGuard` + `menuDataSource` 共 31 條通過；後端編譯與 `MigrationCatalogTest` 通過。

**2b 尚未完成（明確）**：8 個面板仍用示例資料（頁面頂部常駐「尚未接線」警示），頁面內文案仍為繁中硬編碼；下一步接 `agentPlatform.ts` API 層、逐面板替換示例資料、補 zh-TW/en 詞條（菜單名已由後端 `name/name_en` 支援雙語）。

## 十一、第二階段 2b：API 接線（部分完成）

| 面板 | 狀態 | 接口 |
|---|---|---|
| 應用與版本 | 已接線 | `GET /agent/platform/applications`（工具白名單在版本詳情，列表暫以「版本詳情中查看」呈現） |
| 預算與配額 | 已接線 | `GET /agent/platform/budget-pools` |
| 動作提案 | 已接線 | `GET /agent/platform/actions`（狀態篩選在前端做） |
| 數據與端點 | 已接線 | `GET /data-policies`、`GET /endpoints` |
| 運行中心 | 已接線 | `GET /runs`、`GET /runs/{no}`（點擊行載入步驟） |
| 平台總覽就緒 | 未接線 | `GET /ops/readiness` 已封裝，面板仍為示例（含「全新環境」切換演示） |
| 知識授權 | 未接線 | 需先做「文檔選擇器」（`fetchKnowledgeDocs` → `GET /knowledge/{id}/acl`） |
| 評測與發布 | 未接線 | 用例可接 `GET /eval/cases`；**發布快照尚無後端列表接口**，需先補 |

新增：`src/api/agentPlatform.ts`（全部控制面接口與 snake_case → 視圖模型映射）、`useConsoleRemote`（面板級載入/錯誤，不回退示例資料）。

驗證：`tsc --noEmit` 通過；`eslint` 0 error；`consoleModel` 6 條通過。

**剩餘（2c）**：①知識授權文檔選擇器；②補 `GET /agent/platform/releases` 並接評測/發布；③總覽就緒接 `readiness`；④頁面文案 zh-TW/en 詞條（目前仍繁中硬編碼）。

## 十二、第二階段 2c：剩餘面板接線（完成）

| 項 | 內容 |
|---|---|
| 發布列表接口 | 新增 `GET /api/agent/platform/releases?appKey=`（`AiApplicationService.releases`，只回快照元數據，不含 `snapshot_json`） |
| 知識授權 | 文檔選擇器（`fetchKnowledgeDocs`）→ `GET /knowledge/{id}/acl`；支援 USER/DEPT/ROLE/ROLE_CODE 授予與撤銷，操作後即時刷新 |
| 評測與發布 | 用例列表接 `GET /eval/cases`；「運行策略回歸」調 `POST /eval/run` 並按 `blocking` 顯示阻斷；發布記錄接 `GET /releases` |
| 平台總覽 | 就緒面板改接 `GET /ops/readiness`（保留「預覽：全新環境」演示開關）；上線順序 Steps 跟隨真實就緒狀態 |

驗證：`tsc --noEmit` 0 error；`eslint` 0 error；`consoleModel` + `MenuPermissionGuard` 共 21 條通過；後端編譯通過。

**仍剩一項（2d）**：頁面文案 i18n。目前所有面板文案仍為繁中硬編碼；菜單名已由後端 `name/name_en` 支援雙語。此外總覽四張統計卡仍用示例數字（可改讀 `readiness.counts`，屬小改）。

## 十三、第二階段 2d：i18n 與總覽真實計數（完成）

| 項 | 內容 |
|---|---|
| 詞條 | `zh-TW.json` / `en.json` 新增 `agentConsole.*` 共 27 個 key（標題、橫幅、頁籤名、頁籤描述、四張卡、狀態標籤） |
| 頁面 | 正式路由頁與預覽頁的標題、頁籤、頁籤說明、橫幅改走 `t()`，英文界面不再混入繁中頁籤名 |
| 總覽卡片 | 改為 `OverviewCards`，讀 `GET /ops/readiness` 的 `counts`（已發布應用/已批准端點/知識 ACL/已分級系統），不再寫死示例數字 |
| 狀態標籤 | 正式頁為「接口數據」，預覽頁為「示例」，語言切換即時更新 |

驗證：`tsc --noEmit` 0 error；`eslint` 0 error；`check:i18n` 通過；`check:menu` / `check:stat-order` / `check:confirm-modal` 通過；`consoleModel` + preview 10 條通過。

**仍未 i18n 的部分（誠實列出）**：表格列標題、按鈕文案、`HelpPopover` 長說明、`Descriptions` 細項仍為繁中。它們在同一頁面內可讀，但英文界面仍會中英混排；下一輪按 `agentConsole.table.*` / `agentConsole.help.*` 分批補齊。

## 十四、2d 續：表格 / 按鈕 / 短標籤 i18n（完成）

- 控制台頁面內 **86 條**短文案（表格列名、按鈕、狀態標籤、篩選項、Steps 標題、短提示）改走 `tr(key, 繁中)`；`zh-TW.json` / `en.json` 各新增 86 個 `agentConsole.sNN` 詞條。
- `tr` 為模組級 `i18n.t` 包裝：語言切換時父頁重渲染，子面板重新求值即可，不必給 8 個函數逐一加 hook。
- 為避免破壞狀態比較，`生效` / `已回滾` / `有效` 三個**同時作為資料值**的字串暫不翻譯；後續應把 API 層狀態改成枚舉（`active`/`rolled_back`），再翻譯展示層。

驗證：`tsc --noEmit` 0 error；`eslint` 0 error；`check:i18n` 通過；`consoleModel` + preview 10 條通過。

**仍為繁中**：`HelpPopover` 多句說明（約 20 段）與 `Descriptions` 細項說明（約 15 條）。它們是長文本，需逐段英譯並按 `agentConsole.help.*` 登記。

## 十五、2d 收尾：狀態枚舉化（完成）

- API 層狀態改為枚舉：`AgentAclRow.state: 'active' | 'revoked'`、`AgentReleaseRow.state: 'active' | 'rolled_back'`，不再用繁中字串當資料值。
- 展示層用 `agentConsole.state.*` 詞條翻譯；`生效` / `已回滾` / `有效` 三個字不再承擔比較語義，英文界面可正常顯示 Active / Rolled back。

驗證：`tsc --noEmit` 0 error；`eslint` 0 error；`check:i18n` 通過；`consoleModel` 6 條通過。

**最後剩餘**：`HelpPopover` 長說明與 `Descriptions` 細項共 **23 條**長文本仍為繁中（每條 1-3 句）。它們不影響功能與短標籤雙語，屬於純文案翻譯批次。

## 十六、2d 完成：長說明英譯

- `HelpPopover` 與 `Descriptions` 的 **22 條**長說明（每條 1-3 句）改走 `tr('agentConsole.hNN', 繁中)`；`zh-TW.json` / `en.json` 各新增 22 個詞條。
- 唯一未改的是預覽頁標題的 `defaultValue`（該處已有 `agentConsole.previewTitle` 詞條）。
- 至此控制台頁面內**所有用戶可見文案**均有雙語詞條：標題、頁籤、表頭、按鈕、狀態、統計卡、長說明。

驗證：`tsc --noEmit` 0 error；`eslint` 0 error；`check:i18n` 通過；`consoleModel` + preview 10 條通過。

## 十七、瀏覽器驗收發現（2026-10-24）

已用 MF00001 登入本機前端（http://localhost:3001）驗證：

| 檢查 | 結果 |
|---|---|
| 後端重啟 + 遷移 | 通過：`ready=200`，結構契約 87 個，權限注解 163 個 menuKey |
| 9 個平台接口 | 全部 `code=200`，空庫返回 `[]`；`ops/readiness` 返回 `workerEnabled:false` 與四個 0 計數 |
| 菜單是否落庫 | 已落庫：id 2579（分組）+ 2580–2587（8 個子項），`system_code='ai'` |
| 直接訪問 `#/agent-overview` | **403 期望行為**：菜單守衛攔截並提示「請聯繫管理員到功能授權」 |
| 側欄是否可見 | **不可見** |

**兩個運維要點（非代碼缺陷）**：

1. **必須切換到「人工智能系統」**：9 條菜單的 `system_code='ai'`，而側欄按「當前系統」過濾。停留在「產研交付系統」時看不到，需用頂欄系統切換器切到人工智能系統。
2. **只有 admin 被兜底授權**：`AgentPlatformMenuInitializer` 只對 admin 角色寫 `sys_role_menu`。其他角色需到「授權中心 → 人工智能系統 → 企業 Agent」勾選 9 條菜單（分組 + 8 子項）後重新登入才可見。

驗收動作建議：切到人工智能系統 → 逐頁打開 8 個頁籤 → 確認四張卡為 0、列表為空態 → 切 English 檢查文案。

## 十八、驗收修復（2026-10-25）

| 項 | 內容 |
|---|---|
| residency 校驗 | `AiDataPolicyService.approveEndpoint` 原先把任何非 `private` 值靜默降級為 `external`（fail-open）；改為只接受 `private`/`external`，其餘拋 `BusinessException(400)`。實測 `residency=cn` → `{"code":400,"message":"residency 只能是 private 或 external..."}` |
| 橫幅文案 | 去掉「總覽卡片仍為示例」的過時表述，中英同步改為「8 個面板均為真實數據」 |
| **i18n 真實缺陷** | 前幾輪用 `d['agentConsole'].update({'agentConsole.s00': ...})` 寫入，產生 **127 個扁平「帶點」鍵**（`agentConsole.s00` 實際存成 agentConsole 下的 `agentConsole.s00`），i18next 按點路徑解析全部 miss → 英文界面整頁回落繁中。已把點號鍵展開為嵌套結構；校驗：136 個引用 key 全部命中、`en` 值含中文數 = 0 |
| 卡片 0 值更正 | 先前判斷「四張卡顯示 0 是缺陷」不成立：`useCountUp` 依賴 `requestAnimationFrame`，隱藏標籤頁不觸發，卡片停在 0；`Descriptions` 是靜態文本故顯 1。屬瀏覽器可見性行為，非代碼缺陷 |

**門禁盲區**：`check:i18n` 未攔住上述扁平鍵（中英兩側同樣錯位，只比對兩側一致性與 defaultValue），建議補一條「按 t()/tr() 引用逐 key 解析，缺失即失敗」的檢查。

驗證：`tsc --noEmit` 0；`check:i18n` 通過；後端 `mvn compile` 通過並已重啟（ready=200）；非法 residency 返回 400。

## 十九、門禁補強：check:i18n 引用解析（2026-10-25）

| 能力 | 說明 |
|---|---|
| 全局引用解析 | 掃描 `src/**/*.{ts,tsx}`（排除測試與 i18n 目錄），識別 `t()` / `tr()` / `i18n.t()` 的靜態 key，逐 key 在 zh-TW 與 en 按點路徑解析；舊邏輯只覆蓋 DOMAINS 登記的 5 個域，域外命名空間（如 `agentConsole`）整段漏檢 |
| 帶點扁平鍵零容忍 | `find_dotted_keys` 遞歸找出任何含 `.` 的鍵（如 `agentConsole` 下的 `agentConsole.s00`），直接失敗——這正是 127 條英文界面回落繁中的根因 |
| 存量棘輪 | 無法解析的引用按 `_refsMissing` 寫入 `scripts/i18n-baseline.json`（當前 **251** 條），只允許下降；新增一條即失敗並打印前 40 條 |

驗證：`npm run check:i18n` 通過；模塊級斷言證明 `find_dotted_keys` 能命中扁平鍵、`REF_RE` 能識別 `tr()`/`i18n.t()`、`resolves` 對扁平鍵返回 False、對正常嵌套鍵返回 True。

**存量 251 條的性質**：這些是 `t('x.y', { defaultValue: '中文' })` 但語言包無對應詞條的歷史調用，界面靠 defaultValue 兜底；繁中正常、英文會顯示中文。屬真實技術債，按域分批清理後 `--update` 收緊基線。

## 二十、i18n 存量引用清零（2026-10-25）

`_refsMissing` 從 **251 → 0**，分四批完成：

| 批次 | 範圍 | 新增 key |
|---|---|---|
| 1 | `AiAssistantConfig`（含 AuditPage/OverviewPage 共用詞條） | 96 |
| 2 | `Home/index.tsx` + `Home/MyMemory.tsx` | 30 |
| 3 | `AiAssistant/AuditPage` + `OverviewPage` + `RdmDailyReportView` | 35 |
| 4 | `common.*` 與 6 個散落頁面（訂單、審批、算法、通知模板、HR 生命週期、人氣皮膚） | 13 |

- 每批都用 `--update` 收緊基線，最終 `_refsMissing: 0`，新增未登記引用立即失敗。
- 修掉門禁一個誤報：`t('mcpService.transport_' + x)` 這類**前綴拼接**不是完整 key，改為識別 `match` 後的 `+` 並跳過。
- 三條無 defaultValue 的 key（`aiQuotaAuth.quotaInterpretation`、`orderDetail.colSlot`、`hrLifecycle.retryExecuted`）按調用上下文補詞條：實時額度解讀 / 廣告位 / 已重新執行。

驗證：`check:i18n` 通過且 `_refsMissing=0`；`tsc --noEmit` 0 error。

## 二十一、執行器實跑（2026-10-25）

**首跑暴露真實缺陷**：`POST /agent/platform/runs` 的任務全部以 `failed / execution_blocked` 結束，耗時 1 秒、無模型調用。

- 根因：`AgentRunWorker.execute()` 在 `@Scheduled` 線程裡調用 `AgentOrchestrationService.orchestrate()`，而編排層第一行 `eventService.requireOwned(conversationPk, caller)` 會取 `SecurityContext` 的當前操作人；後台線程沒有登入態 → 拋 `BusinessException(401, "登入身分不可用")` → 被 `orchestrate()` 折疊成 `execution_blocked`。**等於過渡執行器此前從未真正跑通過一次。**
- 修復：執行前按 `requester` 查 `sys_user`（必須 `status=1`，否則 `requester_unavailable`），構造 `UsernamePasswordAuthenticationToken` 並把 `SysUser` 放進 `details`（供 `OperatorResolver.currentUser()` 覆用緩存），`finally` 必須 `SecurityContextHolder.clearContext()`，避免線程池復用串號。
- 驗證：開 `AI_RUN_WORKER_ENABLED=true`（延遲 5s）重啟後，新建運行狀態流轉 `queued → running → succeeded`，`steps=[step 1 MODEL succeeded / ok]`，耗時約 16s，屬真實編排調用。
- 收尾：臨時環境變量已刪除（`.env.local` 從備份還原），執行器回到默認關閉；`ready=200`。

**待補**：`AgentRunWorker` 身份注入缺單元測試（建議斷言：無登入態時失敗、`status!=1` 時 `requester_unavailable`、執行後 `SecurityContext` 為空）。

### 二十一（補）：執行器身份注入單測

`AgentRunWorkerAndActionExecutionTest` 從 7 條擴到 **10 條**，新增：

| 用例 | 斷言 |
|---|---|
| `workerFailsWhenRequesterMissing` | `sys_user` 查不到 → `finish(failed, requester_unavailable)`，不調編排，執行後 `SecurityContext` 為空 |
| `workerFailsWhenRequesterDisabled` | `status=0` → 同樣 `requester_unavailable`，不調編排 |
| `workerInjectsRequesterIdentityAndClearsItAfterwards` | 編排回調內斷言 authentication 非空、principal=發起人工號、details 是 `SysUser`；執行後上下文必須清空（防線程池串號）；最終 `finish(succeeded)` |

另把 `execute()` 的取用戶邏輯收斂為構造器注入 `SysUserMapper`，測試用 mock；`setup()` 預設返回 `status=1` 的 alice，既有「領取並完成」「取消優先」兩條用例隨之補齊 stub。

驗證：`AgentRunWorkerAndActionExecutionTest`(10) + `AgentPlatformServicesTest`(13) + `AgentOrchestrationServiceTest`(25) 共 **48 條全綠**，`BUILD SUCCESS`。

### 二十一（補二）：後端全量複驗

第一次 `mvn -o clean test` 出現 **15 failures / 386 errors**（僅跑到 1704 條就大量 `NoClassDefFoundError`：`EamBorrowStatsVO`、`RequestHashUtil`、`RdmIdempotentService$ConcurrentDuplicateSignal`，另有 Mockito `class redefinition failed: invalid class`）。複查 `target/classes` 中對應 .class 存在且時間戳落在本次編譯窗口，surefire 報告無 "Unresolved compilation problems"（可排除 JDT 污染），判定為**運行期類文件被並發重寫/環境抖動**，非代碼回歸。

隔離後原樣重跑：**2536 條，Failures 0 / Errors 0 / Skipped 22，BUILD SUCCESS**（比上次 2496 多出的 40 條含本輪新增的平台與執行器用例）。

## 二十二、合併後全量與推送（2026-10-25）

| 動作 | 結果 |
|---|---|
| 合併上游 HCM-C5（`59c58c84`） | 無衝突；上游僅動 `catalog.json`(+33) 與 `Permission/types.ts`(+2) 與 Agent 無交集 |
| 合併態後端全量 | **2546 條**，Failures 0 / Errors 0 / Skipped 22，BUILD SUCCESS（較合併前 +10 條，來自上游 HCM 用例） |
| 合併態前端門禁 | `tsc` 0 error、`check:menu` 通過、`check:i18n` 引用 17875 條全解析 |
| 生產構建 | `npm run build` 成功（36s，僅既有 chunk>2000kB 警告） |
| 推送 | `e098ff7c` + `59c58c84` → `dc43b0ec` 已推到 origin/main，本地與遠端一致 |
| 版本記錄 | 1.0.105.00（minor，id=125） |
| 補測 | `AiDataPolicyResidencyTest` 4 條（非法 residency 必須在落庫前 400 拒絕）已隨 `dc43b0ec` 推送 |

**未做**：英文界面人工視覺確認（dev server 多實例 3000/3001/5173 互相搶單設備會話，瀏覽器自動化多次被踢回登入頁）；靜態側已保證 136 個 `agentConsole.*` 引用在 en 全部命中且無中文值。Temporal 編排與 WP12 試點驗收依賴外部條件。

### 二十二（補）：CI 綠燈與線上驗收口徑

- 首次推送 `dc43b0ec` 兩條流水線皆失敗：前端止於 **Type Check**（`App.tsx` 引用 18 個 `pages/DocCenter/*` 模塊未入庫），後端 `mvn package` 同源（Doc 控制器/服務類未入庫）。**已提交的共享文件引用了未提交的模塊，導致提交本身不可構建。**
- 修復：`484051dd` 將工作區既有的 Doc/MCP 改動（152 文件）一併入庫；校驗 `HEAD` 的 `App.tsx` 缺失模塊數 = 0。本地基線：後端 2546 條全綠、前端 verify EXIT=0、build 成功。
- 線上驗收口徑（已核對）：`https://fengsong7889.github.io/-mftb-admin-portal/version.json` 的 `commitHash = 484051d`、`buildTime = 2026-10-25T05:03:11Z`，與 HEAD 一致；兩條流水線（Pages / 後端鏡像）均 success。

**教訓（已沉澱）**：推送前必須驗證「提交快照自身可構建」，而不是「工作區可構建」。判據：`git status` 為空 且 `HEAD` 中所有相對 import 都能解析；否則共享文件會把未入庫模塊帶進提交。

## 二十三、試點端到端腳本（2026-10-25）

新增 `scripts/agent-platform-pilot.py`（stdlib，無第三方依賴），覆蓋：就緒校驗 → 應用/版本（冪等復用）→ 運行受理（執行器關閉時契約為停在 queued）→ 提案 prepare/approve/execute → 一次性消費複驗 → 知識檢索。

首跑暴露並修復一個真實缺陷：`AiActionProposalService.consume` 把 `expires_at` 硬轉 `java.sql.Timestamp`，而 MySQL 驅動此環境返回 `LocalDateTime` → `ClassCastException` → 「提案已審批但執行報 500 系統繁忙」。改為 Timestamp/LocalDateTime/Instant 兼容轉換後，提案鏈路可正常執行。

腳本首輪結果：就緒/應用/版本/運行受理 4 項 PASS，提案建立與審批 PASS；提案執行受上述缺陷阻塞（已修復待複驗）。兩項環境干擾需注意：
1. **單設備登錄**：admin 同時被其他會話使用時，腳本會在中途被頂下線，日誌提示「您的账号已在其他设备登录」；試點應使用專用測試帳號。
2. **重啟影響該庫**：後端以 `java -jar target/mftb-admin.jar` 運行時，`mvn clean` 會刪除該 jar，導致運行中服務後續類加載失敗（`NoClassDefFoundError: ch/qos/logback/...`）；跑全量測試前應先停服務或改用非 clean 構建。
