package com.mftb.admin.constant;

import java.util.Set;

/**
 * 績效考核域常量：周期类型、单据状态、字典类型、OA 流程编码、菜单 key、编号规则。
 * <p>
 * 唯一真值来源，禁止业务代码散落魔法字符串。参考 SQL: backend/sql/201_hr_performance.sql
 */
public final class HrPerfConstants {

    private HrPerfConstants() {
    }

    // ==================== 周期与状态 ====================

    public static final String CYCLE_QUARTER = "QUARTER";
    public static final String CYCLE_YEAR = "YEAR";
    public static final Set<String> CYCLE_TYPES = Set.of(CYCLE_QUARTER, CYCLE_YEAR);

    /** 周期：草稿 → 已发布（可发起计划）→ 已关闭 */
    public static final String CYCLE_DRAFT = "draft";
    public static final String CYCLE_PUBLISHED = "published";
    public static final String CYCLE_CLOSED = "closed";

    /** 计划：草稿 → 进行中 → 待确认(已提交审批) → 已确认 */
    public static final String PLAN_DRAFT = "draft";
    public static final String PLAN_RUNNING = "running";
    public static final String PLAN_CONFIRM_PENDING = "confirm_pending";
    public static final String PLAN_CONFIRMED = "confirmed";

    /**
     * 考核单状态机：待自评 → 待上级评 → 待校准 → 待确认 → 已确认；
     * voided 用于员工离职/误建作废。
     */
    public static final String A_SELF_PENDING = "self_pending";
    public static final String A_SUPERVISOR_PENDING = "supervisor_pending";
    public static final String A_CALIBRATION_PENDING = "calibration_pending";
    public static final String A_CONFIRM_PENDING = "confirm_pending";
    public static final String A_CONFIRMED = "confirmed";
    public static final String A_VOIDED = "voided";

    /** 允许 HR 校准改判的状态：仅待校准。已随计划提交审批（confirm_pending）的单据不得再改，
     * 否则批量回调只处理待确认状态，被改判的单据会被静默漏掉。 */
    public static final Set<String> CALIBRATABLE_STATUSES = Set.of(A_CALIBRATION_PENDING);

    // ==================== 字典（sys_hr_dict.dict_type） ====================

    /** 考核等级：S/A/B/C/D，remark 内写分值区间 */
    public static final String DICT_GRADE = "PERF_GRADE";
    /** 指标类型：業績/能力/態度/合規 */
    public static final String DICT_INDICATOR_TYPE = "PERF_INDICATOR_TYPE";

    /** 指标打分区间 0–100 */
    public static final int INDICATOR_SCORE_MAX = 100;

    // ==================== M2：改判留痕 ====================

    /**
     * 留痕动作——只增不改的流水，一次动作一行。
     * CALIBRATE=HR 校准改判；APPEAL_REVISE=申诉受理后修订结果；DIST_WAIVER=强制分布例外放行；
     * REASSIGN=改派评估人（决“谁来打分”的变更，事后同样需要追责）。
     */
    public static final String LOG_CALIBRATE = "CALIBRATE";
    public static final String LOG_APPEAL_REVISE = "APPEAL_REVISE";
    public static final String LOG_DISTRIBUTION_WAIVER = "DIST_WAIVER";
    public static final String LOG_REASSIGN = "REASSIGN";

    // ==================== M2：申诉 ====================

    /** 申诉状态机：待處理 → 處理中 → 已办结/已驳回（后两态为终态） */
    public static final String APPEAL_PENDING = "pending";
    public static final String APPEAL_PROCESSING = "processing";
    public static final String APPEAL_RESOLVED = "resolved";
    public static final String APPEAL_REJECTED = "rejected";
    public static final Set<String> APPEAL_STATUSES =
            Set.of(APPEAL_PENDING, APPEAL_PROCESSING, APPEAL_RESOLVED, APPEAL_REJECTED);
    /** 可被受理/驳回/重校准的申诉态（终态不得再动，否则结论会被覆写） */
    public static final Set<String> APPEAL_OPEN_STATUSES = Set.of(APPEAL_PENDING, APPEAL_PROCESSING);

    /** 申诉结果字典（进 sys_hr_dict，字典维护页可管） */
    public static final String DICT_APPEAL_STATUS = "PERF_APPEAL_STATUS";

    // ==================== 语种与审批 ====================

    /** 计划整批确认走的 OA 流程编码 */
    public static final String PROCESS_CODE = "hr_perf_confirm";

    /** 一级菜单域 */
    public static final String MENU_DOMAIN = "perf-center";
    /** HR：周期与计划 */
    public static final String MENU_ADMIN = "hr-perf-admin";
    /** 评估人：评分工作台 */
    public static final String MENU_REVIEW = "hr-perf-review";
    /** HR：校准与确认 */
    public static final String MENU_CALIBRATION = "hr-perf-calibration";
    /** 员工自助：我的绩效（挂在 ess-center 下） */
    public static final String MENU_SELF = "ess-performance";

    /** M2 台账一级域（与绩效执行域分开：受众是 HR 与分析岗，授权面不同） */
    public static final String MENU_REPORT_DOMAIN = "perf-report-center";
    /** HR：结果台账（等级分布/部门对比/趋势 + 导出） */
    public static final String MENU_LEDGER = "hr-perf-ledger";
    /** HR：改判留痕追溯 */
    public static final String MENU_AUDIT = "hr-perf-audit";
    /** HR：申诉受理 */
    public static final String MENU_APPEAL = "hr-perf-appeal";

    // ==================== 编号规则 ====================

    public static final String SEQ_CYCLE = "hr_perf_cycle";
    public static final String SEQ_PLAN = "hr_perf_plan";
    public static final String SEQ_ASSESSMENT = "hr_perf_assessment";
    public static final String SEQ_APPEAL = "hr_perf_appeal";

    public static boolean isValidCycleType(String type) {
        return type != null && CYCLE_TYPES.contains(type);
    }

    public static boolean isValidAppealStatus(String status) {
        return status != null && APPEAL_STATUSES.contains(status);
    }
}
