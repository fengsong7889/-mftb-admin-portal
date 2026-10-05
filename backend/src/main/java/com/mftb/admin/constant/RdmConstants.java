package com.mftb.admin.constant;

import java.util.Set;

/**
 * RDM（產研協同）需求全生命周期常量。
 * <p>
 * 与 {@code rdm_status_def.code} / {@code rdm_transition.action_code} /
 * {@code rdm_requirement_role.role_code} 保持同一套编码；
 * 状态与流转的**可执行性**由数据库配置决定，这里的常量只用于代码内判定与通知语义。
 */
public final class RdmConstants {

    private RdmConstants() {
    }

    /* ==================== 状态 ==================== */

    public static final String STATUS_DRAFT = "draft";
    public static final String STATUS_INTAKE_PENDING = "intake_pending";
    public static final String STATUS_INTAKE_REJECTED = "intake_rejected";
    public static final String STATUS_POOL = "pool";
    public static final String STATUS_ASSIGNED = "assigned";
    public static final String STATUS_EVALUATING = "evaluating";
    public static final String STATUS_REJECTED = "rejected";
    public static final String STATUS_ON_HOLD = "on_hold";
    public static final String STATUS_ACCEPTED = "accepted";
    public static final String STATUS_PRD_DESIGNING = "prd_designing";
    public static final String STATUS_REVIEWING = "reviewing";
    public static final String STATUS_REVIEW_PASSED = "review_passed";
    public static final String STATUS_SCHEDULED = "scheduled";
    public static final String STATUS_DESIGNING = "designing";
    public static final String STATUS_DEVELOPING = "developing";
    public static final String STATUS_INTEGRATION = "integration";
    public static final String STATUS_TESTING = "testing";
    public static final String STATUS_TEST_PASSED = "test_passed";
    public static final String STATUS_UAT_PENDING = "uat_pending";
    public static final String STATUS_UAT_REJECTED = "uat_rejected";
    public static final String STATUS_RELEASED = "released";
    public static final String STATUS_VERIFIED = "verified";
    public static final String STATUS_CLOSED = "closed";

    /** 可编辑/可删除的草稿态（提交前） */
    public static final String[] EDITABLE_STATUS = {STATUS_DRAFT, STATUS_INTAKE_REJECTED};

    /** 已进入产研受理链路（非提出人可控）的状态 */
    public static final String[] IN_PROGRESS_STATUS = {
        STATUS_POOL, STATUS_ASSIGNED, STATUS_EVALUATING, STATUS_ACCEPTED, STATUS_PRD_DESIGNING,
        STATUS_REVIEWING, STATUS_REVIEW_PASSED, STATUS_SCHEDULED, STATUS_DESIGNING, STATUS_DEVELOPING,
        STATUS_INTEGRATION, STATUS_TESTING, STATUS_TEST_PASSED, STATUS_UAT_PENDING, STATUS_UAT_REJECTED,
    };

    /* ==================== 流转动作 ==================== */

    public static final String ACTION_SUBMIT = "submit";
    public static final String ACTION_SUBMIT_POOL = "submit_pool";
    public static final String ACTION_WITHDRAW = "withdraw";
    public static final String ACTION_RESUBMIT = "resubmit";
    public static final String ACTION_APPROVE_INTAKE = "approve_intake";
    public static final String ACTION_REJECT_INTAKE = "reject_intake";
    public static final String ACTION_DISPATCH = "dispatch";
    public static final String ACTION_REASSIGN = "reassign";
    public static final String ACTION_START_EVALUATE = "start_evaluate";
    public static final String ACTION_PRD_START = "prd_start";
    public static final String ACTION_REVIEW_START = "review_start";
    public static final String ACTION_REVIEW_PASS = "review_pass";
    public static final String ACTION_REVIEW_REJECT = "review_reject";
    public static final String ACTION_DESIGN_START = "design_start";
    public static final String ACTION_DESIGN_DONE = "design_done";
    public static final String ACTION_DEV_START = "dev_start";
    public static final String ACTION_DEV_DONE = "dev_done";
    public static final String ACTION_TEST_START = "test_start";
    public static final String ACTION_TEST_DONE = "test_done";
    public static final String ACTION_TEST_REJECT = "test_reject";
    public static final String ACTION_SUBMIT_UAT = "submit_uat";
    public static final String ACTION_URGE = "urge";
    public static final String ACTION_SCHEDULE = "schedule";
    public static final String ACTION_ACCEPT = "accept";
    public static final String ACTION_REJECT = "reject";
    public static final String ACTION_HOLD = "hold";
    public static final String ACTION_UNHOLD = "unhold";
    public static final String ACTION_REOPEN = "reopen";
    public static final String ACTION_RELEASE = "release";
    public static final String ACTION_VERIFY = "verify";
    public static final String ACTION_UAT_FAIL = "uat_fail";

    /* ==================== 参与角色 ==================== */

    public static final String ROLE_SUBMITTER = "SUBMITTER";
    public static final String ROLE_DEPT_LEADER = "DEPT_LEADER";
    public static final String ROLE_APPROVER = "APPROVER";
    public static final String ROLE_DISPATCHER = "DISPATCHER";
    public static final String ROLE_PM = "PM";
    public static final String ROLE_PMO = "PMO";
    public static final String ROLE_DEV_LEAD = "DEV_LEAD";
    public static final String ROLE_DEV = "DEV";
    public static final String ROLE_DESIGNER = "DESIGNER";
    public static final String ROLE_QA = "QA";
    public static final String ROLE_ACCEPTOR = "ACCEPTOR";
    public static final String ROLE_CC = "CC";

    /* ==================== 列表视角（scope） ==================== */

    public static final String SCOPE_MINE = "mine";
    public static final String SCOPE_TODO = "todo";
    /**
     * 视角：待我審批（准入审批人在 OA 审批任务里的待办）。
     * <p>不能并入 {@code SCOPE_TODO}：todo 走的是需求表上的 PM/验收人/研发负责人三个字段，
     * 而审批人只存在于 OA 审批任务表；两者混用会造成工作台显示 3 条、点进去列表为空。
     */
    public static final String SCOPE_APPROVING = "approving";
    public static final String SCOPE_POOL = "pool";
    public static final String SCOPE_PRODUCT = "product";
    public static final String SCOPE_DELIVERY = "delivery";
    public static final String SCOPE_ACCEPTANCE = "acceptance";
    public static final String SCOPE_ALL = "all";

    /* ==================== 验收结论 ==================== */

    public static final String ACCEPT_PASS = "pass";
    public static final String ACCEPT_CONDITIONAL = "conditional";
    public static final String ACCEPT_FAIL = "fail";

    /* ==================== 业务编码 ==================== */

    /** 需求准入审批流程编码（对应 biz_oa_process.process_code / biz_workflow_config.flow_type） */
    public static final String INTAKE_PROCESS_CODE = "rdm_intake";

    /**
     * OA 准入單的流程狀態（取值與 OA 引擎 biz_oa_request.flow_status 一致）。
     * <p>RDM 側只靠它判斷「審批已結束但回調未落狀態」的補償場景；
     * 審批动作本身一律代理給 OA，不在 RDM 重現一套審批。
     */
    public static final String FLOW_PENDING = "pending";
    public static final String FLOW_APPROVED = "approved";
    public static final String FLOW_REJECTED = "rejected";

    /** 需求变更审批流程编码（变更申请走 OA，通过后计 change_count） */
    public static final String CHANGE_PROCESS_CODE = "rdm_change";

    /**
     * 需求菜单 key（权限门控用）。
     * <p>菜单收敛（rdm:menu-seed:v3.7）后不再定义 MENU_SUBMIT / MENU_PRODUCT：
     * 「提交需求」与「產品需求處理」已退役，它们的动作已平移到 MENU_REQUIREMENT，
     * 保留常量只会诱导出指向死菜单的新注解。分配权仍单独锁 MENU_INTAKE。
     */
    public static final String MENU_REQUIREMENT = "rdm-requirement";
    /**
     * 菜单：需求池（分配与审批环节）。
     * <p>它同时承载两个能力，而这两个能力天然同侧 —— 看不到单子就分不出去：
     * view = 全量可见（canSeeAll 认它），edit = 分配权（canDispatch 认它）。
     * <p>全量可见以前是从 rdm-requirement 的 export/delete 推断的（等于“能导 Excel 就能读全公司需求”）；
     * 它不该摊到人人都有的台账菜单上，而应跟分配权一起锁在这个窄权限菜单里。
     */
    public static final String MENU_INTAKE = "rdm-intake";
    public static final String MENU_ACCEPTANCE = "rdm-acceptance";
    public static final String MENU_DASHBOARD = "rdm-dashboard";
    public static final String MENU_WORKBENCH = "rdm-workbench";
    public static final String MENU_CONFIG = "rdm-config-status";

    /* ==================== 通知事件 ==================== */

    public static final String EVENT_INTAKE_TODO = "INTAKE_TODO";
    public static final String EVENT_INTAKE_PASS = "INTAKE_PASS";
    public static final String EVENT_INTAKE_REJECT = "INTAKE_REJECT";
    public static final String EVENT_ASSIGNED = "ASSIGNED";
    public static final String EVENT_STATUS_CHANGED = "STATUS_CHANGED";
    public static final String EVENT_ACCEPT_TODO = "ACCEPT_TODO";
    public static final String EVENT_ACCEPT_DONE = "ACCEPT_DONE";
    public static final String EVENT_SLA_WARN = "SLA_WARN";
    public static final String EVENT_SLA_OVERDUE = "SLA_OVERDUE";
    public static final String EVENT_URGE = "URGE";
    public static final String EVENT_REVIEW_TODO = "REVIEW_TODO";
    public static final String EVENT_TASK_ASSIGNED = "TASK_ASSIGNED";
    public static final String EVENT_CHANGE_TODO = "CHANGE_TODO";
    public static final String EVENT_CHANGE_DECIDED = "CHANGE_DECIDED";

    /** 钉钉通知场景（对应 sys_notification_channel.scenarios） */
    public static final String NOTIFY_SCENARIO = "rdm";

    /** 菜单：研發交付一级分组（分组本身不可访问，接口必须挂子菜单） */
    public static final String MENU_DELIVERY = "rdm-delivery";
    /** 菜单：交付工作台（我的任务 + 进度/工时上报） */
    public static final String MENU_DELIVERY_BOARD = "rdm-delivery-board";
    /** 菜单：迭代排期（产能与起止维护；删除迭代也挂在这里） */
    public static final String MENU_DELIVERY_ITERATION = "rdm-delivery-iteration";
    /** 菜单：需求總看板下的四个二级菜单（v3.3 看板升为分组，分组 key 仍为 MENU_DASHBOARD） */
    public static final String MENU_DASHBOARD_BOARD = "rdm-dashboard-board";
    /** 菜单：質量口徑（一次通过率/返工/缺陷） */
    public static final String MENU_DASHBOARD_QUALITY = "rdm-dashboard-quality";
    /** 菜单：版本追溯 */
    public static final String MENU_DASHBOARD_VERSION = "rdm-dashboard-version";
    /** 菜单：交付周报 */
    public static final String MENU_DASHBOARD_REPORT = "rdm-dashboard-report";
    /** 菜单：個人產出積分 */
    public static final String MENU_DASHBOARD_SCORE = "rdm-dashboard-score";
    /** 菜单：效能量趨勢 */
    public static final String MENU_DASHBOARD_TREND = "rdm-dashboard-trend";
    /**
     * 菜单：風險中心（风险摘要 + 风险明细，从总看板拆出）。
     * <p>key 前缀保留 rdm-dashboard-：菜单 key 是权限与前端映射的挂，
     * 改名将丢存量授权，所以即使归属变更也不重命名。
     */
    public static final String MENU_DASHBOARD_RISK = "rdm-dashboard-risk";
    /** 菜单：部門與人員產出（效能與產出分组，v3.5 新增） */
    public static final String MENU_EFFICIENCY_OUTPUT = "rdm-efficiency-output";
    /** 菜单：積分規則配置（需求配置分组下） */
    public static final String MENU_CONFIG_SCORE = "rdm-config-score";

    /* ==================== 验收用例（M3） ==================== */

    /** 用例结论：通过 */
    public static final String CASE_PASS = "pass";
    /** 用例结论：不通过（计缺陷） */
    public static final String CASE_FAIL = "fail";
    /** 用例结论：阻塞未测（同样计缺陷，不能当作“没测就不算问题”） */
    public static final String CASE_BLOCKED = "blocked";

    /** 缺陷严重度：致命（阻断上线） */
    public static final String SEVERITY_CRITICAL = "critical";
    /** 缺陷严重度：严重（阻断上线） */
    public static final String SEVERITY_MAJOR = "major";
    /** 缺陷严重度：一般 */
    public static final String SEVERITY_MINOR = "minor";
    /** 缺陷严重度：轻微 */
    public static final String SEVERITY_TRIVIAL = "trivial";

    /**
     * 阻断上线的缺陷等级。
     * <p>存在这两类缺陷时禁止「验收通过」与「有条件通过」，只能退回：
     * 否则“有条件通过”会变成绕过缺陷带病上线的后门，一次通过率也会失真。
     */
    public static final Set<String> BLOCKING_SEVERITIES = Set.of(SEVERITY_CRITICAL, SEVERITY_MAJOR);

    /* ==================== 产出积分（M4） ==================== */

    /** 需求复杂度（与字典 RDM_COMPLEXITY / 前端 RDM_COMPLEXITY 同名） */
    public static final String COMPLEXITY_SIMPLE = "SIMPLE";
    public static final String COMPLEXITY_MEDIUM = "MEDIUM";
    public static final String COMPLEXITY_COMPLEX = "COMPLEX";
    public static final String COMPLEXITY_HUGE = "HUGE";

    /** 需求类型（与字典 RDM_REQ_TYPE 同名） */
    public static final String TYPE_NEW_MENU = "NEW_MENU";
    public static final String TYPE_NEW_FEATURE = "NEW_FEATURE";
    public static final String TYPE_OPTIMIZE = "OPTIMIZE";
    public static final String TYPE_BUG = "BUG";
    public static final String TYPE_DATA = "DATA";
    public static final String TYPE_POLICY = "POLICY";
    public static final String TYPE_INTEGRATION = "INTEGRATION";
    public static final String TYPE_OTHER = "OTHER";

    /** 分配模式：各角色分别计分（鼓励协作，但人均分随参与人数膨胀） */
    public static final String ALLOC_EACH = "each";
    /** 分配模式：单条需求总分固定、按角色系数瓜分（零和，可算人均） */
    public static final String ALLOC_SPLIT = "split";

    /** 成因：交付基准分 */
    public static final String SCORE_REASON_BASE = "delivered";
    /** 成因：按时因子 */
    public static final String SCORE_REASON_ON_TIME = "onTime";
    /** 成因：质量因子 */
    public static final String SCORE_REASON_SATISFACTION = "satisfaction";
    /** 成因：人工调整（绩效申诉入口预留） */
    public static final String SCORE_REASON_MANUAL = "manualAdjust";

    /** 绩效推送状态 */
    public static final String PUSH_NONE = "none";
    public static final String PUSH_SUGGESTED = "suggested";
    public static final String PUSH_CONFIRMED = "confirmed";
    public static final String PUSH_REJECTED = "rejected";

    /** 绩效指标类型：RDM 产出积分（对应 hr_perf_indicator.indicator_type） */
    public static final String INDICATOR_TYPE_RDM_OUTPUT = "RDM_OUTPUT";
    /** 建议值来源标记 */
    public static final String SUGGEST_SOURCE_RDM = "RDM";

    /** 快照维度 */
    public static final String DIM_COMPANY = "COMPANY";
    public static final String DIM_DEPT = "DEPT";
    public static final String DIM_PERSON = "PERSON";
    public static final String DIM_PM = "PM";
    /**
     * COMPANY 维度的 dim_id 占位值。
     * <p>必须用 0 而不是 NULL：MySQL 唯一索引不约束 NULL，存 NULL 会让
     * uk_rdm_metric_day(stat_date,dim_type,dim_id) 失效，快照回填重复跑就长重复行。
     * 写入端与趋势读取端必须共用本常量，不得各自判断。
     */
    public static final long COMPANY_DIM_ID = 0L;

    /* ==================== 默认值 ==================== */

    /** 未命中任何环节 SLA 配置时的默认时效（小时） */
    public static final int DEFAULT_SLA_HOURS = 72;
    /** 需求标题最大长度 */
    public static final int TITLE_MAX_LENGTH = 200;
}
