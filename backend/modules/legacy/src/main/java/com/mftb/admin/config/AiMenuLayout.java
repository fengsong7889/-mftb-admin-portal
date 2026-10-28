package com.mftb.admin.config;

import java.util.List;

/**
 * 人工智能系统（{@code system_code=ai}）菜单信息架构的唯一目标状态。
 *
 * <p>为什么需要这份布局：AI 域的菜单由三个初始化器分别拥有（主种子、AI 助手、企业 Agent），
 * 建成批次不同导致「配额管理」与「企业 Agent &gt; 预算与配额」并列、工具配置分散在三处。
 * 本类只描述**放置关系与显示名**，不改 menu_key、path、actions：
 * 存量角色/部门授权挂在 menu_key 上，因此归位不会造成静默失权。
 *
 * <p>分组 key 统一 {@code ai-grp-} 前缀，避免与历史的 {@code agent-%}、
 * {@code ai-assistant-%} 两套启动期前缀断言互相干扰。
 */
final class AiMenuLayout {

    private AiMenuLayout() {
    }

    /** 一级分组（目录，无路由）。 */
    record Group(String key, String name, String nameEn, String icon, int sort) {
    }

    /**
     * 待归位的节点。
     *
     * @param parentKey   目标父级：一级分组 key，或已归位的二级目录 key
     * @param legacyNames 历史显示名（繁/简）；只有当库里仍是这些名字时才改名，
     *                    避免覆盖管理员在「菜单配置」里的自定义名称
     */
    record Placement(String key, String parentKey, String name, String nameEn, int sort, List<String> legacyNames) {
    }

    /** 一级分组：按「先看总览 → 建应用 → 选模型工具 → 管知识 → 配授权额度 → 看运行质量 → 管安全审计」排列。 */
    static final List<Group> GROUPS = List.of(
            new Group("ai-grp-overview", "總覽", "Overview", "DashboardOutlined", 1),
            new Group("ai-grp-app", "應用管理", "Applications", "AppstoreOutlined", 2),
            new Group("ai-grp-model", "模型與工具", "Models & Tools", "DesktopOutlined", 3),
            new Group("ai-grp-knowledge", "知識管理", "Knowledge", "ReadOutlined", 4),
            new Group("ai-grp-grant", "授權與額度", "Access & Quota", "SafetyCertificateOutlined", 5),
            new Group("ai-grp-run", "運行與質量", "Runs & Quality", "PlayCircleOutlined", 6),
            new Group("ai-grp-security", "安全與治理", "Security & Governance", "AuditOutlined", 7));

    /**
     * 保留的二级目录：语义仍然成立，只是上移到「授權與額度」下。
     * <p>{@code ai-quota-manage} 同时是配额删除接口的权限锚点，不能改成叶子或隐藏。
     */
    static final List<Placement> SUB_GROUPS = List.of(
            new Placement("ai-auth-manage", "ai-grp-grant", "模型授權", "Model Authorization", 2,
                    List.of("模型授权管理", "模型授權管理")),
            new Placement("ai-quota-manage", "ai-grp-grant", "用量額度", "Usage Quota", 3,
                    List.of("配额管理", "配額管理")),
            new Placement("ai-energy-billing", "ai-grp-grant", "用量與費用", "Usage & Cost", 5,
                    List.of("能耗与账单", "能耗與賬單")));

    /** 叶子功能入口：一个功能只有一个主维护入口，key 与路由保持不变。 */
    static final List<Placement> LEAVES = List.of(
            // ── 總覽：平台就绪与助手配置各一个视角，都只读聚合 ---
            new Placement("agent-overview", "ai-grp-overview", "平台總覽", "Platform Overview", 1,
                    List.of("平台总览")),
            new Placement("ai-assistant-overview", "ai-grp-overview", "助手總覽", "Assistant Overview", 2,
                    List.of("助手概覽", "助手概览")),
            // ── 應用管理：应用生命周期 + 助手表现层配置 ---
            new Placement("agent-apps", "ai-grp-app", "智能應用", "Smart Applications", 1,
                    List.of("應用與版本", "应用与版本")),
            new Placement("ai-assistant-profile", "ai-grp-app", "回答規則", "Answer Rules", 2,
                    List.of("回答骨架")),
            new Placement("ai-assistant-quick-prompt", "ai-grp-app", "快捷提問", "Quick Prompts", 3,
                    List.of()),
            new Placement("ai-assistant-push-template", "ai-grp-app", "推送模板", "Push Templates", 4,
                    List.of()),
            // ── 模型與工具：一个工具只在一处维护，接入/说明/授权是三个独立状态 ---
            new Placement("ai-model-list", "ai-grp-model", "模型接入", "Model Access", 1,
                    List.of()),
            new Placement("ai-model-provider", "ai-grp-model", "模型供應商", "Model Provider", 2,
                    List.of("供应商管理", "供應商管理")),
            new Placement("ai-mcp-service", "ai-grp-model", "工具管理", "Tool Management", 3,
                    List.of("MCP 服務", "MCP 服务", "MCP服务")),
            new Placement("ai-assistant-capability", "ai-grp-model", "工具能力說明", "Tool Capabilities", 4,
                    List.of("能力清單", "能力清单")),
            new Placement("ai-operation-auth", "ai-grp-model", "工具與通道授權", "Tool & Channel Access", 5,
                    List.of("AI 操作授權", "AI 操作授权", "AI操作授權", "AI操作授权")),
            // ── 知識管理：正文、读取授权、术语是同一知识域的三件事 ---
            new Placement("ai-assistant-knowledge", "ai-grp-knowledge", "知識庫", "Knowledge Base", 1,
                    List.of()),
            new Placement("agent-knowledge", "ai-grp-knowledge", "知識授權", "Knowledge ACL", 2,
                    List.of()),
            new Placement("ai-assistant-glossary", "ai-grp-knowledge", "業務術語", "Business Glossary", 3,
                    List.of("術語與口徑", "术语与口径")),
            // ── 授權與額度：模型授权 / 用量额度 / 费用预算是三种不同规则，同组但不合账 ---
            new Placement("ai-emp-permission", "ai-grp-grant", "員工使用診斷", "Employee AI Diagnosis", 1,
                    List.of("員工AI權額管理", "员工AI权额管理", "員工 AI 權額管理", "员工 AI 权额管理")),
            new Placement("agent-budget", "ai-grp-grant", "費用預算", "Cost Budget", 4,
                    List.of("預算與配額", "预算与配额")),
            new Placement("ai-access-request", "ai-grp-grant", "使用申請", "Access Request", 6,
                    List.of("AI 使用申請", "AI 使用申请", "AI使用申請", "AI使用申请")),
            // ── 運行與質量：运行、审批、评测、反馈分别回答不同问题 ---
            new Placement("agent-runs", "ai-grp-run", "運行記錄", "Run Records", 1,
                    List.of("運行中心", "运行中心")),
            new Placement("agent-actions", "ai-grp-run", "操作審批", "Action Approvals", 2,
                    List.of("動作提案", "动作提案")),
            new Placement("agent-evaluation", "ai-grp-run", "評測與發布記錄", "Evaluation & Releases", 3,
                    List.of("評測與發布", "评测与发布")),
            new Placement("ai-assistant-feedback", "ai-grp-run", "用戶反饋", "User Feedback", 4,
                    List.of("回答質量", "回答质量")),
            // ── 安全與治理：出域、内容规则、记忆、审计 ---
            new Placement("agent-data", "ai-grp-security", "數據外發管理", "Data Outbound Control", 1,
                    List.of("數據與端點", "数据与端点")),
            new Placement("ai-assistant-guardrail", "ai-grp-security", "內容安全規則", "Content Safety Rules", 2,
                    List.of("合規護欄", "合规护栏")),
            new Placement("ai-assistant-memory", "ai-grp-security", "記憶策略", "Memory Policy", 3,
                    List.of()),
            new Placement("ai-conversation-audit", "ai-grp-security", "對話審計", "Conversation Audit", 4,
                    List.of("对话审计")),
            new Placement("ai-assistant-audit", "ai-grp-security", "配置變更審計", "Config Change Audit", 5,
                    List.of("變更審計", "变更审计")),
            // ── 二级目录下的叶子：名称改为「模型授權·部门」等可自解释形式 ---
            new Placement("ai-dept-model-auth", "ai-auth-manage", "部門模型授權", "Dept Model Access", 1,
                    List.of("部门模型权控", "部門模型權控")),
            new Placement("ai-emp-model-auth", "ai-auth-manage", "員工模型授權", "Employee Model Access", 2,
                    List.of("员工模型权控", "員工模型權控")),
            new Placement("ai-dept-quota", "ai-quota-manage", "部門額度", "Department Quota", 1,
                    List.of("部门额度")),
            new Placement("ai-emp-quota", "ai-quota-manage", "員工額度", "Employee Quota", 2,
                    List.of("员工额度")),
            new Placement("ai_usage_stats", "ai-energy-billing", "用量匯總", "Usage Summary", 1,
                    List.of("能耗統計", "能耗统计")),
            new Placement("ai_energy_detail", "ai-energy-billing", "調用明細", "Call Details", 2,
                    List.of("能耗明細", "能耗明细")));

    /**
     * 被新结构取代的历史分组：只软删目录行，不动其授权记录。
     * <p>{@code ai-models} 的子菜单已上移「模型與工具」；{@code agent-platform} 与
     * {@code ai-assistant-group} 的子菜单已按职责拆到各业务分组。
     */
    static final List<String> RETIRED_GROUP_KEYS = List.of("agent-platform", "ai-assistant-group", "ai-models");
}
