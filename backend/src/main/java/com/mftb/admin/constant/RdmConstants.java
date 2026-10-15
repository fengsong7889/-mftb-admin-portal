package com.mftb.admin.constant;

import java.util.Set;

/**
 * RDM（產研交付）需求全生命周期常量。
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
    /** 产品经理自需求池认领（原子抢单，不走通用流转入口） */
    public static final String ACTION_CLAIM = "claim";
    public static final String ACTION_REASSIGN = "reassign";
    /** 改派：换受理人但保留旧受理人的历史参与与贡献 */
    public static final String ACTION_REASSIGN_PM = "reassign_pm";
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
    /**
     * 上线后待評分：需求已 released，等业务验收人打 1-5 分。
     * <p>必须与 {@code SCOPE_ACCEPTANCE} 分开：那个只捞 uat_pending，是**上线前预验收**；
     * 两者在业务上是两件事实（质量预验 vs 上线后是否真解决问题），混在一个队列里
     * 会让「待验收」计数把两种动作算成一件事。
     * <p>按验收人字段收敛（非管理视角），不是"与我相关"：提单人不是验收人时，
     * 这条队列对他没有意义，摆出来只会让他以为该自己操作。
     */
    public static final String SCOPE_ACCEPTANCE_POST = "acceptance_post";
    /** 我的验收记录：我作为验收人签过的单子（含已上线待评分、已确认交付、预验收退回） */
    public static final String SCOPE_ACCEPTANCE_HISTORY = "acceptance_history";
    public static final String SCOPE_ALL = "all";

    /* ==================== 验收结论 ==================== */

    public static final String ACCEPT_PASS = "pass";
    public static final String ACCEPT_CONDITIONAL = "conditional";
    public static final String ACCEPT_FAIL = "fail";

    /**
     * 验收阶段（阶段 4）：上线前预验收。
     * <p>验的是「质量能不能上线」，结论不写入正式满意度口径。
     */
    public static final String ACCEPT_STAGE_PRE = "pre_release";

    /**
     * 验收阶段（阶段 4）：上线后业务验收。
     * <p>验的是「上线后是否真的解决了业务问题」，1-5 分满意度以此为口径。
     */
    public static final String ACCEPT_STAGE_POST = "post_release";

    /** 交付满意度评分区间（业务验收必填，不允许以「忘了打分」的名义交空值） */
    public static final int SCORE_MIN = 1;
    public static final int SCORE_MAX = 5;

    /** 发布放行单有效期（天）：过期必须重新过闸，防止一次放行管 forever */
    public static final int RELEASE_VALID_DAYS = 7;

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

    /** 事件：发布放行（发起/放行/驳回均用此事件，接收人按动作区分） */
    public static final String EVENT_RELEASE_GATE = "RELEASE_GATE";
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

    /* ==================== 项目状态（Batch 1） ==================== */

    public static final String PROJECT_PREPARING = "preparing";
    public static final String PROJECT_IN_PROGRESS = "in_progress";
    public static final String PROJECT_PARTIAL_DELIVERED = "partial_delivered";
    public static final String PROJECT_ALL_DELIVERED = "all_delivered";
    public static final String PROJECT_CLOSED = "closed";

    /** 项目活跃状态（未关闭） */
    public static final Set<String> PROJECT_ACTIVE_STATUSES = Set.of(
            PROJECT_PREPARING, PROJECT_IN_PROGRESS, PROJECT_PARTIAL_DELIVERED, PROJECT_ALL_DELIVERED);

    /* ==================== 交付项状态（Batch 1） ==================== */

    public static final String DI_PREPARING = "preparing";
    public static final String DI_DEVELOPING = "developing";
    public static final String DI_TESTING = "testing";
    public static final String DI_PENDING_ACCEPTANCE = "pending_acceptance";
    public static final String DI_PENDING_RELEASE = "pending_release";
    public static final String DI_RELEASED_PENDING = "released_pending";
    public static final String DI_DONE = "done";

    /** 交付项活跃状态（未完成） */
    public static final Set<String> DI_ACTIVE_STATUSES = Set.of(
            DI_PREPARING, DI_DEVELOPING, DI_TESTING, DI_PENDING_ACCEPTANCE,
            DI_PENDING_RELEASE, DI_RELEASED_PENDING);

    /* ==================== 测试批次状态（Batch 1） ==================== */

    public static final String TB_PENDING = "pending";
    public static final String TB_ACCEPTED = "accepted";
    public static final String TB_RETURNED = "returned";
    public static final String TB_EXECUTING = "executing";
    public static final String TB_PASSED = "passed";
    public static final String TB_FAILED = "failed";

    /** 测试批次未结束状态 */
    public static final Set<String> TB_OPEN_STATUSES = Set.of(
            TB_PENDING, TB_ACCEPTED, TB_EXECUTING);

    /* ==================== 问题状态（Batch 1） ==================== */

    public static final String ISSUE_OPEN = "open";
    public static final String ISSUE_PROCESSING = "processing";
    public static final String ISSUE_PENDING_VERIFY = "pending_verify";
    public static final String ISSUE_RESOLVED = "resolved";
    public static final String ISSUE_DEFERRED = "deferred";

    /** 问题未关闭状态 */
    public static final Set<String> ISSUE_OPEN_STATUSES = Set.of(
            ISSUE_OPEN, ISSUE_PROCESSING, ISSUE_PENDING_VERIFY);

    /* ==================== 问题严重程度（Batch 1） ==================== */

    public static final String SEV_CRITICAL = "critical";
    public static final String SEV_MAJOR = "major";
    public static final String SEV_MINOR = "minor";
    public static final String SEV_TRIVIAL = "trivial";

    /* ==================== 延期决定状态（Batch 1） ==================== */

    public static final String DEFER_PENDING_PRODUCT = "pending_product";
    public static final String DEFER_PENDING_BIZ = "pending_biz";
    public static final String DEFER_PENDING_BIND = "pending_bind";
    public static final String DEFER_EFFECTIVE = "effective";
    public static final String DEFER_REJECTED = "rejected";

    /** 延期决定未结束状态 */
    public static final Set<String> DEFER_OPEN_STATUSES = Set.of(
            DEFER_PENDING_PRODUCT, DEFER_PENDING_BIZ, DEFER_PENDING_BIND);

    /* ==================== 问题闭环（任务21：取消/合并/阻断口径） ==================== */

    /** 问题已取消（重复/无效/不予处理），非阻断终态 */
    public static final String ISSUE_CANCELLED = "cancelled";
    /** 问题已合并到另一问题（承接目标记于该问题），非阻断终态 */
    public static final String ISSUE_MERGED = "merged";

    /**
     * 问题终态（不再阻断门禁）：已解决 / 已取消 / 已合并。
     * <p>注意：<b>deferred 不在其中</b>——延期是否解除阻断取决于延期是否「已获批准」，
     * 由 {@link #DEFER_APPROVED_STATUSES} 判定，不能仅凭问题状态 deferred 就放行。
     */
    public static final Set<String> ISSUE_CLOSED_STATUSES = Set.of(
            ISSUE_RESOLVED, ISSUE_CANCELLED, ISSUE_MERGED);

    /**
     * 延期「已获批准」的状态：待建立承接 / 已生效。
     * <p>只有走到这两个状态，才代表产品（及必要时的业务）已批准延期，此时严重问题的阻断才被解除；
     * pending_product/pending_biz（待决）与 rejected（被拒）期间问题持续阻断。
     */
    public static final Set<String> DEFER_APPROVED_STATUSES = Set.of(
            DEFER_PENDING_BIND, DEFER_EFFECTIVE);

    /** 需求「尚未准入」的状态：草稿 / 待准入 / 准入被拒（承接需求必须已准入，不在此列） */
    public static final Set<String> REQ_NOT_ADMITTED_STATUSES = Set.of(
            STATUS_DRAFT, STATUS_INTAKE_PENDING, STATUS_INTAKE_REJECTED);

    /* ==================== 延期逾期升级（任务21，按真实工作日判定） ==================== */

    /** 逾期升级级别 1 阈值：超过修复期限 ≥1 个工作日 */
    public static final int ESCALATION_L1_OVERDUE_DAYS = 1;
    /** 逾期升级级别 2 阈值：超过修复期限 ≥3 个工作日 */
    public static final int ESCALATION_L2_OVERDUE_DAYS = 3;
    /** 逾期升级级别 3 阈值：超过修复期限 ≥5 个工作日 */
    public static final int ESCALATION_L3_OVERDUE_DAYS = 5;
    /** 最高升级级别 */
    public static final int ESCALATION_LEVEL_MAX = 3;

    /* ==================== 承接与修复闭环证据（任务21） ==================== */

    /** 承接生效标记 */
    public static final int FOLLOWUP_ACTIVE = 1;
    /** 承接失效标记 */
    public static final int FOLLOWUP_INACTIVE = 0;
    /** 修复闭环结论：通过 */
    public static final String RESOLUTION_PASS = "pass";
    /** 修复闭环结论：不通过 */
    public static final String RESOLUTION_FAIL = "fail";

    /* ==================== 发布批次状态（Batch 1） ==================== */

    public static final String RB_PLANNING = "planning";
    public static final String RB_CHECKING = "checking";
    public static final String RB_APPROVED = "approved";
    public static final String RB_DEPLOYING = "deploying";
    public static final String RB_VERIFYING = "verifying";
    public static final String RB_RELEASED = "released";
    public static final String RB_ROLLED_BACK = "rolled_back";
    public static final String RB_CANCELLED = "cancelled";

    /** 发布批次活跃状态（未结束） */
    public static final Set<String> RB_ACTIVE_STATUSES = Set.of(
            RB_PLANNING, RB_CHECKING, RB_APPROVED, RB_DEPLOYING, RB_VERIFYING);

    /* ==================== 部署状态（Batch 1） ==================== */

    public static final String DEPLOY_PENDING = "pending";
    public static final String DEPLOY_DEPLOYING = "deploying";
    public static final String DEPLOY_SUCCESS = "success";
    public static final String DEPLOY_FAILED = "failed";
    public static final String DEPLOY_ROLLED_BACK = "rolled_back";

    /* ==================== 验收类型（Batch 1） ==================== */

    public static final String ACCEPTANCE_TYPE_PRODUCT = "product";
    public static final String ACCEPTANCE_TYPE_BUSINESS = "business";

    /* ==================== 验收路径（Batch 1） ==================== */

    /** 路径 A：先验收后上线 */
    public static final String PATH_A = "A";
    /** 路径 B：先上线后验收 */
    public static final String PATH_B = "B";

    /* ==================== 需求种类（Batch 1） ==================== */

    /** 聚合需求（项目级） */
    public static final String KIND_AGGREGATE = "aggregate";
    /** 执行需求（默认） */
    public static final String KIND_EXECUTION = "execution";

    /* ==================== 流程版本（Batch 1） ==================== */

    /** 流程版本 3：项目交付与质量管理链路 */
    public static final int FLOW_VERSION_3 = 3;

    /* ==================== 菜单 Key（Batch 1） ==================== */

    /** 菜单：项目总览 */
    public static final String MENU_DASHBOARD_PROJECT = "rdm-dashboard-project";
    /** 菜单：测试工作台 */
    public static final String MENU_DELIVERY_TEST = "rdm-delivery-test";
    /** 菜单：发布中心 */
    public static final String MENU_DELIVERY_RELEASE = "rdm-delivery-release";

    /* ==================== 原子幂等（Batch 3 / rdm:schema:v3.2） ==================== */

    /**
     * rdm_idempotent_log.status 取值。
     * <p>{@code legacy}=旧 V1/V2 路径（只认 request_id，不含绑定列）；
     * {@code processing}=executeOnce 业务执行前的原子占位；{@code completed}=业务与结果已同事务写入、可回放。
     * <p>受 CHECK 约束 {@code ck_rdm_idempotent_binding} 保护：processing/completed 时绑定列必须全部非空。
     */
    public static final String IDEMPOTENT_STATUS_LEGACY = "legacy";
    public static final String IDEMPOTENT_STATUS_PROCESSING = "processing";
    public static final String IDEMPOTENT_STATUS_COMPLETED = "completed";

    /* ==================== 发布申请/裁决/部署事实（Batch 3） ==================== */

    /** rdm_release_approval.action：申请放行 / 裁决放行 */
    public static final String APPROVAL_ACTION_APPLY = "apply";
    public static final String APPROVAL_ACTION_DECIDE = "decide";

    /** rdm_release_attempt.action：部署 / 验证 / 开放放量 / 回滚 */
    public static final String ATTEMPT_ACTION_DEPLOY = "deploy";
    public static final String ATTEMPT_ACTION_VERIFY = "verify";
    public static final String ATTEMPT_ACTION_OPEN = "open";
    public static final String ATTEMPT_ACTION_ROLLBACK = "rollback";

    /** 通用裁决结论（发布审批 / 豁免签署共用）：批准 / 驳回 */
    public static final String DECISION_APPROVED = "approved";
    public static final String DECISION_REJECTED = "rejected";

    /**
     * rdm_release_exemption_decision.decision_type：两类**独立**签署。
     * <p>产品风险确认 与 独立发布审批必须由不同签署人分别签，且都不得是豁免申请人本人
     * （管理员不得代签/自批），由服务层校验，常量层只定义取值。
     */
    public static final String EXEMPTION_DECISION_PRODUCT_RISK = "product_risk";
    public static final String EXEMPTION_DECISION_RELEASE = "release";

    /* ==================== 补验任务（Batch 3） ==================== */

    /** rdm_supplementary_verification.verification_type：产品补验 / 业务补验 */
    public static final String SUPPLEMENTARY_TYPE_PRODUCT = "product";
    public static final String SUPPLEMENTARY_TYPE_BUSINESS = "business";

    /** rdm_supplementary_verification.status */
    public static final String SUPPLEMENTARY_STATUS_PENDING = "pending";
    public static final String SUPPLEMENTARY_STATUS_COMPLETED = "completed";
    public static final String SUPPLEMENTARY_STATUS_OVERDUE = "overdue";
    public static final String SUPPLEMENTARY_STATUS_FAILED = "failed";

    /** rdm_supplementary_verification.result / rdm_issue_resolution.conclusion：通过 / 不通过 */
    public static final String SUPPLEMENTARY_RESULT_PASS = "pass";
    public static final String SUPPLEMENTARY_RESULT_FAIL = "fail";

    /* ==================== 灰度配置（Batch 4 / rdm:schema:v3.3） ==================== */

    /**
     * rdm_flow_config.scope_key 约定：全局行为字面量 {@code GLOBAL}（project_id 为 NULL）；
     * 项目行为 {@code PROJECT:<数字ID>}（project_id 与后缀一致），由 {@code ck_rdm_flow_scope} 强约束。
     */
    public static final String FLOW_SCOPE_GLOBAL = "GLOBAL";
    public static final String FLOW_SCOPE_PROJECT_PREFIX = "PROJECT:";

    /** 灰度开关取值：关闭 / 开启。V3 写入与发布是两个独立开关，且**默认关闭**（种子两开关均为 0）。 */
    public static final int FLOW_FLAG_OFF = 0;
    public static final int FLOW_FLAG_ON = 1;

    /** 构造项目级 scope_key：{@code PROJECT:<projectId>}。写入端与读取端必须共用，不得各自拼接。 */
    public static String projectScopeKey(long projectId) {
        return FLOW_SCOPE_PROJECT_PREFIX + projectId;
    }

    /* ==================== 数据迁移（Batch 4） ==================== */

    /** rdm_migration_batch.status：预览 → 确认 → 执行 → 暂停/完成/失败/回退 */
    public static final String MIGRATION_BATCH_PREVIEWED = "previewed";
    public static final String MIGRATION_BATCH_CONFIRMED = "confirmed";
    public static final String MIGRATION_BATCH_RUNNING = "running";
    public static final String MIGRATION_BATCH_PAUSED = "paused";
    public static final String MIGRATION_BATCH_COMPLETED = "completed";
    public static final String MIGRATION_BATCH_FAILED = "failed";
    public static final String MIGRATION_BATCH_ROLLED_BACK = "rolled_back";

    /** rdm_migration_item.status：逐项预览 → 确认 → 执行 → 完成/失败/阻塞/回退 */
    public static final String MIGRATION_ITEM_PREVIEWED = "previewed";
    public static final String MIGRATION_ITEM_CONFIRMED = "confirmed";
    public static final String MIGRATION_ITEM_RUNNING = "running";
    public static final String MIGRATION_ITEM_COMPLETED = "completed";
    public static final String MIGRATION_ITEM_FAILED = "failed";
    public static final String MIGRATION_ITEM_BLOCKED = "blocked";
    public static final String MIGRATION_ITEM_ROLLED_BACK = "rolled_back";

    /** rdm_migration_audit.action：不可覆盖审计的动作类型 */
    public static final String MIGRATION_ACTION_PREVIEW = "preview";
    public static final String MIGRATION_ACTION_CONFIRM = "confirm";
    public static final String MIGRATION_ACTION_EXECUTE = "execute";
    public static final String MIGRATION_ACTION_PAUSE = "pause";
    public static final String MIGRATION_ACTION_RESUME = "resume";
    public static final String MIGRATION_ACTION_ROLLBACK = "rollback";
    public static final String MIGRATION_ACTION_RECONCILE = "reconcile";

    /** rdm_migration_audit.result */
    public static final String MIGRATION_RESULT_SUCCESS = "success";
    public static final String MIGRATION_RESULT_FAILED = "failed";
    public static final String MIGRATION_RESULT_BLOCKED = "blocked";

    /** 迁移分块大小边界（rdm_migration_batch.chunk_size BETWEEN 1 AND 100） */
    public static final int MIGRATION_CHUNK_MIN = 1;
    public static final int MIGRATION_CHUNK_MAX = 100;
    public static final int MIGRATION_CHUNK_DEFAULT = 20;

    /* ==================== 通知事件级去重（Batch 4） ==================== */

    /**
     * rdm_notify_log.event_version 前缀约定：
     * {@code VERSION:<并发版本>}（版本驱动事件）或 {@code DATE:<yyyy-MM-dd>}（日期驱动事件，如到期提醒）。
     * 与 object_type/object_id/receiver_user_id 一起规范化摘要为 dedupe_key，保证同事件同版本同接收人只出站一次。
     */
    public static final String NOTIFY_EVENT_VERSION_PREFIX = "VERSION:";
    public static final String NOTIFY_EVENT_DATE_PREFIX = "DATE:";
}
