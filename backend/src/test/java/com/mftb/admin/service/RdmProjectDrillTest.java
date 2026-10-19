package com.mftb.admin.service;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.RdmFactVO;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 項目總覽统计卡下钻（{@code applyDrill}）单测。
 *
 * <p>这条逻辑的失败模式是「卡片说 4、表格给 0」这类静默口径错位：下钻过去只做在前端，
 * 过滤范围是「已加载的本页」，而卡片是范围内全部项目的计数，两边天生不同域。
 * 现在下钻回到服务端并与统计卡共用 {@link RdmFactVO.ProjectFact} 上的同一批布尔位，
 * 这里钉住四件事：
 * <ol>
 *   <li>不传口径 = 原样返回（下钻不能悄悄改变默认列表）；</li>
 *   <li>三个口径各自只认对应事实位，且 total 会跟着过滤结果走（由 projectFactPage 复用同一列表）；</li>
 *   <li>未知口径必须抛出，不能退化成「当没传」返回全量 —— 那会让用户以为看到的就是该口径；</li>
 *   <li>待裁决口径按项目行命中（卡片是事项总数，两者不同量纲，由前端文案区分）。</li>
 * </ol>
 */
class RdmProjectDrillTest {

    private static RdmFactVO.ProjectFact fact(long id, boolean inProgress, boolean attention, int pending) {
        RdmFactVO.ProjectFact f = new RdmFactVO.ProjectFact();
        f.setProjectId(id);
        f.setInProgress(inProgress);
        f.setAttention(attention);
        f.setPendingDecisionCount(pending);
        return f;
    }

    /** 三行各异：仅进行中 / 仅需关注 / 两者都不是但有待裁决事项 */
    private static List<RdmFactVO.ProjectFact> samples() {
        return List.of(fact(1, true, false, 0), fact(2, false, true, 0), fact(3, false, false, 2));
    }

    @Test
    @DisplayName("空口径原样返回，不改变默认列表")
    void blankDrillKeepsAll() {
        List<RdmFactVO.ProjectFact> facts = samples();
        assertSame(facts, RdmProjectFactService.applyDrill(facts, null));
        assertSame(facts, RdmProjectFactService.applyDrill(facts, "  "));
        assertEquals(3, RdmProjectFactService.applyDrill(facts, "").size());
    }

    @Test
    @DisplayName("inProgress / attention 各只认自己的事实位")
    void eachDrillKeepsItsOwnFacts() {
        List<RdmFactVO.ProjectFact> facts = samples();

        List<RdmFactVO.ProjectFact> inProgress = RdmProjectFactService.applyDrill(facts, RdmProjectFactService.DRILL_IN_PROGRESS);
        assertEquals(1, inProgress.size());
        assertEquals(1L, inProgress.get(0).getProjectId());

        List<RdmFactVO.ProjectFact> attention = RdmProjectFactService.applyDrill(facts, RdmProjectFactService.DRILL_ATTENTION);
        assertEquals(1, attention.size());
        assertEquals(2L, attention.get(0).getProjectId());
    }

    @Test
    @DisplayName("pending 按「项目持有待裁决事项」命中")
    void pendingDrillKeepsProjectsHoldingDecisions() {
        List<RdmFactVO.ProjectFact> withZero = List.of(
                fact(1, false, false, 0), fact(2, false, false, 5), fact(3, false, false, 1));

        List<RdmFactVO.ProjectFact> kept = RdmProjectFactService.applyDrill(withZero, RdmProjectFactService.DRILL_PENDING);

        // 0 事项的行必须被筛掉：否则「待裁决事项」卡与下钻列表永远对不齐
        assertEquals(List.of(2L, 3L), kept.stream().map(RdmFactVO.ProjectFact::getProjectId).toList());
    }

    @Test
    @DisplayName("未知口径抛错，不静默返回全量")
    void unknownDrillIsRejected() {
        BusinessException ex = assertThrows(BusinessException.class,
                () -> RdmProjectFactService.applyDrill(samples(), "inProgresss"));
        assertTrue(ex.getMessage().contains("inProgresss"), ex.getMessage());
    }

    @Test
    @DisplayName("口径码必须与前端 ProjectOverview 的 DrillKey 逐字一致")
    void drillCodesMatchFrontendContract() {
        // 前端 src/pages/Rdm/ProjectOverview.tsx 的 type DrillKey 就是这三个字面量；
        // 任一侧改名都会让下钻静默失效（前端发了服务端认不出的码），所以钉在断言里
        assertEquals("inProgress", RdmProjectFactService.DRILL_IN_PROGRESS);
        assertEquals("attention", RdmProjectFactService.DRILL_ATTENTION);
        assertEquals("pending", RdmProjectFactService.DRILL_PENDING);
    }
}
