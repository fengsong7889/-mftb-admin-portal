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
        /** 接收范围：all_projects=全部在途项目 / risk_only=仅风险逾期项目 */
        private String receiverScope;
        private String morningTemplateKey;
        private String eveningTemplateKey;
        private String personalTemplateKey;
        private String updatedBy;
        private String updatedAt;
    }

    /** 配置保存入参（服务端逐字段校验，不信任前端传值） */
    @Data
    public static class ConfigForm {
        private Boolean enabled;
        private String morningTime;
        private String eveningTime;
        private Boolean groupEnabled;
        private Boolean personalEnabled;
        private String receiverScope;
        private String morningTemplateKey;
        private String eveningTemplateKey;
        private String personalTemplateKey;
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
        private Long projectId;
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
        private Long projectId;
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
        private String planStartDate;
        private String planEndDate;
        private Integer riskFlag;
        private Integer overdueFlag;
        private Integer pausedFlag;
        private int requirementTotal;
        private int deliveryItemTotal;
        private int deliveryItemCompleted;
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
        private String priority;
        private String assigneePmName;
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
