package com.mftb.admin.service;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.RdmFactVO;
import com.mftb.admin.entity.RdmIssue;
import com.mftb.admin.entity.RdmIssueDefer;
import com.mftb.admin.entity.RdmProject;
import com.mftb.admin.entity.RdmWorkCalendar;
import com.mftb.admin.mapper.RdmWorkCalendarMapper;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;

/**
 * 任务22 A.2 / A.3 / A.4 —— 待办看板的<b>去重</b>、<b>三桶分类（含等待他人）</b>与<b>路由</b>测试。
 *
 * <p>锁死八条结论：
 * <ol>
 *   <li><b>待办总数不再虚高</b>：同一 {@code (objectType, refId, responsibleUserId)} 命中多个成因
 *       只算<b>一条</b>，成因进 {@code reasons} 明细；{@code rawReasonHits}（去重前命中次数）恒 ≥ {@code total}，
 *       两者之差就是被去重掉的重复计数，可被人直接核对；</li>
 *   <li><b>责任人参与去重键</b>：同一交付项的「协调人阻塞」与「产品验收人待签」是两个人各自的事，
 *       必须各成一条，否则验收人在自己的「待我处理」里看不到它；</li>
 *   <li><b>三桶互斥且穷尽</b>：{@code mine + waitingOthers + unassigned == total} 恒成立；</li>
 *   <li><b>等待他人 ≠ 待我处理</b>：责任人是别人的事落 {@code waiting_others}，不再被算成自己的待办
 *       （旧实现「待办 12 条里 9 条自己什么都做不了」正是这个缺陷）；</li>
 *   <li><b>mine 不退化全量</b>：未认证 / {@code userId=null} 时看板恒空；拿不到登录人时
 *       不可能有 {@code mine}，一律落 waiting_others/unassigned；</li>
 *   <li><b>路由全部前端已注册</b>：问题走 {@code /rdm-issue?id=}、交付项走
 *       {@code /rdm-delivery-item?id=&mode=view}、延期残余跳回所属<b>问题页</b>；
 *       绝不出现未注册的 {@code /rdm/project/delivery}，绝不把问题套用交付项地址；</li>
 *   <li><b>不由状态推导测试/验收</b>：测试未通过、验收待签只消费任务20 的权威事实
 *       （{@code testPassed}/{@code productAccepted}/{@code bizAccepted}）与「是否到达验收环节」；
 *       开发中的交付项不产生验收待办，已交付完成的交付项不产生任何待办；</li>
 *   <li><b>关闭项目 ≠ 交付完成</b>：{@code closed} / {@code all_delivered} 的项目不再产生项目级逾期待办
 *       （只是「不再推进」，与统计侧的交付完成计数无关）。</li>
 * </ol>
 *
 * <p>逾期工作日数用<b>真实的 {@link RdmWorkingDayCalculator}</b>（只 mock 其 mapper），
 * 因此「请假日不算逾期工作日」是被真算法验证的。
 *
 * <p><b>纯 Mockito 离线单测，不连库、不跑迁移。</b>
 */
class RdmTodoBoardServiceTest {

    private static final long PROJECT_ID = 300L;
    private static final long VIEWER = 41L;
    private static final long OTHER = 42L;
    private static final long PM = 51L;
    /** 2026-01-05 是周一 */
    private static final LocalDate TODAY = LocalDate.of(2026, 1, 9);
    private static final LocalDate DUE_OVERDUE = LocalDate.of(2026, 1, 2);
    private static final LocalDate DUE_FUTURE = LocalDate.of(2026, 2, 2);

    private RdmWorkCalendarMapper calendarMapper;
    private RdmTodoBoardService boardService;

    @BeforeAll
    static void initTableInfo() {
        TableInfoHelper.initTableInfo(
                new MapperBuilderAssistant(new MybatisConfiguration(), ""), RdmWorkCalendar.class);
    }

    @BeforeEach
    void setUp() {
        calendarMapper = mock(RdmWorkCalendarMapper.class);
        doReturn(new ArrayList<RdmWorkCalendar>()).when(calendarMapper).selectList(any());
        boardService = new RdmTodoBoardService(new RdmWorkingDayCalculator(calendarMapper));
    }

    /* ==================== 夹具 ==================== */

    private RdmTodoBoardService.TodoInput input() {
        RdmTodoBoardService.TodoInput input = new RdmTodoBoardService.TodoInput();
        input.setProjectId(PROJECT_ID);
        input.setUserId(VIEWER);
        input.setAuthenticated(true);
        input.setToday(TODAY);
        return input;
    }

    private RdmFactVO.ItemFact item(long itemId, String status, Long coordinator) {
        RdmFactVO.ItemFact fact = new RdmFactVO.ItemFact();
        fact.setItemId(itemId);
        fact.setItemNo("DI-" + itemId);
        fact.setTitle("交付項" + itemId);
        fact.setProjectId(PROJECT_ID);
        fact.setStatus(status);
        fact.setScopeVersion(1);
        fact.setVersion(2);
        fact.setCoordinatorUserId(coordinator);
        fact.setCoordinatorUserName(coordinator == null ? null : "協調人" + coordinator);
        fact.setPlanEndDate(DUE_OVERDUE.toString());
        fact.setTestPassed(true);
        fact.setProductAccepted(true);
        fact.setBizAccepted(true);
        return fact;
    }

    private RdmIssue issue(long id, Long owner, Long deliveryItemId) {
        RdmIssue issue = new RdmIssue();
        issue.setId(id);
        issue.setIssueNo("IS-" + id);
        issue.setTitle("問題" + id);
        issue.setDeliveryItemId(deliveryItemId);
        issue.setScopeVersion(1);
        issue.setOwnerUserId(owner);
        issue.setOwnerUserName(owner == null ? null : "負責人" + owner);
        issue.setStatus(RdmConstants.ISSUE_OPEN);
        issue.setVersion(4);
        return issue;
    }

    private RdmIssueDefer defer(long id, Long issueId, Long owner, LocalDate dueAt) {
        RdmIssueDefer defer = new RdmIssueDefer();
        defer.setId(id);
        defer.setIssueId(issueId);
        defer.setReason("原範圍延期殘餘" + id);
        defer.setOwnerUserId(owner);
        defer.setOwnerUserName(owner == null ? null : "承接人" + owner);
        defer.setDueAt(dueAt);
        defer.setVersion(6);
        return defer;
    }

    private RdmProject project(long id, String status, LocalDate planEnd) {
        RdmProject project = new RdmProject();
        project.setId(id);
        project.setProjectNo("P-" + id);
        project.setName("項目" + id);
        project.setStatus(status);
        project.setPlanEndDate(planEnd);
        project.setPmUserId(PM);
        project.setPmUserName("PM");
        project.setVersion(8);
        return project;
    }

    private static RdmFactVO.Todo only(RdmFactVO.TodoBoard board) {
        assertEquals(1, board.getTotal(), "期望恰好一条待办，实际=" + board.getTodos());
        return board.getTodos().get(0);
    }

    /* ==================== A.3 待办去重 ==================== */

    @Test
    @DisplayName("同一交付项命中4个成因只算一条待办（待办总数不再按分组相加而虚高）")
    void multipleReasonsCollapseIntoOneTodo() {
        RdmFactVO.ItemFact fact = item(11L, RdmConstants.DI_DEVELOPING, VIEWER);
        fact.setCoordinatorUserId(null);           // unassigned
        fact.setBlocked(true);                     // blocked
        fact.setOverdue(true);                     // overdue
        fact.setTestPassed(false);                 // test_not_passed
        fact.setPendingDecisionCount(2);           // pending_decision
        RdmTodoBoardService.TodoInput input = input();
        input.setItems(List.of(fact));

        RdmFactVO.TodoBoard board = boardService.build(input);
        RdmFactVO.Todo todo = only(board);

        assertTrue(todo.getReasons().size() >= 5, "多个成因应累加到同一条待办，实际=" + todo.getReasons());
        assertTrue(todo.getReasons().containsAll(List.of(
                RdmConstants.TODO_REASON_UNASSIGNED, RdmConstants.TODO_REASON_BLOCKED,
                RdmConstants.TODO_REASON_OVERDUE, RdmConstants.TODO_REASON_TEST_NOT_PASSED,
                RdmConstants.TODO_REASON_PENDING_DECISION)));
        assertTrue(board.getRawReasonHits() >= board.getTotal(),
                "rawReasonHits 必须 ≥ total，差值即被去重掉的重复计数");
        assertEquals(todo.getReasons().size(), board.getRawReasonHits());
    }

    @Test
    @DisplayName("同一成因不重复累加（reasons是集合语义，不是命中次数）")
    void reasonsAreNotDuplicated() {
        RdmFactVO.ItemFact first = item(11L, RdmConstants.DI_DEVELOPING, VIEWER);
        first.setOverdue(true);
        RdmFactVO.ItemFact sameAgain = item(11L, RdmConstants.DI_DEVELOPING, VIEWER);
        sameAgain.setOverdue(true);
        RdmTodoBoardService.TodoInput input = input();
        input.setItems(List.of(first, sameAgain));

        RdmFactVO.TodoBoard board = boardService.build(input);

        assertEquals(1, board.getTotal());
        assertEquals(1, board.getTodos().get(0).getReasons().size());
        assertEquals(2, board.getRawReasonHits(), "去重前的命中次数仍如实保留，供核对");
    }

    @Test
    @DisplayName("责任人参与去重键：协调人与产品/业务验收人各成一条（否则验收人在自己待办里看不到它）")
    void differentResponsiblesAreSeparateTodos() {
        RdmFactVO.ItemFact fact = item(11L, RdmConstants.DI_PENDING_ACCEPTANCE, VIEWER);
        fact.setOverdue(true);
        fact.setProductAccepted(false);
        fact.setProductAcceptorUserId(OTHER);
        fact.setProductAcceptorUserName("產品驗收人");
        fact.setBizAccepted(false);
        fact.setBizAcceptorUserId(OTHER + 1);
        fact.setBizAcceptorUserName("業務驗收人");
        RdmTodoBoardService.TodoInput input = input();
        input.setItems(List.of(fact));

        RdmFactVO.TodoBoard board = boardService.build(input);

        assertEquals(3, board.getTotal(), "协调人 + 产品验收人 + 业务验收人 各一条");
        assertEquals(3, board.getTodos().stream().map(RdmFactVO.Todo::getKey).distinct().count());
        assertTrue(board.getTodos().stream().anyMatch(t -> t.getReasons()
                .contains(RdmConstants.TODO_REASON_PENDING_PRODUCT_ACCEPTANCE)));
        assertTrue(board.getTodos().stream().anyMatch(t -> t.getReasons()
                .contains(RdmConstants.TODO_REASON_PENDING_BIZ_ACCEPTANCE)));
    }

    @Test
    @DisplayName("去重键对外共享：通知侧与看板用同一粒度（否则通知与看板会不同步）")
    void todoKeyIsSharedGranularity() {
        assertEquals("delivery_item:11:41",
                RdmTodoBoardService.todoKey(RdmConstants.NOTIFY_OBJECT_DELIVERY_ITEM, 11L, VIEWER));
        assertEquals("delivery_item:11:0",
                RdmTodoBoardService.todoKey(RdmConstants.NOTIFY_OBJECT_DELIVERY_ITEM, 11L, null));
        assertNotEquals(RdmTodoBoardService.todoKey(RdmConstants.NOTIFY_OBJECT_DELIVERY_ITEM, 11L, VIEWER),
                RdmTodoBoardService.todoKey(RdmConstants.NOTIFY_OBJECT_ISSUE, 11L, VIEWER),
                "同为 id=11，问题与交付项必须不同键");
        // 两个未指派待办不得因 null 被当成不同键
        assertEquals(RdmTodoBoardService.todoKey("issue", 5L, null),
                RdmTodoBoardService.todoKey("issue", 5L, null));
    }

    /* ==================== A.3 三桶互斥穷尽 + 等待他人 ==================== */

    @Test
    @DisplayName("三桶互斥且穷尽：mine + waitingOthers + unassigned == total")
    void bucketsAreMutuallyExclusiveAndExhaustive() {
        RdmFactVO.ItemFact mine = item(11L, RdmConstants.DI_DEVELOPING, VIEWER);
        mine.setOverdue(true);
        RdmFactVO.ItemFact others = item(12L, RdmConstants.DI_DEVELOPING, OTHER);
        others.setOverdue(true);
        RdmFactVO.ItemFact nobody = item(13L, RdmConstants.DI_DEVELOPING, null);
        RdmTodoBoardService.TodoInput input = input();
        input.setItems(List.of(mine, others, nobody));
        input.setOpenIssues(List.of(issue(21L, OTHER, null)));

        RdmFactVO.TodoBoard board = boardService.build(input);

        assertEquals(4, board.getTotal());
        assertEquals(1, board.getMineCount());
        assertEquals(2, board.getWaitingOthersCount());
        assertEquals(1, board.getUnassignedCount());
        assertEquals(board.getTotal(),
                board.getMineCount() + board.getWaitingOthersCount() + board.getUnassignedCount());
    }

    @Test
    @DisplayName("等待他人：责任人是别人的事落waiting_others，不再被算成自己的待办")
    void waitingOthersIsDistinctFromMine() {
        RdmFactVO.ItemFact fact = item(11L, RdmConstants.DI_DEVELOPING, OTHER);
        fact.setOverdue(true);
        RdmTodoBoardService.TodoInput input = input();
        input.setItems(List.of(fact));

        RdmFactVO.Todo todo = only(boardService.build(input));

        assertEquals(RdmConstants.TODO_BUCKET_WAITING_OTHERS, todo.getBucket());
        assertEquals(0, boardService.build(input).getMineCount());
        assertEquals(1, boardService.build(input).getWaitingOthersCount());
    }

    @Test
    @DisplayName("mine不退化全量：未认证或userId为null→看板恒空（绝不把「不知道你是谁」当成「你什么都能看」）")
    void unauthenticatedViewerGetsEmptyBoard() {
        RdmFactVO.ItemFact fact = item(11L, RdmConstants.DI_DEVELOPING, VIEWER);
        fact.setOverdue(true);
        RdmTodoBoardService.TodoInput anon = input();
        anon.setItems(List.of(fact));
        anon.setAuthenticated(false);

        RdmFactVO.TodoBoard denied = boardService.build(anon);
        assertFalse(denied.isAuthenticated());
        assertEquals(0, denied.getTotal());
        assertTrue(denied.getTodos().isEmpty());

        RdmTodoBoardService.TodoInput noUser = input();
        noUser.setItems(List.of(fact));
        noUser.setUserId(null);
        RdmFactVO.TodoBoard also = boardService.build(noUser);
        assertFalse(also.isAuthenticated());
        assertEquals(0, also.getTotal());
    }

    @Test
    @DisplayName("null输入与null userId：不可能有mine桶（分桶不因此把所有待办算成自己的）")
    void nullInputAndNullViewerNeverYieldMine() {
        RdmFactVO.TodoBoard empty = boardService.build(null);
        assertFalse(empty.isAuthenticated());
        assertEquals(0, empty.getTotal());

        RdmFactVO.ItemFact fact = item(11L, RdmConstants.DI_DEVELOPING, OTHER);
        fact.setOverdue(true);
        RdmTodoBoardService.TodoInput input = input();
        input.setUserId(null);
        input.setAuthenticated(true);
        input.setItems(List.of(fact));
        // userId 为 null → authenticated 判为 false → 空看板（fail-closed，不退化全量）
        assertEquals(0, boardService.build(input).getMineCount());
        assertEquals(0, boardService.build(input).getTotal());
    }

    /* ==================== A.4 路由 ==================== */

    @Test
    @DisplayName("交付项待办→前端已注册的/rdm-delivery-item?id=&mode=view")
    void deliveryItemRouteIsRegistered() {
        RdmFactVO.ItemFact fact = item(11L, RdmConstants.DI_DEVELOPING, VIEWER);
        fact.setOverdue(true);
        RdmTodoBoardService.TodoInput input = input();
        input.setItems(List.of(fact));

        RdmFactVO.Todo todo = only(boardService.build(input));

        assertEquals(RdmConstants.deliveryItemRoute(11L), todo.getActionUrl());
        assertEquals("/rdm-delivery-item?id=11&mode=view", todo.getActionUrl());
        assertRegisteredRoute(todo.getActionUrl());
    }

    @Test
    @DisplayName("问题待办→/rdm-issue?id=，绝不套用交付项地址")
    void issueRouteIsNotDeliveryItemRoute() {
        RdmTodoBoardService.TodoInput input = input();
        input.setOpenIssues(List.of(issue(21L, VIEWER, 11L)));

        RdmFactVO.Todo todo = only(boardService.build(input));

        assertEquals(RdmConstants.issueRoute(21L), todo.getActionUrl());
        assertEquals("/rdm-issue?id=21", todo.getActionUrl());
        assertFalse(todo.getActionUrl().contains("/rdm-delivery-item"), "问题不得套用交付项地址");
        assertRegisteredRoute(todo.getActionUrl());
    }

    @Test
    @DisplayName("原范围延期残余→跳回所属问题页；缺issueId时退化项目总览而非交付项页")
    void deferResidualRoutesBackToIssuePage() {
        RdmTodoBoardService.TodoInput input = input();
        input.setResidualDefers(List.of(defer(31L, 21L, VIEWER, DUE_OVERDUE)));
        RdmFactVO.Todo withIssue = only(boardService.build(input));
        assertEquals(RdmConstants.issueRoute(21L), withIssue.getActionUrl());
        assertEquals(Long.valueOf(21L), withIssue.getRefIssueId());

        RdmTodoBoardService.TodoInput orphan = input();
        orphan.setResidualDefers(List.of(defer(32L, null, VIEWER, DUE_OVERDUE)));
        RdmFactVO.Todo fallback = only(boardService.build(orphan));
        assertEquals(RdmConstants.ROUTE_PROJECT_OVERVIEW, fallback.getActionUrl());
        assertFalse(fallback.getActionUrl().contains("/rdm-delivery-item"));
    }

    @Test
    @DisplayName("项目级待办→/rdm-project-detail?id=&mode=view（不是未注册的路径）")
    void projectRouteIsRegistered() {
        RdmTodoBoardService.TodoInput input = input();
        input.setProjects(List.of(project(PROJECT_ID, RdmConstants.PROJECT_IN_PROGRESS, DUE_OVERDUE)));

        RdmFactVO.Todo todo = only(boardService.build(input));

        assertEquals(RdmConstants.projectDetailRoute(PROJECT_ID), todo.getActionUrl());
        assertEquals(RdmConstants.NOTIFY_OBJECT_PROJECT, todo.getObjectType());
        assertRegisteredRoute(todo.getActionUrl());
    }

    @Test
    @DisplayName("所有路由都取自RdmConstants的已注册前缀，绝不出现历史上的/rdm/project/delivery")
    void noUnregisteredRouteEverAppears() {
        RdmFactVO.ItemFact fact = item(11L, RdmConstants.DI_PENDING_ACCEPTANCE, VIEWER);
        fact.setOverdue(true);
        fact.setProductAccepted(false);
        fact.setProductAcceptorUserId(OTHER);
        RdmTodoBoardService.TodoInput input = input();
        input.setItems(List.of(fact));
        input.setOpenIssues(List.of(issue(21L, OTHER, 11L)));
        input.setResidualDefers(List.of(defer(31L, 21L, OTHER, DUE_OVERDUE)));
        input.setProjects(List.of(project(PROJECT_ID, RdmConstants.PROJECT_IN_PROGRESS, DUE_OVERDUE)));

        RdmFactVO.TodoBoard board = boardService.build(input);

        assertTrue(board.getTotal() >= 4);
        for (RdmFactVO.Todo todo : board.getTodos()) {
            assertRegisteredRoute(todo.getActionUrl());
        }
    }

    private static void assertRegisteredRoute(String actionUrl) {
        assertTrue(actionUrl != null && !actionUrl.isBlank(), "actionUrl 不得为空");
        assertFalse(actionUrl.contains("/rdm/project/delivery"),
                "历史上未注册的路径点开即 404，实际=" + actionUrl);
        List<String> registered = List.of(
                RdmConstants.ROUTE_PROJECT_OVERVIEW, RdmConstants.ROUTE_PROJECT_DETAIL,
                RdmConstants.ROUTE_DELIVERY_ITEM, RdmConstants.ROUTE_ISSUE_DETAIL,
                RdmConstants.ROUTE_TEST_BATCH_DETAIL, RdmConstants.ROUTE_RELEASE_BATCH_DETAIL,
                RdmConstants.ROUTE_REQUIREMENT_DETAIL, RdmConstants.ROUTE_TASK_FORM);
        assertTrue(registered.stream().anyMatch(actionUrl::startsWith),
                "必须以前端已注册路由开头，实际=" + actionUrl);
    }

    /* ==================== A.5 口径：不由状态推导 / 关闭≠交付完成 ==================== */

    @Test
    @DisplayName("已交付完成的交付项不产生任何待办（含验收待办）")
    void deliveredItemProducesNoTodo() {
        RdmFactVO.ItemFact fact = item(11L, RdmConstants.DI_RELEASED_PENDING, VIEWER);
        fact.setDelivered(true);
        fact.setOverdue(true);
        fact.setBlocked(true);
        fact.setProductAccepted(false);
        fact.setBizAccepted(false);
        RdmTodoBoardService.TodoInput input = input();
        input.setItems(List.of(fact));

        assertEquals(0, boardService.build(input).getTotal());
    }

    @Test
    @DisplayName("开发中的交付项不产生验收待办（还没到的事不该淹没真正的待办）")
    void acceptanceTodoOnlyAfterReachingStage() {
        RdmFactVO.ItemFact fact = item(11L, RdmConstants.DI_DEVELOPING, VIEWER);
        fact.setTestPassed(true);
        fact.setProductAccepted(false);
        fact.setProductAcceptorUserId(OTHER);
        fact.setBizAccepted(false);
        fact.setBizAcceptorUserId(OTHER);
        RdmTodoBoardService.TodoInput input = input();
        input.setItems(List.of(fact));

        assertEquals(0, boardService.build(input).getTotal(), "既未逾期也未阻塞、测试已过，就不该有待办");
        assertFalse(RdmTodoBoardService.isReachedAcceptanceStage(fact));
    }

    @Test
    @DisplayName("到达验收环节但权威验收未通过→产生验收待办（消费任务20事实，不由状态推导通过）")
    void acceptanceTodoUsesAuthoritativeFact() {
        RdmFactVO.ItemFact fact = item(11L, RdmConstants.DI_PENDING_ACCEPTANCE, VIEWER);
        fact.setTestPassed(true);
        fact.setProductAccepted(false);
        fact.setProductAcceptorUserId(OTHER);
        fact.setBizAccepted(true);
        RdmTodoBoardService.TodoInput input = input();
        input.setItems(List.of(fact));

        RdmFactVO.TodoBoard board = boardService.build(input);

        assertEquals(1, board.getTotal());
        assertTrue(only(board).getReasons().contains(RdmConstants.TODO_REASON_PENDING_PRODUCT_ACCEPTANCE));
        assertFalse(only(board).getReasons().contains(RdmConstants.TODO_REASON_PENDING_BIZ_ACCEPTANCE),
                "业务验收已通过（权威事实），不得因状态还在 pending_acceptance 就推导成待签");
        assertTrue(RdmTodoBoardService.isReachedAcceptanceStage(fact));
    }

    @Test
    @DisplayName("测试通过（权威事实）→不产生test_not_passed成因，即使任务尚未100%完成")
    void testPassedIsNotDerivedFromTaskStatus() {
        RdmFactVO.ItemFact fact = item(11L, RdmConstants.DI_TESTING, VIEWER);
        fact.setTaskTotal(10);
        fact.setTaskCompleted(4);       // 任务只完成 40%
        fact.setTestPassed(true);       // 但任务20 判定测试已通过
        RdmTodoBoardService.TodoInput input = input();
        input.setItems(List.of(fact));

        assertEquals(0, boardService.build(input).getTotal(),
                "测试通过是权威事实，绝不由「任务未完成」反推成测试未通过");

        fact.setTestPassed(false);
        RdmFactVO.Todo todo = only(boardService.build(input));
        assertTrue(todo.getReasons().contains(RdmConstants.TODO_REASON_TEST_NOT_PASSED));
    }

    @Test
    @DisplayName("关闭项目≠交付完成：closed/all_delivered不再产生项目级逾期待办")
    void closedProjectIsNotTreatedAsDeliveredNorUrged() {
        RdmTodoBoardService.TodoInput closed = input();
        closed.setProjects(List.of(project(PROJECT_ID, RdmConstants.PROJECT_CLOSED, DUE_OVERDUE)));
        assertEquals(0, boardService.build(closed).getTotal());

        RdmTodoBoardService.TodoInput allDelivered = input();
        allDelivered.setProjects(List.of(project(PROJECT_ID, RdmConstants.PROJECT_ALL_DELIVERED, DUE_OVERDUE)));
        assertEquals(0, boardService.build(allDelivered).getTotal());

        RdmTodoBoardService.TodoInput running = input();
        running.setProjects(List.of(project(PROJECT_ID, RdmConstants.PROJECT_IN_PROGRESS, DUE_OVERDUE)));
        RdmFactVO.Todo todo = only(boardService.build(running));
        assertEquals(PM, todo.getResponsibleUserId().longValue(), "项目级逾期待办归 PM");
    }

    @Test
    @DisplayName("项目未逾期→不产生项目级待办（计划完成日在未来）")
    void projectNotOverdueProducesNoTodo() {
        RdmTodoBoardService.TodoInput input = input();
        input.setProjects(List.of(project(PROJECT_ID, RdmConstants.PROJECT_IN_PROGRESS, DUE_FUTURE)));

        assertEquals(0, boardService.build(input).getTotal());
    }

    @Test
    @DisplayName("原范围延期残余单独成条、责任人是承接人（不混进协调人待办，避免同一笔欠帐被计两次）")
    void deferResidualIsOwnedByAssignee() {
        RdmFactVO.ItemFact fact = item(11L, RdmConstants.DI_DEVELOPING, VIEWER);
        fact.setDeferResidualCount(1);
        RdmTodoBoardService.TodoInput input = input();
        input.setItems(List.of(fact));
        input.setResidualDefers(List.of(defer(31L, 21L, OTHER, DUE_FUTURE)));

        RdmFactVO.TodoBoard board = boardService.build(input);

        assertEquals(1, board.getTotal(), "协调人无成因、残余归承接人：合计恰好一条");
        RdmFactVO.Todo todo = only(board);
        assertEquals(RdmConstants.NOTIFY_OBJECT_ISSUE_DEFER, todo.getObjectType());
        assertEquals(OTHER, todo.getResponsibleUserId().longValue());
        assertTrue(todo.getReasons().contains(RdmConstants.TODO_REASON_DEFER_RESIDUAL));
        assertFalse(fact.getTodoReasons().contains(RdmConstants.TODO_REASON_DEFER_RESIDUAL),
                "残余不得同时记在协调人头上，否则待办总数重新虚高");
    }

    /* ==================== 问题项目归属 ==================== */

    @Test
    @DisplayName("问题项目归属：优先issueId→projectId索引，其次所属交付项，都无则用输入projectId（不猜）")
    void issueProjectIdResolutionOrder() {
        RdmFactVO.ItemFact fact = item(11L, RdmConstants.DI_DEVELOPING, VIEWER);
        RdmTodoBoardService.TodoInput byIndex = input();
        byIndex.setOpenIssues(List.of(issue(21L, VIEWER, null)));
        byIndex.setProjectIdByIssueId(Map.of(21L, 777L));
        byIndex.setItems(List.of(fact));
        assertEquals(Long.valueOf(777L), only(boardService.build(byIndex)).getProjectId());

        RdmTodoBoardService.TodoInput byItem = input();
        byItem.setOpenIssues(List.of(issue(21L, VIEWER, 11L)));
        fact.setProjectId(888L);
        byItem.setItems(List.of(fact));
        assertEquals(Long.valueOf(888L), only(boardService.build(byItem)).getProjectId());

        RdmTodoBoardService.TodoInput byInput = input();
        byInput.setOpenIssues(List.of(issue(21L, VIEWER, null)));
        assertEquals(Long.valueOf(PROJECT_ID), only(boardService.build(byInput)).getProjectId());
    }

    /* ==================== 逾期工作日（真实日历） ==================== */

    @Test
    @DisplayName("逾期工作日按责任人真实工作日历：请假日不计入逾期")
    void overdueWorkingDaysUsesRealCalendar() {
        RdmFactVO.ItemFact fact = item(11L, RdmConstants.DI_DEVELOPING, VIEWER);
        fact.setOverdue(true);
        fact.setPlanEndDate(DUE_OVERDUE.toString());
        RdmTodoBoardService.TodoInput input = input();
        input.setItems(List.of(fact));

        int plain = only(boardService.build(input)).getOverdueWorkingDays();
        assertEquals(5, plain, "2026-01-02(五)到期、2026-01-09(五)为今天：中间 5 个工作日");

        RdmWorkCalendar leave = new RdmWorkCalendar();
        leave.setUserId(VIEWER);
        leave.setDay(LocalDate.of(2026, 1, 7));
        leave.setDayType(RdmWorkCalendar.TYPE_LEAVE);
        doReturn(List.of(leave)).when(calendarMapper).selectList(any());

        int withLeave = only(boardService.build(input)).getOverdueWorkingDays();
        assertEquals(4, withLeave, "责任人请假日不算逾期工作日（不是简单的周一至周五折算）");
    }

    @Test
    @DisplayName("周末支援（排了加班工时）→该天算工作日，逾期天数随之增加")
    void weekendOvertimeCountsAsWorkingDay() {
        RdmFactVO.ItemFact fact = item(11L, RdmConstants.DI_DEVELOPING, VIEWER);
        fact.setOverdue(true);
        fact.setPlanEndDate(DUE_OVERDUE.toString());
        RdmTodoBoardService.TodoInput input = input();
        input.setItems(List.of(fact));

        RdmWorkCalendar overtime = new RdmWorkCalendar();
        overtime.setUserId(VIEWER);
        overtime.setDay(LocalDate.of(2026, 1, 3));   // 周六
        overtime.setDayType(RdmWorkCalendar.TYPE_OVERTIME);
        overtime.setAvailableHours(new BigDecimal("8"));
        doReturn(List.of(overtime)).when(calendarMapper).selectList(any());

        assertEquals(6, only(boardService.build(input)).getOverdueWorkingDays());
    }

    @Test
    @DisplayName("未逾期→逾期工作日为0且overdue=false；无到期日→0而非null（下游不必层层判空）")
    void notOverdueYieldsZero() {
        RdmFactVO.ItemFact fact = item(11L, RdmConstants.DI_DEVELOPING, VIEWER);
        fact.setPlanEndDate(DUE_FUTURE.toString());
        fact.setBlocked(true);
        RdmTodoBoardService.TodoInput input = input();
        input.setItems(List.of(fact));
        RdmFactVO.Todo future = only(boardService.build(input));
        assertEquals(0, future.getOverdueWorkingDays());
        assertFalse(future.isOverdue());

        RdmFactVO.ItemFact noDue = item(12L, RdmConstants.DI_DEVELOPING, VIEWER);
        noDue.setPlanEndDate(null);
        noDue.setBlocked(true);
        RdmTodoBoardService.TodoInput noDueInput = input();
        noDueInput.setItems(List.of(noDue));
        assertEquals(0, only(boardService.build(noDueInput)).getOverdueWorkingDays());
    }

    /* ==================== 版本贯穿（B.2 的前置条件） ==================== */

    @Test
    @DisplayName("待办携带所属对象并发版本（通知侧不得另查一次版本，否则看板与去重用的不是同一个）")
    void todoCarriesRefVersion() {
        RdmFactVO.ItemFact fact = item(11L, RdmConstants.DI_DEVELOPING, VIEWER);
        fact.setVersion(2);
        fact.setOverdue(true);
        RdmTodoBoardService.TodoInput input = input();
        input.setItems(List.of(fact));
        input.setOpenIssues(List.of(issue(21L, OTHER, null)));
        input.setResidualDefers(List.of(defer(31L, 21L, OTHER, DUE_FUTURE)));
        input.setProjects(List.of(project(PROJECT_ID, RdmConstants.PROJECT_IN_PROGRESS, DUE_OVERDUE)));

        RdmFactVO.TodoBoard board = boardService.build(input);

        Map<String, Integer> versionByType = new java.util.HashMap<>();
        for (RdmFactVO.Todo todo : board.getTodos()) {
            versionByType.put(todo.getObjectType(), todo.getRefVersion());
        }
        assertEquals(Integer.valueOf(2), versionByType.get(RdmConstants.NOTIFY_OBJECT_DELIVERY_ITEM));
        assertEquals(Integer.valueOf(4), versionByType.get(RdmConstants.NOTIFY_OBJECT_ISSUE));
        assertEquals(Integer.valueOf(6), versionByType.get(RdmConstants.NOTIFY_OBJECT_ISSUE_DEFER));
        assertEquals(Integer.valueOf(8), versionByType.get(RdmConstants.NOTIFY_OBJECT_PROJECT));
    }

    @Test
    @DisplayName("存量数据无版本列→refVersion为null（通知侧退化VERSION:0，宁可少发不重复发）")
    void nullVersionIsPassedThrough() {
        RdmFactVO.ItemFact fact = item(11L, RdmConstants.DI_DEVELOPING, VIEWER);
        fact.setVersion(null);
        fact.setOverdue(true);
        RdmTodoBoardService.TodoInput input = input();
        input.setItems(List.of(fact));

        assertNull(only(boardService.build(input)).getRefVersion());
    }

    /* ==================== 边界 ==================== */

    @Test
    @DisplayName("空输入/全null集合→空看板且不抛异常（作业扫到空项目不能整体失败）")
    void emptyInputYieldsEmptyBoard() {
        RdmFactVO.TodoBoard board = boardService.build(input());

        assertTrue(board.isAuthenticated());
        assertEquals(0, board.getTotal());
        assertEquals(0, board.getRawReasonHits());
        assertTrue(board.getTodos().isEmpty());
        assertTrue(board.getComputedAt() != null && !board.getComputedAt().isBlank());
    }

    @Test
    @DisplayName("集合内含null元素→跳过不抛异常（脏数据不得让整个看板计算失败）")
    void nullElementsAreSkipped() {
        RdmTodoBoardService.TodoInput input = input();
        List<RdmFactVO.ItemFact> items = new ArrayList<>();
        items.add(null);
        RdmFactVO.ItemFact valid = item(11L, RdmConstants.DI_DEVELOPING, VIEWER);
        valid.setOverdue(true);
        items.add(valid);
        RdmFactVO.ItemFact noId = item(12L, RdmConstants.DI_DEVELOPING, VIEWER);
        noId.setItemId(null);
        noId.setOverdue(true);
        items.add(noId);
        input.setItems(items);
        List<RdmIssue> issues = new ArrayList<>();
        issues.add(null);
        issues.add(issue(21L, VIEWER, null));
        input.setOpenIssues(issues);
        List<RdmIssueDefer> defers = new ArrayList<>();
        defers.add(null);
        input.setResidualDefers(defers);
        List<RdmProject> projects = new ArrayList<>();
        projects.add(null);
        input.setProjects(projects);

        RdmFactVO.TodoBoard board = boardService.build(input);

        assertEquals(2, board.getTotal(), "null 元素与无ID元素都被跳过：交付项1 + 问题1");
        assertTrue(board.getTodos().stream().anyMatch(t ->
                RdmConstants.NOTIFY_OBJECT_DELIVERY_ITEM.equals(t.getObjectType())));
        assertTrue(board.getTodos().stream().anyMatch(t ->
                RdmConstants.NOTIFY_OBJECT_ISSUE.equals(t.getObjectType())));
    }

    @Test
    @DisplayName("到期日字符串带时间部分也能解析（plan_end_date可能是日期或日期时间字符串）")
    void planEndDateParsingToleratesDateTime() {
        RdmFactVO.ItemFact fact = item(11L, RdmConstants.DI_DEVELOPING, VIEWER);
        fact.setPlanEndDate("2026-01-02 00:00:00");
        fact.setOverdue(true);
        RdmTodoBoardService.TodoInput input = input();
        input.setItems(List.of(fact));

        assertEquals("2026-01-02", only(boardService.build(input)).getDueDate());

        fact.setPlanEndDate("不是日期");
        assertEquals(0, only(boardService.build(input)).getOverdueWorkingDays());
    }

    @Test
    @DisplayName("跨项目视角（projectId=null）：待办仍按各自项目归属，路由不变")
    void crossProjectBoardKeepsPerProjectRouting() {
        RdmFactVO.ItemFact a = item(11L, RdmConstants.DI_DEVELOPING, VIEWER);
        a.setProjectId(1L);
        a.setOverdue(true);
        RdmFactVO.ItemFact b = item(12L, RdmConstants.DI_DEVELOPING, VIEWER);
        b.setProjectId(2L);
        b.setOverdue(true);
        RdmTodoBoardService.TodoInput input = input();
        input.setProjectId(null);
        input.setItems(List.of(a, b));

        RdmFactVO.TodoBoard board = boardService.build(input);

        assertEquals(2, board.getTotal());
        assertNull(board.getProjectId());
        assertEquals(List.of(1L, 2L), board.getTodos().stream().map(RdmFactVO.Todo::getProjectId).toList());
        board.getTodos().forEach(t -> assertRegisteredRoute(t.getActionUrl()));
    }

    @Test
    @DisplayName("isReachedAcceptanceStage：只有三个验收/上线环节算到达（对外共享的唯一判定处）")
    void reachedAcceptanceStageIsSingleSourceOfTruth() {
        assertFalse(RdmTodoBoardService.isReachedAcceptanceStage(null));
        for (String status : List.of(RdmConstants.DI_PREPARING, RdmConstants.DI_DEVELOPING,
                RdmConstants.DI_TESTING)) {
            assertFalse(RdmTodoBoardService.isReachedAcceptanceStage(item(1L, status, VIEWER)), status);
        }
        for (String status : List.of(RdmConstants.DI_PENDING_ACCEPTANCE, RdmConstants.DI_PENDING_RELEASE,
                RdmConstants.DI_RELEASED_PENDING)) {
            assertTrue(RdmTodoBoardService.isReachedAcceptanceStage(item(1L, status, VIEWER)), status);
        }
    }
}
