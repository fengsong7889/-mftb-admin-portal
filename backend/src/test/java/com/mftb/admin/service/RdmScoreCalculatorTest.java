package com.mftb.admin.service;

import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.service.RdmScoreCalculator.Input;
import com.mftb.admin.service.RdmScoreCalculator.Params;
import com.mftb.admin.service.RdmScoreCalculator.Result;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 积分算分器测试（M4）。
 *
 * <p><b>本文件与前端 {@code src/utils/rdmScore.test.ts} 必须保持同夹具、同断言结构</b>：
 * 公式有两个语言实现，唯一能防止它们各自漂移的手段就是两边跑同一组样例并比较同一组数字。
 * 改这里请同步改那边，否则页面显示的分与后端落库的分会出现肉眼难查的差异。
 */
class RdmScoreCalculatorTest {

    private static final Params DEFAULTS = RdmScoreCalculator.defaultParams();

    /** 一条中等复杂度的正常交付需求（与 TS 侧 healthy 夹具一致） */
    private static Input healthy(String role) {
        return new Input(role, RdmConstants.COMPLEXITY_MEDIUM, RdmConstants.TYPE_OPTIMIZE, "P1",
                true, 0, 0, 0, 5, true, 0);
    }

    private static double d(BigDecimal value) {
        return value.doubleValue();
    }

    @Test
    @DisplayName("各角色分别计分：系数相同的角色得分相同")
    void eachModeEqualFactors() {
        Result pm = RdmScoreCalculator.compute(healthy(RdmConstants.ROLE_PM), DEFAULTS);
        Result dev = RdmScoreCalculator.compute(healthy(RdmConstants.ROLE_DEV), DEFAULTS);
        assertEquals(pm.finalScore(), dev.finalScore());
        assertTrue(d(pm.finalScore()) > 0);
        // 与前端同夹具的期望值：2 × 1 × 1.1 × 1.1 × 1.22 × 1 × 10 ≈ 29.52
        assertEquals(29.52, d(pm.finalScore()), 0.01);
    }

    @Test
    @DisplayName("总额瓜分：各角色之和等于理论总分（零和）")
    void splitModeIsZeroSum() {
        List<String> roles = List.of(RdmConstants.ROLE_PM, RdmConstants.ROLE_DEV_LEAD, RdmConstants.ROLE_QA);
        double factorSum = RdmScoreCalculator.sumRoleFactors(roles);
        double splitTotal = roles.stream()
                .mapToDouble(role -> d(RdmScoreCalculator.compute(
                        withFactorSum(healthy(role), factorSum),
                        withAlloc(DEFAULTS, RdmConstants.ALLOC_SPLIT)).finalScore()))
                .sum();
        double eachTotal = roles.stream()
                .mapToDouble(role -> d(RdmScoreCalculator.compute(healthy(role), DEFAULTS).finalScore()))
                .sum();
        double pool = d(RdmScoreCalculator.compute(healthy(RdmConstants.ROLE_PM), DEFAULTS).finalScore());

        assertEquals(pool, splitTotal, 0.05);
        assertEquals(pool * factorSum, eachTotal, 0.05);
        assertTrue(splitTotal < eachTotal);
    }

    @Test
    @DisplayName("验收人/提出人/审批人不参与产出分配，得分为 0")
    void nonScorableRolesGetZero() {
        assertEquals(0, d(RdmScoreCalculator.compute(healthy(RdmConstants.ROLE_ACCEPTOR), DEFAULTS).finalScore()));
        assertEquals(0.0, RdmScoreCalculator.sumRoleFactors(
                List.of(RdmConstants.ROLE_ACCEPTOR, RdmConstants.ROLE_SUBMITTER, RdmConstants.ROLE_APPROVER)), 0.0001);
    }

    @Test
    @DisplayName("按时有加成，逾期按 10 天封顶且不低于下限")
    void onTimeFactor() {
        Result onTime = RdmScoreCalculator.compute(healthy(RdmConstants.ROLE_PM), DEFAULTS);
        assertEquals(1.1, onTime.onTimeFactor(), 0.001);

        Result slight = RdmScoreCalculator.compute(late(healthy(RdmConstants.ROLE_PM), 1), DEFAULTS);
        Result half = RdmScoreCalculator.compute(late(healthy(RdmConstants.ROLE_PM), 5), DEFAULTS);
        Result capped = RdmScoreCalculator.compute(late(healthy(RdmConstants.ROLE_PM), 10), DEFAULTS);
        Result extreme = RdmScoreCalculator.compute(late(healthy(RdmConstants.ROLE_PM), 90), DEFAULTS);

        assertTrue(slight.onTimeFactor() > half.onTimeFactor());
        assertTrue(half.onTimeFactor() > capped.onTimeFactor());
        assertEquals(capped.onTimeFactor(), extreme.onTimeFactor(), 0.001);
        assertTrue(extreme.onTimeFactor() >= 0.5);
    }

    @Test
    @DisplayName("返工扣分，但不突破质量因子下限")
    void qualityFloorProtects() {
        Result clean = RdmScoreCalculator.compute(healthy(RdmConstants.ROLE_PM), DEFAULTS);
        Result rework = RdmScoreCalculator.compute(withRework(healthy(RdmConstants.ROLE_PM), 2), DEFAULTS);
        assertTrue(rework.qualityFactor() < clean.qualityFactor());
        assertTrue(d(rework.finalScore()) < d(clean.finalScore()));

        Result extreme = RdmScoreCalculator.compute(new Input(RdmConstants.ROLE_PM, RdmConstants.COMPLEXITY_MEDIUM,
                RdmConstants.TYPE_OPTIMIZE, "P1", true, 0, 50, 0, 1, false, 0), DEFAULTS);
        assertEquals(0.6, extreme.qualityFactor(), 0.001);
    }

    @Test
    @DisplayName("满意度高于 3 分加分、低于 3 分扣分")
    void acceptanceScoreDirection() {
        Result high = RdmScoreCalculator.compute(healthy(RdmConstants.ROLE_PM), DEFAULTS);
        Result low = RdmScoreCalculator.compute(withAcceptance(healthy(RdmConstants.ROLE_PM), 1), DEFAULTS);
        assertTrue(high.qualityFactor() > low.qualityFactor());
    }

    @Test
    @DisplayName("公式可追溯：四项成因都要写明复杂度/类型/优先级/角色系数")
    void reasonsAreExplainable() {
        Result result = RdmScoreCalculator.compute(healthy(RdmConstants.ROLE_PM), DEFAULTS);
        assertEquals(4, result.reasons().size());
        String memos = String.join(" ", result.reasons().stream().map(r -> r.memo()).toList());
        assertTrue(memos.contains("MEDIUM"));
        assertTrue(memos.contains("OPTIMIZE"));
        assertTrue(memos.contains("P1"));
        assertTrue(memos.contains(RdmConstants.ROLE_PM));
    }

    @Test
    @DisplayName("规则参数可覆盖（按 rdm_score_rule 当期版本传参）")
    void paramsOverride() {
        Result normal = RdmScoreCalculator.compute(healthy(RdmConstants.ROLE_PM), DEFAULTS);
        Result doubled = RdmScoreCalculator.compute(healthy(RdmConstants.ROLE_PM),
                withUnit(DEFAULTS, 20));
        assertEquals(d(normal.finalScore()) * 2, d(doubled.finalScore()), 0.05);
    }

    /* ==================== 夹具变换辅助 ==================== */

    private static Input withFactorSum(Input in, double factorSum) {
        return new Input(in.roleCode(), in.complexity(), in.reqType(), in.priority(), in.onTime(),
                in.lateDays(), in.reworkCount(), in.reopenCount(), in.acceptanceScore(), in.firstPass(), factorSum);
    }

    private static Input late(Input in, int days) {
        return new Input(in.roleCode(), in.complexity(), in.reqType(), in.priority(), false,
                days, in.reworkCount(), in.reopenCount(), in.acceptanceScore(), in.firstPass(), in.roleFactorSum());
    }

    private static Input withRework(Input in, int rework) {
        return new Input(in.roleCode(), in.complexity(), in.reqType(), in.priority(), in.onTime(),
                in.lateDays(), rework, in.reopenCount(), in.acceptanceScore(), false, in.roleFactorSum());
    }

    private static Input withAcceptance(Input in, int score) {
        return new Input(in.roleCode(), in.complexity(), in.reqType(), in.priority(), in.onTime(),
                in.lateDays(), in.reworkCount(), in.reopenCount(), score, in.firstPass(), in.roleFactorSum());
    }

    private static Params withAlloc(Params p, String allocMode) {
        return new Params(p.unitScore(), p.onTimeBonus(), p.latePenalty(), p.firstPassBonus(),
                p.reworkPenalty(), p.reopenPenalty(), p.acceptanceFactor(), p.qualityFloor(), allocMode);
    }

    private static Params withUnit(Params p, double unitScore) {
        return new Params(unitScore, p.onTimeBonus(), p.latePenalty(), p.firstPassBonus(),
                p.reworkPenalty(), p.reopenPenalty(), p.acceptanceFactor(), p.qualityFloor(), p.allocMode());
    }
}
