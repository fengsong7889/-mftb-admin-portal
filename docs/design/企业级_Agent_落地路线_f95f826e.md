# 企业级 Agent 全面审查与分版本落地方案

## 一、结论与审查边界

**当前系统是“真实聊天＋少量业务工具＋较多 AI 管理配置”的阶段，还不能认定为可稳定服务各部门的企业级 Agent 平台。**

最大的差距不是模型数量或菜单数量，而是四个闭环没有完成：
1. **配置到执行：**模型、权限、额度和审批配置，必须真正约束每一次调用。
2. **数据到结论：**真实完整的数据、统一指标口径、证据引用，才能产生可信分析。
3. **触发到交付：**后台定时执行、失败处理、权限复核、消息回执，才能可靠地日报报送。
4. **上线到运营：**评测、审计、版本、回滚、责任人和业务收益，才能持续运行。

本方案范围：
- 首页“AI 智能助手”及代码定义的智能中心 **13 个叶子菜单**，包含关联后端、权限、迁移和测试情况。
- 四类场景均纳入，但按照数据就绪程度分层交付，不同时开放无人值守执行。
- 用户已确认**现有系统优先**；外部客服、消费订单、外部广告平台属于有条件接入。
- 已完成只读静态代码审查和官方资料调研；**未修改代码、未执行迁移、未发送消息、未验证生产数据库及在线配置，也未运行测试**。
- 下文“已实现”表示存在真实代码路径，不等于生产环境已配置成功。行业部分是代表性平台与规范对标，不声称穷尽整个行业。

## 二、首页 AI 智能助手审查

### 2.1 已有能力

关键入口：[首页助手](file:///Users/yangjingjing/Desktop/SARY/src/pages/Home/index.tsx#L673-L742)、[Agent 编排](file:///Users/yangjingjing/Desktop/SARY/src/api/agent.ts#L232-L279)。

| 能力 | 现状 | 对落地的意义 |
|---|---|---|
| 自然语言对话 | 存在真实模型调用链路 | 可以承担基础问答、文案及人工提供材料的分析 |
| 模型选择 | 可读取个人模型授权结果 | 选择列表有基础，但需补齐服务端强制授权 |
| 业务查询 | 账户余额、交易批次、财务审批三个内置工具 | 属于有限财务工具，不是全系统数据分析 |
| 工具调用 | 浏览器组织模型与工具循环，最多 5 轮 | 适合短交互，不能代替可恢复后台任务 |
| 查询完整性 | 三个查询固定第一页、每页 10 条 | 不得把局部结果当成全量统计 |
| 会话 | 数据库保存、切换、删除、回收站 | 具备跨设备使用基础 |
| 附件 | 图片 base64，其他附件主要按文本读取 | 不应宣称完整支持 PDF、Office、复杂表格解析 |
| 消息发送 | 邮件、钉钉存在执行器 | 需要配置、授权、回执和重试后才能用于业务报送 |

### 2.2 需要修改的交互与能力

首页保留轻量入口，增加完整 AI 工作台，与“智能体中心”共享同一执行服务：
- 展示按权限可用的部门助手：客服、运营活动、广告推广、人事物资/OA。
- 明确区分“问答”“数据分析”“生成方案”“申请执行”；不能通过聊天语义直接扩大权限。
- 展示来源、统计周期、数据截止时间、范围、指标定义及缺失数据。
- 展示可理解的执行步骤和工具结果：排队、执行中、待审批、成功、部分完成、失败、已取消。
- 长任务产生任务编号，关闭页面后继续运行；重新打开可恢复查看。
- 写操作展示对象、变更前后差异、数量、金额、影响范围及审批状态。
- 提供停止后续步骤、反馈、查看报告、订阅报告、跳转原业务页面；停止不承诺撤销已经完成的外部操作。
- 模型由服务端按已授权能力、预算和数据域路由；高级用户仍可在允许范围内指定模型。
- 保存原始消息与运行事件；上下文摘要单独存放，不能覆盖原始审计记录。
- 附件增加格式校验、容量限制、解析状态、访问控制；无法解析时明确失败。

**不把模型内部推理作为审计必需内容；审计记录输入摘要、调用参数、策略判定、业务证据和执行结果。**

## 三、智能中心全部现有菜单审查与处置

菜单来源：[菜单初始化](file:///Users/yangjingjing/Desktop/SARY/backend/src/main/java/com/mftb/admin/config/DataInitializer.java#L2194-L2213)；路由来源：[App 路由](file:///Users/yangjingjing/Desktop/SARY/src/App.tsx#L364-L399)。实际数据库启用、用户可见性仍需上线前核验。

| 现有菜单／路由 | 真实状态与主要问题 | 改造决定 | 版本 |
|---|---|---|---|
| 模型供应商 `/ai-model-provider` | 真实 CRUD、Key 加密脱敏；首页通道没有使用这套配置 | 接入统一服务端模型网关；增加连通性、凭据轮换、数据地域、停用联动 | V0 |
| 模型接入 `/ai-model-list` | 模型、价格、能力等配置可保存，不能证明协议和能力适配已接通 | 统一模型标识、协议适配、能力探测、价格版本和故障回退；不支持的能力不可选 | V0 |
| 部门模型权控 `/ai-dept-model-auth` | 部门策略可保存，能力及“不出域”限制未完整落实到执行 | 纳入统一策略计算；每次调用强制校验并提供生效解释 | V0 |
| 员工模型权控 `/ai-emp-model-auth` | 职位/角色授权真实，模型集合参与候选列表；能力约束不完整 | 与部门、员工例外统一求值，明确拒绝优先、有效期和授权来源 | V0 |
| 部门额度 `/ai-dept-quota` | 新策略保存路径与个人额度读取来源不一致 | 完成存量映射和唯一额度来源，不能只修改界面 | V0 |
| 员工额度 `/ai-emp-quota` | 职位/角色额度可以保存、计算；缺少执行端硬性拦截 | 接入预算预占、并发控制、实耗结算、超额拒绝 | V0 |
| 员工 AI 权额管理 `/ai-emp-permission` | 汇总和调整日志真实；能力开关保存方法为空 | 改为“员工有效权限与预算”视图；补齐能力持久化和执行验证，避免多处独立配置 | V0 |
| AI 操作授权 `/ai-operation-auth` | 列表、日志为 mock，启停仅前端状态，保存未接 API | 优先重建为真正的工具执行策略；试运行、人工确认、OA 审批分开管理 | V0 基础，V3 完整 |
| 能耗统计 `/ai-usage-stats` | 有调用、tokens、费用统计，不是物理能耗或正式账单对账 | 更名“用量与成本”；服务端计量，增加按 Agent、任务、部门、成功交付计费分析 | V0、V4 |
| 能耗明细 `/ai-energy-detail` | 真实明细；导出最多 1000 条，权限 key 与统计页面耦合 | 并入用量成本明细；按产品权限拆分查看/导出，导出不得静默截断 | V0、V4 |
| MCP 服务 `/ai-mcp-service` | 已安装 manifest、部分执行器真实；并非通用标准 MCP 客户端，部分目录项无执行器 | 改为“工具与连接器”，标明内置 API、消息通道、标准 MCP；安装与执行许可分离 | V0、V3 |
| 对话审计 `/ai-conversation-audit` | 可查询持久会话；客户端可覆盖内容，不是完整执行审计 | 扩展为“运行与安全审计”；服务端追加事件、脱敏、检索、留存及导出审计 | V0、V4 |
| AI 使用申请 `/ai-access-apply` | OA 流程真实；草稿在本地；审批通过未自动授予模型/额度，附件存在仅传数量情况 | 保留入口，审批仍用 OA；审批结果幂等授予、到期回收、真实附件留存、权限可追踪 | V0 |

历史 `/ai-pos-auth` 仍有演示页面，另有历史聚合入口。迁移时逐一处理旧链接和已分配权限：**先建立兼容映射，再隐藏重复入口，不直接删除旧权限 key。**

### 3.1 企业试点前必须解决的存量阻断

以下是落地优先级，不是声称由本轮改动引入的新缺陷。

1. **生产调用链待闭环。**[agent.ts](file:///Users/yangjingjing/Desktop/SARY/src/api/agent.ts#L39-L43) 固定同源 `/api/llm`，仓库内对应实现位于 [Vite 开发中间件](file:///Users/yangjingjing/Desktop/SARY/vite.config.ts#L371-L380)。未见仓库内完整的生产模型网关部署闭环；外部反向代理是否另有配置需核验，不能直接判定线上必然不可用。
2. **权限配置不等于调用限制。**[开发代理](file:///Users/yangjingjing/Desktop/SARY/vite.config.ts#L192-L220) 使用独立通道配置，未消费完整模型授权、额度和数据域策略。必须把强制检查放在真实调用入口。
3. **工具安装不等于执行授权。**[MCP 执行服务](file:///Users/yangjingjing/Desktop/SARY/backend/src/main/java/com/mftb/admin/service/impl/McpExecServiceImpl.java#L39-L54) 有安装、来源、执行器检查，控制器也有菜单权限，但缺少完整工具级策略、启停检查和审批凭证。不能描述成“完全没有权限”，也不能认为已经具备业务审批。
4. **数据隔离必须逐工具验证。**[财务账户查询](file:///Users/yangjingjing/Desktop/SARY/backend/src/main/java/com/mftb/admin/mapper/FinAccountMapper.java#L21-L42) 未带授权集团范围条件；相对地，[推广订单查询](file:///Users/yangjingjing/Desktop/SARY/backend/src/main/java/com/mftb/admin/service/impl/AdOrderServiceImpl.java#L104-L137) 已使用集团数据范围。不能用某个模块的安全性代表全系统。
5. **额度与员工能力存在断点。**[个人额度读取](file:///Users/yangjingjing/Desktop/SARY/backend/src/main/java/com/mftb/admin/service/impl/AiMyCenterServiceImpl.java#L225-L237) 仍使用旧配置来源；[员工能力保存方法](file:///Users/yangjingjing/Desktop/SARY/backend/src/main/java/com/mftb/admin/service/impl/AiEmpPermissionServiceImpl.java#L630-L637) 为空。
6. **使用申请未完成授权兑现。**[OA 审批路径](file:///Users/yangjingjing/Desktop/SARY/backend/src/main/java/com/mftb/admin/service/impl/OaRequestServiceImpl.java#L704-L750) 没有模型/额度授予操作，不能把“审批通过”显示成“能力已开通”。
7. **统计不能依赖客户端自报。**[用量接口](file:///Users/yangjingjing/Desktop/SARY/backend/src/main/java/com/mftb/admin/controller/LlmUsageController.java#L38-L46) 允许登录用户上报本人用量；[计费服务](file:///Users/yangjingjing/Desktop/SARY/backend/src/main/java/com/mftb/admin/service/impl/LlmUsageServiceImpl.java#L67-L94) 对缺失价格记零。应区分已核实、估算、未知，未知费用不能伪装为免费。
8. **“保存”“已发送”不等于可审计或已送达。**[会话压缩](file:///Users/yangjingjing/Desktop/SARY/src/pages/Home/index.tsx#L758-L789) 会覆盖历史消息；[钉钉 handler](file:///Users/yangjingjing/Desktop/SARY/backend/src/main/java/com/mftb/admin/service/impl/DingTalkExternalHandler.java#L48-L55) 与[异步发送](file:///Users/yangjingjing/Desktop/SARY/backend/src/main/java/com/mftb/admin/service/impl/DingTalkServiceImpl.java#L125-L138) 没有形成端到端送达状态。

## 四、行业对标：成熟企业 Agent 需要什么

### 4.1 官方资料反映的共性

| 对标资料 | 可借鉴的能力 | 本项目落点 |
|---|---|---|
| [Anthropic：Building Effective Agents](https://www.anthropic.com/engineering/building-effective-agents) | 区分确定性工作流与自主 Agent，从简单、可验证的流程开始 | 日报和审批用固定流程；开放式方案分析才使用受限 Agent |
| [Microsoft：安全与治理](https://learn.microsoft.com/en-us/microsoft-copilot-studio/security-and-governance) | 身份、连接器、知识来源、数据政策、审计、生命周期、成本治理 | 不只管模型，还要管 Agent 身份、数据流动、发布和执行 |
| [Microsoft：自主 Agent 设计](https://learn.microsoft.com/en-us/microsoft-copilot-studio/guidance/autonomous-agents) | 后台触发、清晰职责、最小权限、渐进放权、关键动作人工监督 | 定时任务、事件触发和失败兜底属于产品核心能力 |
| [AWS AgentCore：策略与评测](https://aws.amazon.com/blogs/aws/amazon-bedrock-agentcore-adds-quality-evaluations-and-policy-controls-for-deploying-trusted-ai-agents/) | 工具执行前在模型之外实施策略，关联运行轨迹与评测 | 服务端策略引擎、工具执行审计、业务结果评测 |
| [Dify：知识检索](https://docs.dify.ai/en/cloud/use-dify/nodes/knowledge-retrieval)、[人工输入节点](https://docs.dify.ai/en/cloud/use-dify/nodes/human-input) | 检索、引用、元数据过滤、暂停等待人工、超时分支 | 企业知识库与可恢复审批；自动元数据过滤不能替代服务端 ACL |
| [阿里云 Model Studio：Agent 与 Workflow](https://www.alibabacloud.com/help/en/model-studio/application-introduction) | 对话式任务与固定流程应用分开建设 | 部门助手与报送工作流共用底座，避免全部任务交给自由规划 |
| [MCP：工具注解的能力边界](https://blog.modelcontextprotocol.io/posts/2026-03-16-tool-annotations/) | 工具风险标签只是提示，不能代替授权和网络限制 | “只读”标签、安装成功、弹窗确认都不能成为安全保证 |
| [OWASP Agentic Top 10](https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/)、[Agent 评测方法](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) | 安全威胁建模；结合代码校验、业务专家与模型评分，验证真实结果 | 对提示注入、越权、错误执行和回归建立用例，不能只看回答是否流畅 |

上述资料用于能力对标，**不是采购建议，也不是这些平台能直接满足本公司权限和合规要求的证明**。部分功能存在地区、版本或商业限制。

### 4.2 本项目遗漏的核心能力

1. **智能体管理：**职责、业务负责人、模型、提示词版本、工具范围、知识范围、预算、发布状态。
2. **企业知识：**制度、FAQ、活动规范、推广产品说明、文档版本、有效期、责任人、引用和撤回。
3. **数据与指标：**数据目录、业务指标口径、完整聚合、数据质量、更新时间、组织/字段权限。
4. **后台运行：**持久任务、定时/事件触发、重试、取消、超时、并发、预算、恢复和人工介入。
5. **报告订阅：**模板、时间范围、负责人、收件人、渠道、审批、历史报告、投递结果。
6. **受控执行：**工具级授权、动作分级、参数校验、预览、审批、幂等、结果核验和补偿。
7. **可观测与评测：**运行轨迹、业务成功率、检索质量、错误样本、模型/提示词变更回归。
8. **应用生命周期：**草稿、测试、发布、灰度、停用、回滚、变更审批、责任移交。
9. **安全与运营：**敏感字段、数据外发、审计留存、凭据管理、告警、事件处理和业务收益。

企业级不要求一开始就建设模型训练、GPU 管理、公开 Agent 商城、自由多 Agent 群聊或电脑自动操作；这些不是本需求的首要缺口。

## 五、目标菜单结构

目标是“员工好用、部门可管理、平台可治理”，不把所有配置都放给普通员工。原来的授权、额度等细分页面收敛为 Tab 和详情页，减少重复菜单。

| 分组 | 目标菜单 | 核心功能 | 首次版本 |
|---|---|---|---|
| 工作与交付 | 智能体中心 | 使用已发布部门助手；管理端配置职责、负责人、工具和版本 | V1 |
| 工作与交付 | 任务运行中心 | 我的任务、部门任务、运行步骤、人工介入、失败重试、结果 | V1 基础，V2 完整 |
| 工作与交付 | 报告与订阅 | 手动报告、定时报送、收件范围、报告历史、投递记录 | V1 手动，V2 定时 |
| 知识与数据 | 企业知识库 | FAQ/制度、文档、权限、审核发布、引用、失效及检索测试 | V1 |
| 知识与数据 | 数据与指标 | 数据目录、指标定义、数据质量、可用工具、权限及更新时间 | V1 |
| 编排与集成 | 工作流管理 | 先固定模板，后提供受控可视化编排及版本 | V2 模板，V3 编辑 |
| 编排与集成 | 工具与连接器 | 改造 MCP 服务；内置 API、标准 MCP、消息渠道、健康与权限 | V0 起 |
| 模型与资源 | 模型中心 | 合并展示供应商和模型，增加能力测试、价格及路由策略 | V0 |
| 模型与资源 | 模型与能力授权 | 部门、职位、角色、员工例外、有效权限解释 | V0 |
| 模型与资源 | 预算与配额 | 部门/员工预算、预占实耗、阈值、调整与到期 | V0 |
| 模型与资源 | 用量与成本 | 统计与明细、部门/Agent/任务成本、对账、导出 | V0 起 |
| 治理与质量 | 执行授权与审批 | 操作策略、预授权范围、待审批联动、审批兑现记录 | V0 基础，V3 完整 |
| 治理与质量 | 运行与安全审计 | 对话、模型请求、工具、审批、外发、权限拒绝和变更日志 | V0 起 |
| 治理与质量 | 评测与发布 | 测试集、回归、业务评分、版本发布、灰度与回滚 | V1 基础，V4 完整 |
| 个人入口 | AI 使用申请 | 继续复用现有 OA 申请，不另建重复审批引擎 | V0 修复 |

补充边界：
- 首页助手不是第二套 Agent 系统，只是智能体中心的快捷入口。
- 通知渠道配置复用现有钉钉/邮件基础设施；在工具与连接器中提供关联配置和健康状态，不再建另一套凭据管理。
- 客服专用收件箱在真实客服渠道接入后建立；运营、广告、人事业务详情继续进入原模块，不在 AI 中复制完整业务后台。
- 提示词、记忆、模型路由、知识检索设置先放在相应详情 Tab，不机械扩展为更多菜单。

## 六、四类部门场景与数据前提

| 场景 | 当前可复用基础 | 首批交付 | 后续闭环与门槛 |
|---|---|---|---|
| 客服 | 基础对话；可建设审核后的产品和制度 FAQ | 内部客服回复建议、知识引用、咨询分类、人工接管提示 | 接通真实消息、客户身份和订单后，才开放低风险自动回复；退款、赔付仍走审批 |
| 运营活动 | 现有推广产品、算法、定价等业务接口 | 活动方案、文案草稿、预算测算、规则检查；事实和假设分开 | 有活动执行记录、效果数据和归因口径后，形成策划—审批—执行—复盘 |
| 广告推广 | 真实推广订单、销售、库存、计价等基础 | 推广订单结构分析、销售/退款异常、库存与产品组合建议 | 经审批辅助创建或调整业务；ROI、ROAS 优化须先具备真实曝光、点击、转化和费用数据 |
| 人事、物资、OA | 组织员工、资产/耗材、真实盘点、OA 引擎 | 制度问答、资产闲置/借用逾期分析、耗材预警、流程提醒 | 辅助起草采购、领用、盘点等流程；不得自动确认实物存在、自动改薪酬或直接认定责任 |
| 跨部门经营报送 | 财务聚合、推广订单、资产耗材统计 | 真实可用指标的人工生成日报 | 后台按时间和范围自动汇总、审核、发送、记录结果 |

### 数据真实性的两条红线

- [推广概览](file:///Users/yangjingjing/Desktop/SARY/src/pages/PromotionReport/Overview/index.tsx#L23-L50) 和[推广订单报表](file:///Users/yangjingjing/Desktop/SARY/src/pages/PromotionReport/OrderReport/index.tsx#L28-L56) 使用 mock。**V1 可从已验证的真实业务 API 新建只读聚合，不能直接把演示报表接入 Agent。**
- 已发现的 `/api/ad/orders` 是推广订单，不等于外卖、零售或消费者交易订单。未确认来源前，消费订单分析在界面标记“未接入”，不能用推广订单替代。

AI 能做资产账面异常分析和盘点任务辅助，不能仅靠数据库证明实物实际存在。

## 七、核心实施架构与执行规则

### 7.1 采用现有系统内扩展，不整体替换平台

继续使用 React + Spring Boot + MySQL，复用现有登录、组织、业务 API、OA 和通知能力。首期不另起 Python Agent 平台，不把企业权限复制到外部编排平台。

```text
首页 / 智能体中心 / 定时与事件触发
              ↓
Spring Boot Agent 运行服务
              ↓
身份、数据范围、执行策略、预算检查
              ↓
模型网关 / 企业知识 / 受控业务工具
              ↓
需要时进入 OA 人工审批，再次校验后执行
              ↓
结果核验 → 报告产物 → 投递记录
              ↓
统一运行事件、成本、审计与评测
```

前端只负责交互和展示；模型循环、工具参数校验、密钥、预算及真实执行全部移到后端。生产请求复用业务 API 基址与鉴权，不依赖 Vite 中间件。

### 7.2 权限与动作分级

有效权限是**当前执行身份的业务权限 ∩ Agent 被授予范围 ∩ 本任务范围 ∩ 数据安全策略**；显式拒绝优先。身份、角色、能力和预算的推导结果可解释、可测试。

| 动作 | 放行规则 |
|---|---|
| 只读查询、知识问答 | 通过工具级权限、组织范围、字段限制后执行 |
| 保存个人草稿 | 用户明确确认后保存，不触发业务生效 |
| 定时报告投递 | 订阅创建时审批固定模板、范围、收件对象；每次执行复核 |
| 广告下单、预算调整、采购提交、资产变更等业务写入 | 服务端审批凭证＋执行前复核＋业务幂等＋结果核验 |
| 退款转账、薪酬/人事重大决定、不可逆批量动作 | 首期不开放无人值守执行，继续由原业务流程人工处理 |

批准后执行时，校验审批对象、参数摘要、版本、期限、额度与当前权限；对象或参数发生变化必须重新审批。重放、过期、撤销、权限失效均拒绝。

复用业务服务时显式执行原有业务权限和数据范围校验，不能因为绕过 Controller 而跳过拦截。

### 7.3 数据与知识

- 结构化数字由经过校验的聚合服务计算，模型负责解释；首期不提供任意 SQL、通用 Shell 或不受限代码执行。
- 每个指标登记公式、币种、时间口径、排除规则、范围、刷新时间、负责人和源接口。
- 输出保留数据快照/查询证据标识；分页采样与全量聚合必须在结果中区分。
- V1 知识库限定审核发布的结构化 FAQ、制度条目和可提取文本的文档；使用 MySQL 保存元数据、条目和 ACL，以 ngram 全文检索及关键词规则提供基础检索。扫描件、复杂多模态、大规模语义检索不作为首期承诺。
- 在检索前注入服务端授权范围，返回后复核文档权限；知识引用附版本、有效期和来源。
- 数据域限制同时覆盖模型、附件、检索处理、日志与外发。禁止某域数据出网时，没有合规处理通道就拒绝处理，不自动回退到外部模型。
- 身份证、联系方式、薪酬等敏感字段按用途最小化提供；知识、报告与附件的删除/失效必须同步影响检索与下载。

### 7.4 后台任务与报送

- V2 使用 **Quartz JDBC JobStore + MySQL** 管理定时触发、集群和错过触发；业务运行状态、步骤检查点及投递 outbox 由本系统持久化。
- 不把长任务放在浏览器定时器，不在一个数据库事务中等待模型或外部网络返回。
- 运行绑定发布版本、订阅授权和执行身份；人员离职、授权撤回、Agent 停用后停止新的运行及未执行步骤。
- 保存时区、统计窗口、数据截止时间；UTC 存储时间，按订阅的显式 IANA 时区计算业务日，不跟随浏览器隐式变化。
- 按“订阅＋统计窗口＋版本”生成唯一运行；按“报告＋收件对象＋渠道”管理投递幂等。失败重试与人工重跑要区分。
- 区分排队、执行、待审批、失败、部分成功、渠道受理、未知结果；渠道没有送达/已读回执时不得声称已送达/已读。
- 对外部发送超时但可能已成功的情况进入待核验状态，不盲目重复发送；不承诺跨外部系统绝对 exactly-once。
- 报告访问按收件人权限控制，不能沿用生成者全部权限。敏感报告默认发送摘要和需登录链接；群成员范围不明确时不发送敏感正文。
- 模型不可用时可交付确定性数字报表并注明“智能解读未生成”；数据源不完整时标记部分结果或失败，不能编造补齐。

### 7.5 可靠计费、审批与审计

- 每次请求原子预占预算，按服务端取得的实际用量结算；部门和员工上限同时生效，币种分开核算。
- 失败或取消仍可能已消耗模型费用，按真实结果结算，不一律退款。
- 会话消息与运行事件分开存储；保留旧会话兼容读取，新审计由服务端追加，普通客户端不得覆盖。
- 基础对象包括智能体及版本、工具授权、运行及步骤、审批绑定、预算流水、知识版本、报告、订阅、投递记录、评测用例与结果。
- 日志按最小必要脱敏；审计访问、导出、留存、清理与备份均有权限及记录。明确留存政策后才能正式上线敏感数据场景。
- 外部工具连接采用受控地址与出站限制，密钥不交给模型；工具返回、文档、邮件内容均按不可信数据处理，不能成为扩大权限的指令。

## 八、分版本实施路线

采用验收门槛推进，不在缺少团队容量、数据规模和部署条件时承诺日历日期。

### V0：可信底座与现有菜单纠偏

**目标：已有功能真实生效，具备受控内部试点条件。**

实施顺序：
1. 核验生产模型入口、菜单数据库状态、迁移版本和现有授权数据；形成只读差异清单。
2. 建服务端模型网关与运行入口，迁移浏览器工具循环；接通模型供应商、模型接入配置。
3. 统一部门/职位/角色/员工授权与额度来源；补齐员工能力保存、执行校验和预算流水。
4. 重建 AI 操作授权最小后端，接通现有三个内置工具的权限及数据范围；工具启停立即约束执行。
5. 补齐 AI 使用申请审批后的授权兑现、期限、幂等及附件。
6. 改造用量统计、会话审计和通知状态；演示功能明确标记或隐藏。
7. 建立最低限度自动化测试和紧急停止入口。

验收：
- 绕过前端直接请求仍受模型、工具、数据范围、能力和预算限制。
- 并发请求不能突破预算；未知成本有明确状态。
- 无权用户不能获得跨集团数据；工具停用、人员停用立即阻断后续调用。
- 审批仅生效一次，过期回收；失败不能显示授权成功。
- 生产构建不依赖开发代理；至少完成一个真实只读工具的端到端验证。

暂不开放：无人值守发消息、业务写操作、对外客服自动回复。

### V1：四部门智能辅助与可信手动报告

**目标：员工和负责人获得可验证的第一批价值。**

新增：智能体中心、知识库、数据与指标、基础任务中心、手动报告、基础评测与发布。

交付顺序：
1. 先接入财务、推广订单、资产耗材的真实只读聚合，交付手动经营/资产报告。
2. 发布人事制度/物资助手和内部客服 FAQ 助手，知识由业务负责人审核。
3. 发布运营活动方案、广告推广分析助手，明确事实、预测、假设及缺失数据。
4. 四类助手都有任务边界、责任人、工具白名单、知识范围、预算和发布版本。

验收：
- 每份数字报告能追溯到完整范围的真实查询；不是前 10 条样本分析。
- 每类助手至少建设 30 条经业务审核的核心用例；必须包括无数据、无权限、歧义和错误诱导场景。
- 建议首轮门槛：关键数字与确定性查询结果一致；受控知识问答正确且引用有效比例不低于 90%；越权泄露用例为零容忍。该门槛是项目目标，不是当前测得结果。
- 无依据时明确无法判断；客服回复由人工确认，业务写入仅引导到原页面。

### V2：每日自动报送与后台运行

**目标：实现“每天整理数据，定时发送给指定负责人”。**

新增/完善：工作流模板、报告订阅、完整任务中心、投递记录与运行告警。

首批固定模板：
- 推广订单及财务经营日报：销售、订单状态、退款/异常等已经确认口径的指标。
- 资产耗材日报：闲置、借用逾期、维修、耗材低库存及费用。
- OA 待办/超时汇总：只读取确有权限的流程信息。
- 客服与活动日报仅在已有真实业务记录时上线，不自动生成不存在的数据。

交付完整链路：定时触发 → 权限复核 → 取数 → 口径校验 → 解读 → 报告留存 → 受控投递 → 回执/异常处理。

验收：
- 关闭浏览器仍能执行，服务重启和双实例不会产生重复业务运行。
- 覆盖错过触发、数据迟到、模型超时、预算不足、通知失败、部分成功及授权撤回。
- 先进行 14 个业务日内部试运行：每个应执行窗口均有终态记录；无静默丢单、无已知成功记录重复发送；未知结果可见并进入核验。
- 正式运营建议目标：在数据源和渠道可用条件下，约定时间窗内完成率不低于 99%；同时展示包含上游故障的总体结果，不能只展示过滤后的成功率。

### V3：审批后执行与部门业务闭环

**目标：从“提供建议”升级为“经授权帮助完成业务”。**

完善：执行授权与审批、受控工作流编辑、工具版本、业务回执及补偿。

先开放三种有限能力：
1. 运营/广告：生成方案和变更预览，审批后调用已验证的现有业务 API；上线前核对价格、库存、预算与对象状态。
2. 人事/物资/OA：起草并提交允许的申请，跟踪审批及办结；不自动作出人事决定或认定实物盘点结果。
3. 客服：内部工单/回复建议流转；有真实渠道、身份映射和测试沙箱后，才开放白名单 FAQ 自动回复与人工接管。

工作流仅开放受控节点：查询、检索、确定性汇总、模型生成、条件判断、人工审批、业务工具、通知、结果检查。复用 OA，不再造审批引擎；未知自定义代码节点不开放。

验收：
- 参数修改、审批过期、权限撤销、重复请求和状态冲突不能造成未授权或重复业务变更。
- 一次执行能核验真实业务状态，不以模型声称“完成”为成功依据。
- 失败后明确哪些步骤已经生效；有人工接管及可用的补偿流程，不虚构事务回滚能力。
- 写操作先沙箱、再人工确认灰度；未达到门槛的具体工具保持只读或草稿模式。

### V4：企业运营化与有条件外部扩展

**目标：可持续、多部门运行，具备可审计、可优化、可回滚的企业能力。**

完善：
- 评测集、线上采样、业务反馈、质量漂移告警、提示词/模型/工具/知识版本联动。
- 环境隔离、灰度发布、版本回滚、紧急停用、故障演练及备份恢复。
- Agent 与部门成本分摊、供应商对账、异常费用预警、单次成功交付成本和节省工时。
- 权限定期复核、人员离职移交、知识责任人、过期知识下线、审计留存和安全事件流程。
- 知识检索持续用命中率和引用正确性优化；只有基础检索不能达到指标时才立项高级语义/多模态检索扩展，不为“企业级”标签预先引入额外基础设施。

外部扩展作为独立接入包，须分别过门槛：
- 客服平台：消息 API、签名验证、客户身份映射、重复消息处理、人工接管及会话留存。
- 消费订单：稳定订单标识、支付/退款状态、权限、更新机制、测试数据及指标口径。
- 外部广告：授权账户、预算约束、效果数据、归因规则、平台 API 限额与回滚边界。

验收：
- 任一生产运行可追溯到 Agent/工作流版本、模型、工具、知识/数据版本、权限决策和结果。
- 发布前完成回归，质量下降可停止扩量并回滚；历史任务继续绑定原版本。
- 有按月复盘的业务指标和责任人：客服采纳/解决质量、活动方案采纳与实际效果、推广异常处理效率、资产问题处理周期、报送准时率与成本。
- “成熟”的判定是通过这些运营门槛，不是新增菜单全部点亮，也不是实现完全自主。

## 九、跨版本测试与发布要求

测试从 V0 开始建设，不等到 V4：
- 权限：跨集团、部门、员工、字段、附件、报告、导出、工具、后台执行身份。
- 安全：提示注入、恶意工具返回、敏感数据外发、外部地址绕过、审批重放、预算并发绕过。
- 正确性：分页和聚合、时间边界、币种、退款/取消排除、数据缺失、知识失效及引用。
- 可靠性：模型/业务/通知故障，任务重启恢复、重复触发、取消、租约失效、未知发送结果。
- 业务结果：真实订单/申请/报告是否存在且状态正确；不以聊天文本作为最终判断。
- 模型质量：确定性断言＋业务专家审核＋经人工校准的模型评分；记录延迟、tokens、成本和失败原因。

现有 AI 测试主要有接口权限覆盖，例如 [UnprotectedApiAuditTest](file:///Users/yangjingjing/Desktop/SARY/backend/src/test/java/com/mftb/admin/security/permission/UnprotectedApiAuditTest.java#L258-L299)；不能代替上述真实链路测试。

实施时遵循项目要求：
- 前端执行 typecheck、lint 和相关 Vitest；后端执行编译与 JUnit，并增加集成测试。
- 数据库沿用 MySQL 8；新增迁移在 `backend/src/main/resources/db/migrations/catalog.json` 登记，使用幂等执行与后置校验，关键结构登记契约。
- 老表和菜单按兼容迁移处理，迁移前备份；不直接破坏存量会话、权限和额度记录。
- 新增/编辑/详情采用独立页面，遵循现有表单与 UI 规范；确认弹窗只是交互，不能替代服务端审批。
- 上线验收覆盖真实生产部署路径、数据库就绪和外部渠道沙箱，不以本地开发成功替代。

## 十、组织配合与首批执行清单

### 责任分工
- 平台负责人：网关、执行、权限、预算、调度、审计和发布。
- 各部门业务负责人：首批场景、知识/指标口径、风险范围、用例及业务验收。
- 数据负责人：数据真实性、刷新规则、组织范围、敏感字段及源系统变更。
- 安全/合规负责人：模型数据使用条款、数据地域/跨境、收件范围、留存与高风险动作政策。
- 运维负责人：凭据、部署、监控、备份、恢复和故障响应。

未确认的外部接口、数据合规和团队容量作为上线依赖记录；不视为已经具备。

### 最先执行的八项工作
1. 核验生产调用链、菜单、迁移和数据来源，确认演示与真实边界。
2. 将模型和工具执行迁到后端，接通现有模型配置。
3. 修复权限、能力、额度唯一来源和服务端强制控制。
4. 重建 AI 操作授权，完成现有工具的数据范围验证。
5. 修复 OA 使用申请授权兑现、会话审计和可信计量。
6. 建立三个真实只读聚合：推广订单、资产耗材、财务经营。
7. 上线四部门受控辅助助手和带证据的手动报告。
8. 在此基础上交付持久调度、日报订阅和可靠投递，再逐工具开放审批后执行。

**最终路线：V0 可信底座 → V1 四部门辅助 → V2 定时报送 → V3 审批后执行 → V4 企业运营化。**

---

## 附录 A：V0 只读盘点结果（执行确认）

本轮按 §八 V0 第 1 步在仓库源码内静态核验，未连生产库；下表结论与 §二、§三、§3.1 完全一致，无需修订方案；生产环境是否另有反代、`sys_config.ai_model_*_accounts` 白名单实际取值仍需在部署时二次确认。

| 盘点项 | 关键发现 | 证据 |
|---|---|---|
| 生产 `/api/llm` 入口 | Spring Boot **不存在** Controller；仅有 `LlmUsageController` 落库；实际实现位于 Vite 中间件 | [agent.ts#L39-L43](file:///Users/yangjingjing/Desktop/SARY/src/api/agent.ts#L39-L43)、[vite.config.ts#L361-L460](file:///Users/yangjingjing/Desktop/SARY/vite.config.ts#L361-L460) |
| 13 个 AI 叶子菜单 | 11 个真实 CRUD/统计；**1 个全 mock**（AI 操作授权）；**1 个仅 OA 无发放**（AI 使用申请） | [DataInitializer.java#L2194-L2213](file:///Users/yangjingjing/Desktop/SARY/backend/src/main/java/com/mftb/admin/config/DataInitializer.java#L2194-L2213)；mock 见 [AiOperationAuth/index.tsx](file:///Users/yangjingjing/Desktop/SARY/src/pages/AiOperationAuth/index.tsx) |
| 部门额度断链 | 保存走 `ai_dept_quota_policy`，用量计算读旧 `ai_quota_config` | [AiDeptQuotaServiceImpl.java#L58-L90](file:///Users/yangjingjing/Desktop/SARY/backend/src/main/java/com/mftb/admin/service/impl/AiDeptQuotaServiceImpl.java#L58-L90) vs [AiMyCenterServiceImpl.java#L226-L247](file:///Users/yangjingjing/Desktop/SARY/backend/src/main/java/com/mftb/admin/service/impl/AiMyCenterServiceImpl.java#L226-L247) |
| 员工能力开关 | 保存方法空实现，UI 修改丢失 | [AiEmpPermissionServiceImpl.java#L630-L637](file:///Users/yangjingjing/Desktop/SARY/backend/src/main/java/com/mftb/admin/service/impl/AiEmpPermissionServiceImpl.java#L630-L637) |
| AI 使用申请发放 | 审批通过仅更新 formData，含 `TODO: 处理审批即授权逻辑` | [OaRequestServiceImpl.java#L704-L712](file:///Users/yangjingjing/Desktop/SARY/backend/src/main/java/com/mftb/admin/service/impl/OaRequestServiceImpl.java#L704-L712) |
| MCP 执行侧授权 | 只校验 installed/source/handler；无工具级 enabled、审批凭证、数据范围 | [McpExecServiceImpl.java#L39-L54](file:///Users/yangjingjing/Desktop/SARY/backend/src/main/java/com/mftb/admin/service/impl/McpExecServiceImpl.java#L39-L54) |
| MCP 现有 handler | 仅 2 个：`DingTalkExternalHandler`、`EmailExternalHandler` | grep `implements McpExternalHandler` |
| 会话审计 | 同 Controller 提供 PUT 覆写 messages，客户端可覆盖历史 | [AiConversationController.java#L44-L49](file:///Users/yangjingjing/Desktop/SARY/backend/src/main/java/com/mftb/admin/controller/AiConversationController.java#L44-L49) |
| 用量上报 | 任何登录账号 POST 自报 tokens；缺单价记 0 | [LlmUsageController.java#L38-L47](file:///Users/yangjingjing/Desktop/SARY/backend/src/main/java/com/mftb/admin/controller/LlmUsageController.java#L38-L47)、[LlmUsageServiceImpl.java#L88-L93](file:///Users/yangjingjing/Desktop/SARY/backend/src/main/java/com/mftb/admin/service/impl/LlmUsageServiceImpl.java#L88-L93) |
| 财务账户数据范围 | Mapper 未见集团范围条件 | [FinAccountMapper.java#L21-L42](file:///Users/yangjingjing/Desktop/SARY/backend/src/main/java/com/mftb/admin/mapper/FinAccountMapper.java#L21-L42) |
| 推广订单数据范围 | 有集团数据范围 ✅，作为参照样板 | [AdOrderServiceImpl.java#L104-L137](file:///Users/yangjingjing/Desktop/SARY/backend/src/main/java/com/mftb/admin/service/impl/AdOrderServiceImpl.java#L104-L137) |
| 钉钉投递 | 异步发送，失败仅日志，工具立即返回已发送 | [DingTalkServiceImpl.java#L125-L138](file:///Users/yangjingjing/Desktop/SARY/backend/src/main/java/com/mftb/admin/service/impl/DingTalkServiceImpl.java#L125-L138) |
| AI 迁移登记 | `catalog.json` 15 条中无 AI 独立版本；所有 AI 建表落在 `core:schema-v10` | [catalog.json](file:///Users/yangjingjing/Desktop/SARY/backend/src/main/resources/db/migrations/catalog.json) |

## 附录 B：V0 Sprint 1 具体实施包

**目标**：闭环 §八 V0 步骤 2–5 与 §3.1 前 6 条阻断项。生产模型网关与工具/额度/发放一起推进，避免仅补网关仍留配置空转。

### B.1 生产模型网关与后端编排（A）
- 新增 `com.mftb.admin.controller.AgentGatewayController`：`POST /api/agent/chat`、`GET /api/agent/status`、`GET /api/agent/balances`。
- 新增 `com.mftb.admin.service.agent.LlmChannelRouter`：从 `ai_provider` + `ai_model` 读通道，取代 Vite 中间件的 `VITE_LLM_*`；沿用 `sys_config.ai_model_qw_accounts` / `ai_model_ds_accounts` 白名单。
- 新增 `com.mftb.admin.service.agent.AgentOrchestrationService`：迁移 `agent.ts` 中 `MAX_TOOL_ROUNDS` 语义、System Prompt 拼装、多轮回填；前端只调用 `/api/agent/chat`。
- 新增 `com.mftb.admin.service.agent.BudgetReservationService`：请求进入时按 `Dim` 预占 tokens/费用，返回后按服务端观测的实际用量结算；结算流水落入新表 `ai_budget_ledger`。
- 迁移 `agent.ts` 编排入口至新链路；旧 Vite 中间件保留但只用于本地开发（`import.meta.env.DEV` 判断）。
- 迁移版本键：`ai:gateway:v1.0`；`ContractRegistry` 登记 `ai_gateway_route_contract`（`ai_budget_ledger` 建表 + `ai_provider.api_key_cipher` 存在性）。

### B.2 AI 操作授权去 mock（B）
- 新表 `ai_tool_policy`：`tool_key` PK、`enabled`、`risk_level`、`require_approval`、`data_scope_json`、`updated_by`、`updated_at`。
- 新表 `ai_tool_exec_log`：记录每次工具执行的 caller/参数摘要/决策结果/耗时/成功失败。
- `McpExecServiceImpl.execute` 前置：查 `ai_tool_policy`；无记录视为未授权拒绝；`enabled=0` 拒绝；`require_approval=1` 时要求携带 `X-Approval-Token`（V0 阶段仍允许 L3 弹窗产生的临时凭证，V3 接 OA）。
- 内置 3 工具（`query_account_balance` / `query_batches` / `query_approvals`）种子入 `ai_tool_policy`，`risk_level=low`，`enabled=1`。
- 前端 `AiOperationAuth/index.tsx` 换真接口；`AiOperationAuthEdit.tsx` 保存 `data_scope_json`；`AiOperationAuthLog.tsx` 读 `ai_tool_exec_log`；`api/mock/aiPlatformMock.ts` 保留但仅归档使用。
- 迁移：`ai:operation-auth:v1.0`。

### B.3 额度与员工能力闭环纠偏（C）
- 新增 `AiEffectivePolicyService`：合并 `ai_dept_quota_policy`、`ai_emp_quota_policy`、`ai_role_quota_policy`、`ai_quota_override` 与旧 `ai_quota_config`；同一目标下取并集，显式拒绝优先；输出可解释的 `Dim`。
- `AiMyCenterServiceImpl.collectConfigDimensions` 改走该服务，移除对旧表的直接依赖（旧表保留 6 个月只读兼容）。
- `AiEmpPermissionServiceImpl.setCapabilityField` 补表 `ai_employee_auth.capability_json`（JSON 列，字段与 `AiModel` 能力对齐）；空实现改为持久化 + 后置校验。
- 迁移：`ai:quota-unify:v1.0`，`applyOnce(key, task, verify)` 双阶校验。

### B.4 AI 使用申请审批兑现（D）
- 新增 `AiGrantOnApprovalService`：审批通过 → 写 `ai_employee_auth`（模型授权）、`ai_quota_override`（额度）、`ai_grant_log`（幂等记录，key=`flowNo`）。
- `OaRequestServiceImpl#L710` TODO 位置调用 `grant()`；仅 `ai_access` 流程分支；失败必须抛出，不吞异常。
- 附件真实入库：`AiAccessApply/index.tsx` 提交时走现有 OA 附件接口，不再只传数量。
- 迁移：`ai:grant-on-approval:v1.0`；`ContractRegistry` 登记 `ai_grant_log_contract`。

### B.5 用量可信计量（E）
- `LlmUsageController.record` 改为仅允许 `ROLE_SYSTEM_INTERNAL` 服务账号（同进程调用）；前端不再 POST。
- 新字段 `verification_status` (VERIFIED / ESTIMATED / UNKNOWN)：网关侧统计 → VERIFIED；缺价目 → UNKNOWN（前端显示 `未知`，非 0）。
- 前端「我的用量」/能耗统计页读取新增 `verification_status` 展示；导出增加该列。
- 迁移：`ai:usage-trust:v1.0`。

### B.6 会话审计分离（F）
- 保留 `PUT /api/ai/conversations/{id}` 允许本人覆写 messages（用户可编辑自己历史），但加入长度/条数上限（默认 messages ≤ 200、单条 ≤ 32KB）。
- 新表 `ai_conversation_event`：服务端追加；字段 `conversation_id`、`event_type`（USER_TURN / ASSISTANT_TURN / TOOL_CALL / TOOL_RESULT / POLICY_DECISION / QUOTA_CHARGE / GATEWAY_ERROR）、`payload_json`、`created_at`；不接受外部写入。
- `AiConversationAudit` 前端详情页新增「执行事件」Tab，读取 `ai_conversation_event`；旧「消息」Tab 保持兼容。
- 迁移：`ai:conversation-audit:v1.0`。

### B.7 财务工具数据范围核验
- `FinAccountMapper` 加入 `groupId` 白名单过滤（与 `AdOrderServiceImpl` 对齐）；查询失败明确拒绝而非返回全量。
- 单元：跨集团读取应 403/空集；无授权用户不可读取。

### B.8 Sprint 1 验收门槛
- **绕过前端直接请求 `/api/agent/chat` 依然受模型授权、额度、数据范围、工具策略和预算拦截**（Postman 冒烟 + JUnit）。
- **并发请求不能突破预算**：JUnit 并行用例 100 线程同用户同模型 → 只有满足预算的通过。
- **AI 操作授权启停立即生效**：管理端切换 `enabled=0` 后新调用 5s 内被拒；已缓存 JWT 也拒绝。
- **员工能力开关持久化**：编辑保存后重新拉取一致；调用时按能力拦截（无 vision 授权 → 拒绝含 image_url 的消息）。
- **AI 使用申请审批通过即发放**：审批后 `ai_employee_auth` 与 `ai_quota_override` 存在记录；重放不重复发放；过期自动回收由 `@Scheduled` 覆盖（可延至 Sprint 1.5）。
- **用量与审计**：`LlmUsage` 不再接受客户端 POST；`ai_conversation_event` 无法从外部接口写入。
- **构建**：`npm run typecheck && npm run lint && npm run test:run`；`cd backend && mvn -q -DskipTests package`；`mvn test -B` 通过（含新加 `AgentGateway*Test`、`AiEffectivePolicyServiceTest`、`AiGrantOnApprovalServiceTest`、`McpExecPolicyTest`）。
- **CI catalog**：`catalog.json` 新增 4 个 versionKey，资源全部打包；`SchemaContractValidator` 启动校验通过。

### B.9 不在 Sprint 1 范围
- 生产反代/负载均衡切换与真实部署验证（属运维，另开工单）。
- Quartz 定时报送（属 V2）。
- 部门助手具体业务工具与知识库（属 V1）。
- 前端 UI 重构（现有页面沿用，只替换 mock 与错误提示）。
- 钉钉/邮件送达回执（属 V2 投递闭环）。