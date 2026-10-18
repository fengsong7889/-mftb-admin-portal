package com.mftb.admin.constant;

import java.util.Map;
import java.util.Set;

/**
 * 雇佣数据差异类别（方案 §7.1「历史数据迁移先生成差异清单，由 HR 确认冲突来源」）。
 * <p>
 * 这里只定义「哪两种事实源对不上」的类别码，不改任何数据：{@code sys_user} 任职快照、
 * {@code emp_position_record} 异动事实、{@code hr_employment_period} 雇佣期间三者
 * 在双轨期间允许并存不一致，但必须被枚举出来交给 HR 判定，不能由代码替 HR 选一个。
 * <p>
 * 类别码是前后端契约：界面按 code 走 i18n（{@code hrProfileDiff.*}），
 * {@link #LABELS} 只作日志与兜底展示。
 */
public final class HrProfileDiff {

    private HrProfileDiff() {
    }

    // ── 严重度 ──

    /** 提示：不算冲突，但会让人误判数据缺失 */
    public static final String SEVERITY_INFO = "INFO";
    /** 需确认：两份事实源对不上，或结论无法由人事事实派生 */
    public static final String SEVERITY_WARN = "WARN";
    /** 高风险：可能导致越权保留（离职了但账号还能登录） */
    public static final String SEVERITY_ERROR = "ERROR";

    // ── 类别码 ──

    /** 完全没有任职记录：在职状态、雇佣起点都无从派生 */
    public static final String NO_POSITION_RECORD = "NO_POSITION_RECORD";
    /** 有异动记录但找不到入职/重新入职锚点：本次雇佣起点未核实 */
    public static final String START_ANCHOR_MISSING = "START_ANCHOR_MISSING";
    /** 账号快照部门 ≠ 该时点生效任职的部门 */
    public static final String DEPT_MISMATCH = "DEPT_MISMATCH";
    /** 账号快照职位 ≠ 该时点生效任职的职位 */
    public static final String POSITION_MISMATCH = "POSITION_MISMATCH";
    /** 人事事实已离职但账号仍启用（越权保留风险） */
    public static final String RESIGNED_ACCOUNT_ACTIVE = "RESIGNED_ACCOUNT_ACTIVE";
    /** 人事事实仍在职但账号已停用（可能是冻结，也可能是错误建档） */
    public static final String ACTIVE_EMPLOYMENT_ACCOUNT_DISABLED = "ACTIVE_EMPLOYMENT_ACCOUNT_DISABLED";
    /** 可由任职事实派生出雇佣期间，但雇佣期间表还没有行（双轨期间属正常，待 HR 确认后登记） */
    public static final String PERIOD_NOT_REGISTERED = "PERIOD_NOT_REGISTERED";
    /** 已登记的雇佣期间段数与任职事实可派生的段数不符 */
    public static final String PERIOD_COUNT_MISMATCH = "PERIOD_COUNT_MISMATCH";
    /** 段被后续入职截断但找不到离职记录：结束日未知 */
    public static final String PERIOD_END_DATE_UNKNOWN = "PERIOD_END_DATE_UNKNOWN";
    /** 存在未来才生效的异动（待生效安排，不是错误） */
    public static final String FUTURE_ASSIGNMENT = "FUTURE_ASSIGNMENT";

    /** 全部类别码 */
    public static final Set<String> ALL_CODES = Set.of(
            NO_POSITION_RECORD, START_ANCHOR_MISSING, DEPT_MISMATCH, POSITION_MISMATCH,
            RESIGNED_ACCOUNT_ACTIVE, ACTIVE_EMPLOYMENT_ACCOUNT_DISABLED,
            PERIOD_NOT_REGISTERED, PERIOD_COUNT_MISMATCH, PERIOD_END_DATE_UNKNOWN, FUTURE_ASSIGNMENT);

    /** 类别码 → 严重度 */
    public static final Map<String, String> SEVERITIES = Map.ofEntries(
            Map.entry(NO_POSITION_RECORD, SEVERITY_WARN),
            Map.entry(START_ANCHOR_MISSING, SEVERITY_WARN),
            Map.entry(DEPT_MISMATCH, SEVERITY_WARN),
            Map.entry(POSITION_MISMATCH, SEVERITY_WARN),
            Map.entry(RESIGNED_ACCOUNT_ACTIVE, SEVERITY_ERROR),
            Map.entry(ACTIVE_EMPLOYMENT_ACCOUNT_DISABLED, SEVERITY_WARN),
            Map.entry(PERIOD_NOT_REGISTERED, SEVERITY_INFO),
            Map.entry(PERIOD_COUNT_MISMATCH, SEVERITY_WARN),
            Map.entry(PERIOD_END_DATE_UNKNOWN, SEVERITY_WARN),
            Map.entry(FUTURE_ASSIGNMENT, SEVERITY_INFO));

    /** 类别码 → 繁体名称（日志/兜底；界面用 i18n） */
    public static final Map<String, String> LABELS = Map.ofEntries(
            Map.entry(NO_POSITION_RECORD, "無任職記錄"),
            Map.entry(START_ANCHOR_MISSING, "僱傭起點未核實"),
            Map.entry(DEPT_MISMATCH, "部門快照不符"),
            Map.entry(POSITION_MISMATCH, "職位快照不符"),
            Map.entry(RESIGNED_ACCOUNT_ACTIVE, "已離職但帳號啟用"),
            Map.entry(ACTIVE_EMPLOYMENT_ACCOUNT_DISABLED, "在職但帳號停用"),
            Map.entry(PERIOD_NOT_REGISTERED, "僱傭期間待登記"),
            Map.entry(PERIOD_COUNT_MISMATCH, "僱傭期間段數不符"),
            Map.entry(PERIOD_END_DATE_UNKNOWN, "結束日不明"),
            Map.entry(FUTURE_ASSIGNMENT, "有待生效異動"));

    /** 严重度排序权重（降序展示时高风险在前） */
    public static int severityRank(String severity) {
        return switch (severity == null ? SEVERITY_INFO : severity) {
            case SEVERITY_ERROR -> 3;
            case SEVERITY_WARN -> 2;
            default -> 1;
        };
    }

    /** 取一组类别码里最高的严重度 */
    public static String highestSeverity(Set<String> codes) {
        String highest = SEVERITY_INFO;
        for (String code : codes) {
            String severity = SEVERITIES.getOrDefault(code, SEVERITY_INFO);
            if (severityRank(severity) > severityRank(highest)) {
                highest = severity;
            }
        }
        return highest;
    }
}
