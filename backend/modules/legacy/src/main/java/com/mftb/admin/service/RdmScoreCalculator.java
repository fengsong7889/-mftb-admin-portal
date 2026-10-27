package com.mftb.admin.service;

import com.mftb.admin.constant.RdmConstants;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * RDM 产出积分算分器（纯计算，无状态、无 IO）。
 *
 * <p><b>与前端 {@code src/utils/rdmScore.ts} 是同一套公式的两个实现</b>：
 * 跨语言无法共享代码，因此两边各自实现 + 各自单测，且**两边使用同一组夹具与同一组期望值**
 * （见 RdmScoreCalculatorTest 与 rdmScore.test.ts）。任何一侧改公式而不改另一侧，
 * 页面显示的分与后端落库的分就会不一致，绩效引用后必然扯皮。
 *
 * <p>公式：{@code 复杂度权重 × 类型系数 × (1+优先级加分) × 按时因子 × 质量因子 × 角色系数 × 单位分}
 * <p>SPLIT 模式再除以「本需求计分角色系数之和」，实现单条需求总分固定的零和分配。
 */
public final class RdmScoreCalculator {

    private RdmScoreCalculator() {
    }

    /** 复杂度基准权重 */
    private static final Map<String, Double> COMPLEXITY_WEIGHT = Map.of(
            RdmConstants.COMPLEXITY_SIMPLE, 1.0,
            RdmConstants.COMPLEXITY_MEDIUM, 2.0,
            RdmConstants.COMPLEXITY_COMPLEX, 3.5,
            RdmConstants.COMPLEXITY_HUGE, 5.0);

    /** 需求类型难度系数 */
    private static final Map<String, Double> TYPE_FACTOR = Map.of(
            RdmConstants.TYPE_NEW_MENU, 1.3,
            RdmConstants.TYPE_NEW_FEATURE, 1.2,
            RdmConstants.TYPE_OPTIMIZE, 1.0,
            RdmConstants.TYPE_BUG, 0.8,
            RdmConstants.TYPE_DATA, 0.9,
            RdmConstants.TYPE_POLICY, 0.9,
            RdmConstants.TYPE_INTEGRATION, 1.2,
            RdmConstants.TYPE_OTHER, 1.0);

    /** 优先级加分（系数增量） */
    private static final Map<String, Double> PRIORITY_BONUS = Map.of(
            "P0", 0.2, "P1", 0.1, "P2", 0.0, "P3", -0.1);

    /** 角色计分系数（不含验收人/提出人/上级/审批人，他们不参与产出分配） */
    private static final Map<String, Double> ROLE_FACTOR = Map.of(
            RdmConstants.ROLE_PM, 1.0,
            RdmConstants.ROLE_DEV_LEAD, 0.9,
            RdmConstants.ROLE_DEV, 1.0,
            RdmConstants.ROLE_DESIGNER, 0.7,
            RdmConstants.ROLE_QA, 0.8,
            RdmConstants.ROLE_PMO, 0.3,
            RdmConstants.ROLE_DISPATCHER, 0.2);

    /** 参与产出分配的角色（其余角色不计分） */
    public static final Set<String> SCORABLE_ROLES = ROLE_FACTOR.keySet();

    /** 逾期扣分封顶天数（超过不再多扣） */
    private static final double LATE_CAP_DAYS = 10.0;

    /** 按时因子下限 */
    private static final double ON_TIME_FLOOR = 0.5;

    /**
     * 计算结果：逐项因子 + 最终分 + 成因说明，全部要能回显给被考核人。
     */
    public record Result(
            double base,
            double typeFactor,
            double priorityFactor,
            double onTimeFactor,
            double qualityFactor,
            double roleFactor,
            double rawScore,
            BigDecimal finalScore,
            List<Reason> reasons) {
    }

    /** 单项成因 */
    public record Reason(String code, String label, double score, String memo) {
    }

    /** 计算入参（需求事实 + 公式参数） */
    public record Input(
            String roleCode,
            String complexity,
            String reqType,
            String priority,
            boolean onTime,
            int lateDays,
            int reworkCount,
            int reopenCount,
            Integer acceptanceScore,
            boolean firstPass,
            double roleFactorSum) {
    }

    /** 公式参数（来自 rdm_score_rule 当期生效行） */
    public record Params(
            double unitScore,
            double onTimeBonus,
            double latePenalty,
            double firstPassBonus,
            double reworkPenalty,
            double reopenPenalty,
            double acceptanceFactor,
            double qualityFloor,
            String allocMode) {
    }

    /** 现行默认口径（与规则种子 BASE 一致） */
    public static Params defaultParams() {
        return new Params(10, 0.1, 0.3, 0.1, 0.1, 0.05, 0.06, 0.6, RdmConstants.ALLOC_EACH);
    }

    /** 角色系数（不在计分角色内返回 0） */
    public static double roleFactorOf(String roleCode) {
        return roleCode == null ? 0 : ROLE_FACTOR.getOrDefault(roleCode, 0.0);
    }

    /** 计分角色系数之和（SPLIT 模式的分母） */
    public static double sumRoleFactors(List<String> roleCodes) {
        double sum = 0;
        for (String role : roleCodes) {
            sum += roleFactorOf(role);
        }
        return sum;
    }

    /**
     * 计算单条需求在某个角色下的积分。
     *
     * @param in     需求事实
     * @param params 当期规则参数
     */
    public static Result compute(Input in, Params params) {
        double base = COMPLEXITY_WEIGHT.getOrDefault(
                in.complexity() == null ? RdmConstants.COMPLEXITY_MEDIUM : in.complexity(), 2.0);
        double typeFactor = TYPE_FACTOR.getOrDefault(
                in.reqType() == null ? RdmConstants.TYPE_OTHER : in.reqType(), 1.0);
        double priorityBonus = PRIORITY_BONUS.getOrDefault(
                in.priority() == null ? "P2" : in.priority(), 0.0);
        double priorityFactor = 1 + priorityBonus;
        double roleFactor = roleFactorOf(in.roleCode());

        double onTimeFactor = in.onTime()
                ? 1 + params.onTimeBonus()
                : Math.max(1 - params.latePenalty() * Math.min(Math.max(in.lateDays(), 0) / LATE_CAP_DAYS, 1), ON_TIME_FLOOR);

        int rework = Math.max(in.reworkCount(), 0);
        int reopen = Math.max(in.reopenCount(), 0);
        double acceptanceDelta = in.acceptanceScore() == null
                ? 0 : (in.acceptanceScore() - 3) * params.acceptanceFactor();
        double qualityFactor = Math.max(
                1
                        + (in.firstPass() && rework == 0 ? params.firstPassBonus() : 0)
                        - rework * params.reworkPenalty()
                        - reopen * params.reopenPenalty()
                        + acceptanceDelta,
                params.qualityFloor());

        double rawScore = base * typeFactor * priorityFactor * onTimeFactor * qualityFactor * roleFactor * params.unitScore();
        // EACH：角色系数已在 rawScore 里；SPLIT：再除以角色系数之和，使单条需求总分固定
        double splitBy = RdmConstants.ALLOC_SPLIT.equals(params.allocMode())
                ? Math.max(in.roleFactorSum() > 0 ? in.roleFactorSum() : roleFactor, 0.0001)
                : 1;
        BigDecimal finalScore = roleFactor <= 0 ? BigDecimal.ZERO : round2(rawScore / splitBy);

        List<Reason> reasons = List.of(
                new Reason(RdmConstants.SCORE_REASON_BASE, "交付基準分", round2Value(base * params.unitScore()),
                        "複雜度 " + in.complexity() + " 權重 " + base),
                new Reason(RdmConstants.SCORE_REASON_ON_TIME, "按時交付因子", round2Value(onTimeFactor - 1),
                        in.onTime()
                                ? "按時上線 +" + round2Value(params.onTimeBonus() * 100) + "%"
                                : "逾期 " + Math.max(in.lateDays(), 0) + " 天，扣至 " + round2Value(onTimeFactor * 100) + "%"),
                new Reason(RdmConstants.SCORE_REASON_SATISFACTION, "交付品質因子", round2Value(qualityFactor - 1),
                        qualityMemo(in, rework, reopen, qualityFactor)),
                new Reason(RdmConstants.SCORE_REASON_BASE, "角色與難度係數", round2Value(typeFactor * priorityFactor * roleFactor),
                        "類型 " + in.reqType() + " ×" + typeFactor + "，優先級 " + in.priority()
                                + " " + (priorityBonus >= 0 ? "+" : "") + round2Value(priorityBonus)
                                + "，角色 " + in.roleCode() + " ×" + roleFactor));

        return new Result(base, round2Value(typeFactor), round2Value(priorityFactor), round2Value(onTimeFactor),
                round2Value(qualityFactor), round2Value(roleFactor), round2Value(rawScore), finalScore, reasons);
    }

    /** 质量因子说明（被考核人最关心的一条，必须写清扣在哪） */
    private static String qualityMemo(Input in, int rework, int reopen, double qualityFactor) {
        List<String> parts = new ArrayList<>();
        if (in.firstPass() && rework == 0) {
            parts.add("驗收一次通過");
        }
        if (rework > 0) {
            parts.add("驗收返工 " + rework + " 次");
        }
        if (reopen > 0) {
            parts.add("駁回重開 " + reopen + " 次");
        }
        if (in.acceptanceScore() != null) {
            parts.add("滿意度 " + in.acceptanceScore() + "/5");
        }
        parts.add("係數 " + round2Value(qualityFactor) + "（下限保護後）");
        return String.join("，", parts);
    }

    private static BigDecimal round2(double value) {
        return BigDecimal.valueOf(value).setScale(2, RoundingMode.HALF_UP);
    }

    private static double round2Value(double value) {
        return Math.round(value * 100) / 100.0;
    }
}
