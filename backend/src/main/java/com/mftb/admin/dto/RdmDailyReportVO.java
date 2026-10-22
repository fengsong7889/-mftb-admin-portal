package com.mftb.admin.dto;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/**
 * RDM 每日日报的读写契约。
 *
 * <p><b>为什么快照结构同时是 JSON 契约与前端数据源</b>：{@code rdm_daily_report.content_json}
 * 存的就是 {@link Snapshot} 序列化结果，移动端日报页读的也是它——通知里的数字与点开页面看到的
 * 数字因此天然同源，不会出现「通知说逾期 3 项、页面显示 2 项」。改本类字段等于改历史快照的
 * 解读口径，因此<b>只增不改不删</b>：新增字段给默认值，旧快照反序列化后为 null/0 即可。
 *
 * <p><b>层级口径</b>：项目 → 迭代 → 需求，唯一性由主键 ID 链保证
 * （{@code rdm_project.id} → {@code rdm_iteration.project_id} → {@code rdm_requirement.iteration_code}），
 * 重名项目/重名迭代一律按 ID 区分，绝不按名称匹配。
 */
public final class RdmDailyReportVO {

    private RdmDailyReportVO() {
    }

    /* ==================== 推送配置 ==================== */

    /** 推送配置（全表只一行，config_slot='default'）。时间格式 HH:mm，由作业每分钟 tick 比对命中。 */
    @Data
    public static class Config {
        /** 日报总开关；关闭后定时与手动触发都不出站 */
        private Boolean enabled;
        /** 晨报推送时间 HH:mm */
        private String morningTime;
        /** 晚报推送时间 HH:mm */
        private String eveningTime;
        /** 群报开关 */
        private Boolean groupEnabled;
        /** 个人工作通知开关 */
        private Boolean personalEnabled;
        /**
         * @deprecated 从未被消费的半成品（仅透传读写，发送链路无人读它）；收件人改由
         *             {@link #receiverRoles} 等三字段表达。保留字段只为旧客户端传入时不报错。
         */
        @Deprecated
        private String receiverScope;
        /**
         * 收件角色白名单：pm / product_owner / tech_lead / qa_lead / ui_designer / ops_lead / project_member。
         * <p>默认 pm + product_owner，与收件人可配之前的发送行为完全一致。
         */
        private List<String> receiverRoles;
        /** 追加收件人 sys_user.id：不靠项目角色，收到规则范围内的全部项目汇总 */
        private List<Long> extraReceiverUserIds;
        /** 排除收件人 sys_user.id：优先级最高，从角色与追加名单中剔除 */
        private List<Long> excludeReceiverUserIds;
        private String morningTemplateKey;
        private String eveningTemplateKey;
        private String personalTemplateKey;
        /** 看板开放链接有效期（天）；1~90，默认 30 */
        private Integer boardLinkValidDays;
        /** 看板是否展示需求明细（样式固定，只控制内容） */
        private Boolean boardShowRequirements;
        /** 看板是否展示负责人姓名 */
        private Boolean boardShowOwners;
        /** 看板是否展示未挂项目的迭代 */
        private Boolean boardShowUnassigned;
        /** 钉钉消息模式：fixed=固定框架（只看字段开关）/ template=自定义模板文本 */
        private String messageMode;
        /** 固定框架的字段开关（全局一套，不随模板变化） */
        private MessageFieldOptions messageFields;
        /**
         * 无异常日降噪策略：full=照常发摘要 / brief=只发一句结论 / skip=不发（仍落快照）。
         * <p>只作用于定时推送；手动触发与预览永远发完整内容。
         */
        private String quietPolicy;
        private String updatedBy;
        private String updatedAt;
    }

    /**
     * 钉钉消息固定框架的字段开关（全局一套）。
     *
     * <p><b>为什么是“开关”而不是“模板文本”</b>：预置日报的层级框架（汇总行 → 项目行 →
     * 迭代行 → 未挂项目迭代 → 引导链接）必须稳定，否则同一个日报在不同群里结构各异，
     * 读者无法形成阅读习惯。能调的只有“每行展示哪几个字段”，因此这里全部是布尔开关，
     * 不提供文案、顺序与层级配置入口。
     *
     * <p>项目名、迭代名、汇总行、引导链接是框架的一部分，<b>不在本开关池里</b>（不可关）。
     */
    @Data
    public static class MessageFieldOptions {
        /** 项目行：产品负责人 */
        private Boolean projectProductOwner = true;
        /** 项目行：交付进度（已完成/总数） */
        private Boolean projectDeliveryProgress = true;
        /** 项目行：在途迭代数 */
        private Boolean projectIterationCount = true;
        /** 项目行：项目周期（计划起~止） */
        private Boolean projectPeriod = false;
        /** 项目行：下次交付日 */
        private Boolean projectNextDelivery = false;
        /** 项目行：逾期/阻塞交付项计数 */
        private Boolean projectAbnormal = false;
        /** 迭代行：状态 */
        private Boolean iterationStatus = true;
        /** 迭代行：负责人 */
        private Boolean iterationOwner = true;
        /** 迭代行：进度（任务按计划工时加权）与产能负载率 */
        private Boolean iterationProgress = true;
        /** 迭代行：总需求数 */
        private Boolean iterationReqTotal = false;
        /** 迭代行：今日到期需求数 */
        private Boolean iterationReqTodayDue = false;
        /** 迭代行：逾期需求数 */
        private Boolean iterationReqOverdue = false;
        /** 迭代行：起止日期 */
        private Boolean iterationPeriod = false;
    }

    /** 配置保存入参（服务端逐字段校验，不信任前端传值） */
    @Data
    public static class ConfigForm {
        private Boolean enabled;
        private String morningTime;
        private String eveningTime;
        private Boolean groupEnabled;
        private Boolean personalEnabled;
        /** @deprecated 服务端不再读写，传了也会被忽略；改用下面三个收件人字段 */
        @Deprecated
        private String receiverScope;
        /** 收件角色白名单；null = 沿用库中现值，不重置已配名单 */
        private List<String> receiverRoles;
        /** 追加收件人 sys_user.id；null = 沿用库中现值 */
        private List<Long> extraReceiverUserIds;
        /** 排除收件人 sys_user.id；null = 沿用库中现值 */
        private List<Long> excludeReceiverUserIds;
        private String morningTemplateKey;
        private String eveningTemplateKey;
        private String personalTemplateKey;
        /** 看板开放链接有效期（天）；1~90，默认 30 */
        private Integer boardLinkValidDays;
        /** 看板是否展示需求明细 */
        private Boolean boardShowRequirements;
        /** 看板是否展示负责人姓名 */
        private Boolean boardShowOwners;
        /** 看板是否展示未挂项目的迭代 */
        private Boolean boardShowUnassigned;
        /** 钉钉消息模式：fixed / template */
        private String messageMode;
        /** 固定框架的字段开关 */
        private MessageFieldOptions messageFields;
        /** 无异常日降噪策略：null = 沿用库中现值 */
        private String quietPolicy;
    }

    /* ==================== 推送模板 ==================== */

    /** 模板（页面读写）。{@code preset=true} 的预置模板不可删，只可停用。 */
    @Data
    public static class Template {
        private Long id;
        private String templateKey;
        private String name;
        /** group=钉钉群 / personal=工作通知 */
        private String channel;
        /** morning / evening / any */
        private String reportType;
        private String titleTpl;
        private String contentTpl;
        private Boolean preset;
        private Boolean defaultTemplate;
        private Boolean enabled;
        private String remark;
        private String updatedBy;
        private String updatedAt;
    }

    /** 模板保存入参。{@code templateKey} 为空表示「另存为新模板」，由服务端发键。 */
    @Data
    public static class TemplateForm {
        private Long id;
        private String templateKey;
        private String name;
        private String channel;
        private String reportType;
        private String titleTpl;
        private String contentTpl;
        private Boolean enabled;
        private String remark;
        /** 是否把本模板设为该 channel+reportType 的当前默认（配置页「設為當前使用」） */
        private Boolean applyAsDefault;
    }

    /** 预览入参：可指定模板（未存盘的草稿也能预览），不指定则用配置选中的模板 */
    @Data
    public static class PreviewForm {
        /** morning / evening */
        private String reportType;
        /** group / personal；personal 需配合 receiverUserId 才有「我的」口径 */
        private String channel;
        /** 草稿模板（不传则用库里选中/默认的模板） */
        private String titleTpl;
        private String contentTpl;
        /** 个人预览的视角用户（不传则取目标项目的 PM） */
        private Long receiverUserId;
        /** 预览目标项目（不传则不限定项目） */
        private Long projectId;
        /** 预览目标迭代（不传=该项目全部迭代） */
        private String iterationCode;
    }

    /** 预览结果：渲染后的标题与正文，附未知占位符清单（便于用户发现拼写错误） */
    @Data
    public static class PreviewResult {
        private String title;
        private String content;
        /** 模板里出现但渲染器不认识的占位符（保留原样输出，不静默替空） */
        private List<String> unknownPlaceholders = new ArrayList<>();
        private String reportDate;
        private String reportType;
        /** 预览链接：指向免登看板（与真实推送同一个 buildViewUrl），供编辑页直接打开验证落地页 */
        private String detailUrl;
        /** 本次预览实际走的渲染路径：fixed=固定框架（草稿文本不生效）/ template=自定义模板 */
        private String messageMode;
    }

    /* ==================== 推送规则（多规则模型） ==================== */

    /**
     * 一条推送规则：目标（项目 + 可选迭代）+ 时间 + 内容档位 + 模板。
     *
     * <p>为什么规则是「项目维度」而不是全局：实际用法是 A 產品盯 A 項目下的 B1 迭代、
     * B 產品盯 B 項目下的 C1 迭代、W 項目經理盯整個 W 項目——目标、时间、模板都不同。
     * 全局只有开关与默认模板，具体发什么由规则决定。
     */
    @Data
    public static class Rule {
        private Long id;
        private String name;
        /** 目标项目；null = 未指定单项目（全部项目或仅未挂项目的迭代） */
        private Long projectId;
        /** 多项目范围：为空表示单项目/全部项目/仅迭代，语义由 projectId + iterationCode 共同裁决 */
        private List<Long> projectIds;
        /** 范围展示文案：全部在途项目 / 项目A、项目B / 项目A / 迭代 SP… */
        private String projectSummary;
        /** 冗余展示：项目编号/名称（避免前端再查一次项目） */
        private String projectNo;
        private String projectName;
        /** null = 该项目全部迭代 */
        private String iterationCode;
        /** 冗余展示：迭代名称 */
        private String iterationName;
        /** 推送时间 HH:mm */
        private String pushTime;
        /** 内容档位：morning=今日焦点 / evening=当日复盘 */
        private String contentType;
        private String groupTemplateKey;
        private String personalTemplateKey;
        private Boolean enabled;
        private String remark;
        private String updatedBy;
        private String updatedAt;
    }

    /** 规则保存入参（服务端逐项校验，不信任前端） */
    @Data
    public static class RuleForm {
        private Long id;
        private String name;
        /** 可为空：迭代未挂项目（紧急修复）时规则不挂项目；迭代有项目时服务端以迭代为准回填校验 */
        private Long projectId;
        /** 多项目范围：空数组 + projectId 为空 + 无迭代 = 全部在途项目 */
        private List<Long> projectIds;
        /** UI 显式“全部项目”标记（服务端以 projectIds 空 + 无迭代为准，保留字段兼容前端） */
        private Boolean allProjects;
        /** 空 = 项目全部迭代 */
        private String iterationCode;
        private String pushTime;
        private String contentType;
        private String groupTemplateKey;
        private String personalTemplateKey;
        private Boolean enabled;
        private String remark;
    }

    /* ==================== 日报快照（content_json 契约） ==================== */

    /** 一份日报快照：汇总计数 + 项目层级明细。移动端页与通知正文都由它渲染。 */
    @Data
    public static class Snapshot {
        /** 快照口径日 yyyy-MM-dd */
        private String reportDate;
        /** morning / evening / manual（手动触发存 manual，不占用定时档的幂等行） */
        private String reportType;
        /** 晨報 / 晚報 / 手動補發·晨報（文案，供模板与页面共用） */
        private String reportTypeLabel;
        /** 快照生成时刻 yyyy-MM-dd HH:mm:ss */
        private String generatedAt;
        /** 范围说明（如「項目A / 迭代 SP202610001」或「手動補發·A項目」），供页面与记录展示 */
        private String scopeLabel;
        /** 快照目标项目ID（手动推送为所选项目） */
        private Long scopeProjectId;
        /** 快照目标迭代编码（null=项目全部迭代） */
        private String scopeIterationCode;
        private Summary summary;
        /** 在途项目（按 attention 优先、再按项目编号排序） */
        private List<ProjectNode> projects = new ArrayList<>();
        /**
         * 未挂项目的迭代（{@code rdm_iteration.project_id IS NULL}）。
         * <p>两类合法来源：hotfix（跨项目平台级热修，管理员已裁决可不挂）与存量待补挂迭代
         * （v3.15 刻意不回填，由管理员在迭代排期逐个补挂）。日报如实列出，不塞进任何项目下。
         */
        private List<IterationNode> unassignedIterations = new ArrayList<>();
        /** 未挂项目、也未挂迭代的执行需求（「全部在途项目」口径才加载；消息不展示，看板展示） */
        private List<RequirementNode> unassignedRequirements = new ArrayList<>();
    }

    /** 汇总计数。单位在字段名里写清，避免管理者把「项」读成「个项目」。 */
    @Data
    public static class Summary {
        /** 在途项目数（个） */
        private int projectCount;
        /** 今日到期的交付项数（项）：plan_end_date = 报告日且未完成 */
        private int todayDueItemCount;
        /** 已逾期的交付项数（项）：plan_end_date < 报告日且未完成 */
        private int overdueItemCount;
        /** 明日到期的交付项数（项） */
        private int tomorrowDueItemCount;
        /** 需关注项目数（个）：风险标记 / 逾期标记 / 含逾期或阻塞交付项 */
        private int riskProjectCount;
        /** 进展正常项目数（个）= projectCount - riskProjectCount */
        private int normalProjectCount;
        /** 当日完成的交付项数（项） */
        private int todayDoneItemCount;
        /** 当日上线的需求数（个）：actual_release_date = 报告日 */
        private int todayReleasedCount;
        /** 当日需求状态变更次数（次）：rdm_status_log 当日行数（度量真值，不事后补算） */
        private int todayChangedCount;
        /** 在途项目的需求总数（个） */
        private int requirementTotal;
        /** 在途项目的交付项总数 / 已完成数（项） */
        private int deliveryItemTotal;
        private int deliveryItemCompleted;
        /** 在途项目的待办总数（项） */
        private int todoTotal;
        /** 在途迭代数（含未挂项目的迭代，status != closed） */
        private int iterationActiveCount;
        /** 逾期需求数（overdue_flag=1） */
        private int overdueReqCount;
        /** 阻塞需求数（blocked_flag=1） */
        private int blockedReqCount;
        /** 逾期风险数：逾期或阻塞的需求去重计数（看板顶部第 4 个指标） */
        private int overdueRiskReqCount;
    }

    /* ==================== 收件人预览 ==================== */

    /**
     * 收件人预览：发之前先看清「会发给谁、谁会收不到」。
     * <p>按当前配置 + 规则实时范围现算，<b>不读快照</b>：快照是「上次发了什么」，
     * 预览是「改完配置下次会怎样」，且历史快照不含新增的四类角色 userId。
     */
    @Data
    public static class ReceiverPreview {
        /** 最终收件人数（已剔除排除名单，含未绑定钉钉者） */
        private int total;
        /** 其中未绑定钉钉 userId 的人数；这些人会被跳过，不降级群发 */
        private int unbound;
        /** 追加收件人数（这些人的视角是规则范围全量项目） */
        private int extraCount;
        private List<ReceiverPreviewItem> receivers = new ArrayList<>();
    }

    /** 单个收件人：来源与可见范围都摆明，避免「凭什么他能收到」说不清 */
    @Data
    public static class ReceiverPreviewItem {
        private Long userId;
        private String userName;
        private String empId;
        /** 命中来源：角色 code（pm/product_owner/...）或 extra（追加名单） */
        private List<String> sources = new ArrayList<>();
        /** 该人在本规则下可见的项目数；追加收件人为规则范围全量 */
        private int projectCount;
        /** 是否绑定钉钉 userId；false 时不会收到 */
        private boolean dingtalkBound;
    }

    /** 项目节点：项目级指标全部取自 {@code RdmProjectFactService} 事实源，禁止在此另起口径。 */
    @Data
    public static class ProjectNode {
        private Long projectId;
        private String projectNo;
        private String projectName;
        private String status;
        private Long pmUserId;
        private String pmUserName;
        private Long productOwnerUserId;
        private String productOwnerUserName;
        /** 项目角色负责人 userId：按角色推导收件人时的取值来源（姓名快照只用于展示） */
        private Long techLeadUserId;
        private String techLeadUserName;
        private Long qaLeadUserId;
        private String qaLeadUserName;
        private Long uiDesignerUserId;
        private String uiDesignerUserName;
        private Long opsLeadUserId;
        private String opsLeadUserName;
        private String planStartDate;
        private String planEndDate;
        private Integer riskFlag;
        private Integer overdueFlag;
        private Integer pausedFlag;
        private int requirementTotal;
        private int deliveryItemTotal;
        private int deliveryItemCompleted;
        /** 交付进度百分比；交付项总数为 0 时为 null（零承诺≠完成） */
        private Integer deliveryProgressPercent;
        /**
         * 剩余工作 = 交付项总数 − 已完成数。
         * <p><b>展示侧必须先短路 {@code deliveryItemTotal == 0}</b>：新建但尚未排交付项的项目
         * 得到 0−0=0，任何 {@code remaining <= 0} 的判定都会把「还没承诺任何交付项」谎报成「全部完成」。
         */
        private int remainingCount;
        private int deliveryItemOverdue;
        private int deliveryItemBlocked;
        private int deliveryItemTesting;
        private int deliveryItemPendingAcceptance;
        private int taskTotal;
        private int taskCompleted;
        private int todoTotal;
        /** 下次交付：未完成交付项中最早的 plan_end_date（交付项级，与迭代/发布批次无关） */
        private String nextDeliveryDate;
        /** 是否需关注（风险/逾期标记，或含逾期、阻塞交付项） */
        private boolean attention;
        /** 该项目下的在途迭代数（status != closed）：消息项目行的「迭代 N 個」取此值 */
        private int iterationActiveCount;
        /** 项目详情路由（取自 RdmConstants 单一真相源，通知侧绝不自己重拼路径） */
        private String detailUrl;
        private List<IterationNode> iterations = new ArrayList<>();
        /** 该项目下未排迭代的需求（iteration_code 为空） */
        private List<RequirementNode> unscheduledRequirements = new ArrayList<>();
    }

    /** 迭代节点。{@code projectId == null} 表示未挂项目（hotfix 或存量待补挂）。 */
    @Data
    public static class IterationNode {
        private Long iterationId;
        private Long projectId;
        private String code;
        private String name;
        /** sprint / version / hotfix */
        private String iterationType;
        /** planning / active / closed */
        private String status;
        private String startDate;
        private String endDate;
        private String ownerName;
        private int requirementCount;
        private int requirementDoneCount;
        /** 迭代产能工时（rdm_iteration.capacity_hours）；0=未設定 */
        private int capacityHours;
        /** 迭代下任务计划工时合计（只计已填写的 plan_hours） */
        private double taskHours;
        /** 已排计划工时 / 产能；产能未设置时为 null（不编造百分比） */
        private Integer capacityUsagePercent;
        /**
         * 迭代进度：任务进度按计划工时加权后的百分比；无任务时为 null。
         * <p>不用需求上的 progress 字段：该字段可能长期停留 0（任务已完成也不联动），
         * 用它算迭代进度会与执行侧甘特图矛盾。
         */
        private Integer progressPercent;
        private int taskTotal;
        private int taskDone;
        /** 该迭代下逾期需求数（overdue_flag=1） */
        private int overdueReqCount;
        /** 该迭代下今日到期需求数（plan_release_date = 报告日且未上线） */
        private int todayDueReqCount;
        private List<RequirementNode> requirements = new ArrayList<>();
    }

    /** 需求节点（日报最细粒度）。 */
    @Data
    public static class RequirementNode {
        private Long reqId;
        /** 需求编号；延迟发号口径下认领前可能为空，如实展示为空而非编造 */
        private String reqNo;
        private String title;
        private String status;
        /** 状态中文名，取自 rdm_status_def.label（不硬编码） */
        private String statusLabel;
        /** 规模：SIMPLE/MEDIUM/COMPLEX/HUGE（产品评估后回填） */
        private String complexity;
        private String priority;
        private String assigneePmName;
        /** 当前状态已停留天数（以 status_enter_time 与报告日为基准；空则前端显示 —） */
        private Integer stayDays;
        /**
         * 所属迭代编码（需求→迭代的挂接键）。
         * <p>迭代 code 全局唯一（{@code uk_rdm_iteration_code}），因此按它分组不会串项目；
         * 为空表示该需求未排迭代，归入项目的「未排迭代」分组。
         */
        private String iterationCode;
        private String planReleaseDate;
        private Integer overdueFlag;
        private Integer blockedFlag;
        private Integer progress;
        private String detailUrl;
        /** 甘特数据：该需求下的任务（角色/负责人/起止），为空时看板只画需求行 */
        private List<TaskNode> tasks = new ArrayList<>();
    }

    /** 甘特任务节点（rdm_work_task 的任务级排期）。 */
    @Data
    public static class TaskNode {
        private Long taskId;
        private String taskNo;
        private String title;
        /** 任务类型（design/frontend/app/backend/qa/data）：甘特条颜色与我的甘特图同源 */
        private String taskType;
        /** 工作项角色编码（PM/DEV/QA/DESIGNER 等，前端按 RDM_ROLE_LABEL 翻译） */
        private String roleCode;
        private String ownerName;
        private String ownerEmpNo;
        /** 进度百分比 0-100（甘特条内展示） */
        private Integer progress;
        /** 计划工时（迭代进度/产能口径的权重） */
        private Double planHours;
        private String planStartDate;
        private String planFinishDate;
        private String status;
    }

    /* ==================== 免登看板 ==================== */

    /**
     * 看板开放页视图（无登录态）。
     *
     * <p><b>只输出展示所需字段</b>：不含手机号、钉钉 userId、站内详情路由（detailUrl 一律清空），
     * 避免开放链接把外部访问者带回登录页，也避免转发后扩大内部信息暴露面。
     * <p><b>invalid 与 valid=false</b>：签名错/过期/快照不存在统一走同一句提示，不区分原因。
     */
    @Data
    public static class PublicView {
        private boolean valid;
        private String message;
        /** 链接到期时间 yyyy-MM-dd HH:mm:ss（展示用） */
        private String expireAt;
        /** 实际生效的展示参数（前端只按它裁剪渲染，样式不变） */
        private boolean showRequirements;
        private boolean showOwners;
        private boolean showUnassigned;
        private Snapshot snapshot;
    }

    /* ==================== 触发结果与发送记录 ==================== */

    /** 推送结果（手动触发返回；定时作业只记日志） */
    @Data
    public static class TriggerResult {
        private String reportDate;
        private String reportType;
        /** 本次快照覆盖的在途项目数（作业日志与页面回显用） */
        private int projectCount;
        /** 群报是否已交给渠道（dry-run 或群报关闭时为 false） */
        private boolean groupDispatched;
        /** 个人工作通知已发送人数 */
        private int personalSent;
        /** 个人工作通知跳过人数（未绑定钉钉 userId / 场景未绑定应用） */
        private int personalSkipped;
        private boolean dryRun;
        /** 本次渲染出的群报标题（预览与干跑时回显，便于用户确认文案） */
        private String groupTitle;
        private String groupContent;
        /** 人类可读结论（成功/被开关拦下/无数据等） */
        private String message;
        /** 本次快照对应的看板链接（免登）：手动触发页可直接弹窗预览 */
        private String detailUrl;
    }

    /** 发送记录列表行（配置页「發送記錄」tab） */
    @Data
    public static class ReportRecord {
        private Long id;
        private String reportDate;
        /** morning / evening / manual（手动触发写 manual，与定时行分开各自自洽） */
        private String reportType;
        /** 推送规则ID（手动触发为 null） */
        private Long ruleId;
        /** 规则名称冗余（规则已删时为 null） */
        private String ruleName;
        private Long projectId;
        private String projectNo;
        private String projectName;
        /** 范围展示文案（多项目/全部项目/未挂项目迭代） */
        private String scopeLabel;
        /** 快照范围键（多项目/全部项目没有单一 projectId，记录页跳日报必须带上它才能精确命中） */
        private String scopeKey;
        /** 快照目标迭代编码（null=项目全部迭代） */
        private String iterationCode;
        private Integer projectCount;
        private Integer personalCount;
        private Integer pushCount;
        /** schedule / manual */
        private String triggerType;
        /** 手动触发人姓名快照（定时为 null） */
        private String triggerBy;
        private String lastPushAt;
        private String createdAt;
        private String updatedAt;
    }
}
