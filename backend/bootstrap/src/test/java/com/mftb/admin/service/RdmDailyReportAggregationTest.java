package com.mftb.admin.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.RdmDailyReportVO.IterationNode;
import com.mftb.admin.dto.RdmDailyReportVO.ProjectNode;
import com.mftb.admin.dto.RdmDailyReportVO.RequirementNode;
import com.mftb.admin.dto.RdmDailyReportVO.TaskNode;
import com.mftb.admin.dto.RdmFactVO;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.RdmDailyReportService.IterationRow;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;

/**
 * 日报聚合口径与手动触发节流测试（方案 §五「聚合口径」「手动触发幂等锁」）。
 *
 * <p>钉住的都是「数字说谎」级别的风险：
 * <ol>
 *   <li><b>指标同源</b>：项目级指标必须逐字搬 {@code RdmProjectFactService} 的事实字段，
 *       聚合层不得自己再算一套——两套口径必然漂移，届时日报与项目总览各说一个数；</li>
 *   <li><b>层级按 ID 链</b>：项目→迭代按 {@code project_id}、迭代→需求按 {@code iteration_code}，
 *       重名项目/重名迭代一律按 ID 区分，绝不按名称匹配；</li>
 *   <li><b>零承诺不谎报</b>：{@code remainingCount} 在总数为 0 时必须是 0 且总数也是 0，
 *       展示侧据此短路成「尚未排定」（渲染器测试已钉住文案）；</li>
 *   <li><b>未归属迭代不塞进项目</b>：{@code project_id IS NULL} 的迭代单列，projectId 保持 null；</li>
 *   <li><b>节流闸</b>：一分钟内重复手动真发被拒，超窗放行，且不同档位/不同项目互不干扰。</li>
 * </ol>
 */
class RdmDailyReportAggregationTest {

    /* ==================== 测试数据工厂 ==================== */

    private RdmFactVO.ProjectFact fact(long id, String no, String name) {
        RdmFactVO.ProjectFact f = new RdmFactVO.ProjectFact();
        f.setProjectId(id);
        f.setProjectNo(no);
        f.setProjectName(name);
        f.setStatus(RdmConstants.PROJECT_IN_PROGRESS);
        f.setPmUserId(11L);
        f.setPmUserName("張三");
        f.setProductOwnerUserId(22L);
        f.setProductOwnerUserName("李四");
        f.setPlanStartDate("2026-10-01");
        f.setPlanEndDate("2026-11-30");
        f.setRiskFlag(0);
        f.setOverdueFlag(0);
        f.setPausedFlag(0);
        f.setRequirementTotal(4);
        f.setDeliveryItemTotal(6);
        f.setDeliveryItemCompleted(2);
        f.setDeliveryItemInProgress(2);
        f.setDeliveryItemTesting(1);
        f.setDeliveryItemPendingAcceptance(1);
        f.setDeliveryItemBlocked(0);
        f.setDeliveryItemOverdue(0);
        f.setTaskTotal(9);
        f.setTaskCompleted(3);
        f.setTodoTotal(5);
        f.setTestBatchTotal(1);
        f.setNextDeliveryDate("2026-10-22");
        f.setAttention(false);
        return f;
    }

    private IterationRow iterationRow(long id, Long projectId, String code, String type) {
        return new IterationRow(id, projectId, code, "迭代" + code, type, "active",
                "2026-10-08", "2026-10-22", "王五");
    }

    private RequirementNode req(long id, String no, String iterationCode, String status) {
        RequirementNode r = new RequirementNode();
        r.setReqId(id);
        r.setReqNo(no);
        r.setTitle("需求" + id);
        r.setStatus(status);
        r.setStatusLabel("狀態" + status);
        r.setPriority("P1");
        r.setIterationCode(iterationCode);
        return r;
    }

    /* ==================== 层级分组 ==================== */

    @Test
    @DisplayName("需求按 iteration_code 挂到对应迭代，未排迭代的归入 unscheduledRequirements")
    void groupsRequirementsByIterationCode() {
        List<IterationRow> iterations = List.of(
                iterationRow(101L, 1L, "SP202610001", "sprint"),
                iterationRow(102L, 1L, "SP202610002", "sprint"));
        List<RequirementNode> reqs = List.of(
                req(1L, "XQ001", "SP202610001", "developing"),
                req(2L, "XQ002", "SP202610001", "testing"),
                req(3L, "XQ003", "SP202610002", "released"),
                req(4L, "XQ004", null, "pool"),
                req(5L, "XQ005", "", "draft"));

        ProjectNode node = RdmDailyReportService.toProjectNode(fact(1L, "PROJ2026101901", "項目A"), iterations, reqs);

        assertEquals(2, node.getIterations().size());
        IterationNode first = node.getIterations().get(0);
        assertEquals("SP202610001", first.getCode());
        assertEquals(2, first.getRequirementCount(), "第一个迭代应挂 2 个需求");
        assertEquals(List.of(1L, 2L), first.getRequirements().stream().map(RequirementNode::getReqId).toList());

        IterationNode second = node.getIterations().get(1);
        assertEquals(1, second.getRequirementCount());
        assertEquals(1, second.getRequirementDoneCount(), "released 应计入迭代已完成数");

        // iteration_code 为 null 与空串都算未排迭代（空串是历史数据的常见形态，不能漏）
        assertEquals(2, node.getUnscheduledRequirements().size(), "null 与空串都应归入未排迭代");
        assertEquals(List.of(4L, 5L),
                node.getUnscheduledRequirements().stream().map(RequirementNode::getReqId).toList());
    }

    @Test
    @DisplayName("迭代没有需求时计数为 0，不凭空造需求也不报错")
    void iterationWithoutRequirements() {
        ProjectNode node = RdmDailyReportService.toProjectNode(
                fact(1L, "PROJ2026101901", "項目A"),
                List.of(iterationRow(101L, 1L, "SP202610001", "sprint")),
                List.of());

        assertEquals(1, node.getIterations().size());
        assertEquals(0, node.getIterations().get(0).getRequirementCount());
        assertTrue(node.getIterations().get(0).getRequirements().isEmpty());
        assertTrue(node.getUnscheduledRequirements().isEmpty());
    }

    @Test
    @DisplayName("未归属迭代单列：projectId 保持 null，需求按 code 挂载，绝不塞进任何项目下")
    void unassignedIterationsStayUnassigned() {
        IterationRow hotfix = iterationRow(201L, null, "HF2026101901", "hotfix");
        List<IterationNode> nodes = RdmDailyReportService.buildUnassignedIterations(
                List.of(hotfix),
                Map.of("HF2026101901", List.of(req(7L, "XQ007", "HF2026101901", "closed"))));

        assertEquals(1, nodes.size());
        IterationNode node = nodes.get(0);
        assertNull(node.getProjectId(), "未归属迭代的 projectId 必须为 null，前端据此显示「未掛項目」");
        assertEquals("HF2026101901", node.getCode());
        assertEquals("hotfix", node.getIterationType());
        assertEquals(1, node.getRequirementCount());
        assertEquals(1, node.getRequirementDoneCount(), "closed 应计入已完成");
    }

    @Test
    @DisplayName("未归属迭代：空输入返回空列表，且未被任何迭代引用的需求不会被硬塞进来")
    void unassignedIterationsHandleEmptyAndUnmatchedCodes() {
        assertTrue(RdmDailyReportService.buildUnassignedIterations(List.of(), Map.of()).isEmpty());
        assertTrue(RdmDailyReportService.buildUnassignedIterations(null, Map.of()).isEmpty());

        List<IterationNode> nodes = RdmDailyReportService.buildUnassignedIterations(
                List.of(iterationRow(202L, null, "HF2026101902", "hotfix")),
                Map.of("OTHER_CODE", List.of(req(8L, "XQ008", "OTHER_CODE", "pool"))));
        assertEquals(1, nodes.size());
        assertEquals(0, nodes.get(0).getRequirementCount(), "code 不匹配的需求不得挂到该迭代下");
    }

    /* ==================== 指标同源 ==================== */

    @Test
    @DisplayName("指标同源：项目级数字逐字搬事实源，聚合层不另起口径")
    void copiesAllMetricsFromFactSource() {
        RdmFactVO.ProjectFact f = fact(1L, "PROJ2026101901", "項目A");
        ProjectNode n = RdmDailyReportService.toProjectNode(f, List.of(), List.of());

        assertEquals(f.getProjectId(), n.getProjectId());
        assertEquals(f.getProjectNo(), n.getProjectNo());
        assertEquals(f.getProjectName(), n.getProjectName());
        assertEquals(f.getStatus(), n.getStatus());
        assertEquals(f.getPmUserId(), n.getPmUserId());
        assertEquals(f.getPmUserName(), n.getPmUserName());
        assertEquals(f.getProductOwnerUserId(), n.getProductOwnerUserId());
        assertEquals(f.getProductOwnerUserName(), n.getProductOwnerUserName());
        assertEquals(f.getPlanStartDate(), n.getPlanStartDate());
        assertEquals(f.getPlanEndDate(), n.getPlanEndDate());
        // 需求总数按快照范围统计（这里未传需求 → 0），不再直接搬事实源的项目全量：
        // 按迭代推送时，项目全量会大于可见的需求行，造成“卡片数字与列表对不上”。
        assertEquals(0, n.getRequirementTotal());
        assertEquals(f.getDeliveryItemTotal(), n.getDeliveryItemTotal());
        assertEquals(f.getDeliveryItemCompleted(), n.getDeliveryItemCompleted());
        assertEquals(f.getDeliveryItemOverdue(), n.getDeliveryItemOverdue());
        assertEquals(f.getDeliveryItemBlocked(), n.getDeliveryItemBlocked());
        assertEquals(f.getDeliveryItemTesting(), n.getDeliveryItemTesting());
        assertEquals(f.getDeliveryItemPendingAcceptance(), n.getDeliveryItemPendingAcceptance());
        assertEquals(f.getTaskTotal(), n.getTaskTotal());
        assertEquals(f.getTaskCompleted(), n.getTaskCompleted());
        assertEquals(f.getTodoTotal(), n.getTodoTotal());
        assertEquals(f.getNextDeliveryDate(), n.getNextDeliveryDate());
        assertEquals(f.getRiskFlag(), n.getRiskFlag());
        assertEquals(f.getOverdueFlag(), n.getOverdueFlag());
        assertEquals(f.getPausedFlag(), n.getPausedFlag());
    }

    @Test
    @DisplayName("需求总数按快照范围统计：迭代视角不沿用项目全量需求数")
    void requirementTotalFollowsSnapshotScope() {
        RdmFactVO.ProjectFact f = fact(1L, "PROJ2026101901", "項目A");
        ProjectNode projectScope = RdmDailyReportService.toProjectNode(
                f,
                List.of(iterationRow(101L, 1L, "SP202610001", "sprint"),
                        iterationRow(102L, 1L, "SP202610002", "sprint")),
                List.of(req(1L, "XQ001", "SP202610001", "developing"),
                        req(2L, "XQ002", "SP202610002", "testing")));
        assertEquals(2, projectScope.getRequirementTotal(), "项目视角 = 该项目可见需求数");

        ProjectNode iterationScope = RdmDailyReportService.toProjectNode(
                f,
                List.of(iterationRow(101L, 1L, "SP202610001", "sprint")),
                List.of(req(1L, "XQ001", "SP202610001", "developing")));
        assertEquals(1, iterationScope.getRequirementTotal(), "迭代视角 = 该迭代可见需求数");
    }

    @Test
    @DisplayName("剩余工作 = 总数 − 已完成，且完成数超过总数时夹到 0（不出现负数）")
    void computesRemainingWithoutNegatives() {
        RdmFactVO.ProjectFact f = fact(1L, "PROJ2026101901", "項目A");
        assertEquals(4, RdmDailyReportService.toProjectNode(f, List.of(), List.of()).getRemainingCount(),
                "6 总 − 2 完成 = 4 剩余");

        f.setDeliveryItemTotal(3);
        f.setDeliveryItemCompleted(5);
        assertEquals(0, RdmDailyReportService.toProjectNode(f, List.of(), List.of()).getRemainingCount(),
                "完成数超过总数时剩余必须夹到 0");
    }

    @Test
    @DisplayName("零承诺口径：总数为 0 时剩余也是 0，且总数为 0 这一事实必须原样保留供展示侧短路")
    void zeroCommitmentIsNotReportedAsComplete() {
        RdmFactVO.ProjectFact f = fact(1L, "PROJ2026101901", "新項目");
        f.setDeliveryItemTotal(0);
        f.setDeliveryItemCompleted(0);

        ProjectNode n = RdmDailyReportService.toProjectNode(f, List.of(), List.of());
        assertEquals(0, n.getDeliveryItemTotal(), "总数必须原样为 0，展示侧据此显示「尚未排定」");
        assertEquals(0, n.getRemainingCount());
    }

    @Test
    @DisplayName("需关注口径：事实源 attention 为真，或存在逾期/阻塞交付项，都判为需关注")
    void attentionCoversFactFlagAndOverdueOrBlocked() {
        RdmFactVO.ProjectFact f = fact(1L, "PROJ2026101901", "項目A");
        assertFalse(RdmDailyReportService.toProjectNode(f, List.of(), List.of()).isAttention());

        f.setAttention(true);
        assertTrue(RdmDailyReportService.toProjectNode(f, List.of(), List.of()).isAttention(),
                "事实源判定需关注时必须跟随");

        f.setAttention(false);
        f.setDeliveryItemOverdue(1);
        assertTrue(RdmDailyReportService.toProjectNode(f, List.of(), List.of()).isAttention(),
                "有逾期交付项即需关注（事实源的项目级标记可能尚未刷新）");

        f.setDeliveryItemOverdue(0);
        f.setDeliveryItemBlocked(2);
        assertTrue(RdmDailyReportService.toProjectNode(f, List.of(), List.of()).isAttention(),
                "有阻塞交付项即需关注");
    }

    @Test
    @DisplayName("详情链接取路由单一真相源，且重名项目按 ID 区分（绝不按名称匹配）")
    void detailUrlComesFromRouteSourceAndDuplicatesAreDistinguishedById() {
        RdmFactVO.ProjectFact a = fact(1L, "PROJ2026101901", "同名項目");
        RdmFactVO.ProjectFact b = fact(2L, "PROJ2026101902", "同名項目");

        ProjectNode na = RdmDailyReportService.toProjectNode(a, List.of(), List.of());
        ProjectNode nb = RdmDailyReportService.toProjectNode(b, List.of(), List.of());

        assertEquals(RdmConstants.projectDetailRoute(1L), na.getDetailUrl());
        assertEquals(RdmConstants.projectDetailRoute(2L), nb.getDetailUrl());
        assertEquals("同名項目", na.getProjectName());
        assertEquals("同名項目", nb.getProjectName());
        assertFalse(na.getDetailUrl().equals(nb.getDetailUrl()), "同名项目的链接必须按 ID 分开");
        assertFalse(na.getProjectId().equals(nb.getProjectId()));
    }

    /* ==================== 迭代进度/产能 ==================== */

    private TaskNode task(int progress, String status, Double planHours) {
        TaskNode t = new TaskNode();
        t.setProgress(progress);
        t.setStatus(status);
        t.setPlanHours(planHours);
        return t;
    }

    @Test
    @DisplayName("迭代进度=任务进度按计划工时加权；未填工时的任务按平均值计权，产能=已排工时/产能")
    void iterationProgressWeightedByPlanHours() {
        IterationNode it = new IterationNode();
        RequirementNode r = req(1L, "XQ001", "SP202610001", "developing");
        // 已填工时 16h @100%、 8h @50%；未填工时的任务按 (16+8)/2=12h 计权 @0%
        r.setTasks(List.of(task(100, "done", 16.0), task(50, "doing", 8.0), task(0, "todo", null)));

        RdmDailyReportService.applyIterationMetrics(it, List.of(r), 80);

        assertEquals(3, it.getTaskTotal());
        assertEquals(1, it.getTaskDone());
        assertEquals(24.0, it.getTaskHours(), 0.001, "已排工时只计已填写的计划工时");
        // (100×16 + 50×8 + 0×12) ÷ (16+8+12) = 2000/36 ≈ 55.56 → 56
        assertEquals(56, it.getProgressPercent());
        assertEquals(80, it.getCapacityHours());
        assertEquals(30, it.getCapacityUsagePercent(), "24h / 80h = 30%");
    }

    @Test
    @DisplayName("无任务不编造 0%：进度为 null；产能未设置时为 null，超载允许 >100%")
    void iterationMetricsDoNotInventPercentages() {
        IterationNode empty = new IterationNode();
        RdmDailyReportService.applyIterationMetrics(empty, List.of(), 0);
        assertNull(empty.getProgressPercent(), "无任务应置 null，由展示侧显示「尚無任務」");
        assertNull(empty.getCapacityUsagePercent(), "产能为 0 应置 null，不显示 0%");

        IterationNode overloaded = new IterationNode();
        RequirementNode r = req(2L, "XQ002", "SP202610001", "developing");
        r.setTasks(List.of(task(60, "doing", 120.0)));
        RdmDailyReportService.applyIterationMetrics(overloaded, List.of(r), 80);
        assertEquals(150, overloaded.getCapacityUsagePercent(), "超载必须如实到 100% 以上");
    }

    @Test
    @DisplayName("项目交付进度=已完成/总数；交付项为 0 时置 null（零承诺不谎报）")
    void projectDeliveryProgressShortCircuitsZeroCommitment() {
        ProjectNode normal = RdmDailyReportService.toProjectNode(
                fact(1L, "PROJ001", "項目A"), List.of(), List.of());
        assertEquals(33, normal.getDeliveryProgressPercent(), "2/6 ≈ 33%");

        RdmFactVO.ProjectFact zero = fact(2L, "PROJ002", "項目B");
        zero.setDeliveryItemTotal(0);
        zero.setDeliveryItemCompleted(0);
        ProjectNode empty = RdmDailyReportService.toProjectNode(zero, List.of(), List.of());
        assertNull(empty.getDeliveryProgressPercent(), "尚未排交付项必须是 null，不能读成 0% 或 100%");
    }

    /* ==================== 手动触发节流 ==================== */

    private RdmDailyReportService newService() {
        return new RdmDailyReportService(
                mock(RdmProjectFactService.class), mock(RdmDailyReportRenderer.class),
                mock(RdmNotifyService.class), mock(DingTalkAppService.class),
                mock(NotificationAppService.class), mock(SysUserMapper.class),
                mock(JdbcTemplate.class), new ObjectMapper());
    }

    @Test
    @DisplayName("节流：首次放行，1 分钟内重复手动真发被拒，超窗后重新放行")
    void throttleBlocksRepeatWithinOneMinute() {
        RdmDailyReportService service = newService();
        long t0 = 1_000_000L;

        assertNull(service.checkManualThrottle("morning", null, t0), "首次触发必须放行");
        assertNotNull(service.checkManualThrottle("morning", null, t0 + 1_000), "1 秒后重复触发必须被拒");
        assertNotNull(service.checkManualThrottle("morning", null, t0 + 59_999), "59.999 秒仍在窗口内");
        assertNull(service.checkManualThrottle("morning", null, t0 + 60_000), "满 60 秒后应放行");
    }

    @Test
    @DisplayName("节流按档位与项目分别计窗：推送晨报不影响晚报，推送单项目不影响全量")
    void throttleIsScopedBySlotAndProject() {
        RdmDailyReportService service = newService();
        long t0 = 2_000_000L;

        assertNull(service.checkManualThrottle("morning", null, t0));
        assertNull(service.checkManualThrottle("evening", null, t0), "另一档位不应被晨报的节流拦住");
        assertNull(service.checkManualThrottle("morning", 7L, t0), "指定项目的推送与全量推送各自计窗");
        assertNotNull(service.checkManualThrottle("morning", 7L, t0 + 1), "同一档位同一项目的重复推送应被拦");
        assertNotNull(service.checkManualThrottle("evening", null, t0 + 1));
    }
}
