package com.mftb.admin.service;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.common.Result;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.controller.RdmProjectController;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.dto.RdmFactVO;
import com.mftb.admin.dto.RdmProjectDTO;
import com.mftb.admin.dto.RdmProjectVO;
import com.mftb.admin.entity.RdmAcceptanceRecord;
import com.mftb.admin.entity.RdmDeliveryItem;
import com.mftb.admin.entity.RdmIssue;
import com.mftb.admin.entity.RdmProject;
import com.mftb.admin.entity.RdmProjectMember;
import com.mftb.admin.entity.RdmRequirement;
import com.mftb.admin.entity.RdmTestExecution;
import com.mftb.admin.entity.RdmWorkCalendar;
import com.mftb.admin.entity.RdmWorkTask;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.RdmAcceptanceRecordMapper;
import com.mftb.admin.mapper.RdmDeliveryItemMapper;
import com.mftb.admin.mapper.RdmIssueMapper;
import com.mftb.admin.mapper.RdmProjectMapper;
import com.mftb.admin.mapper.RdmProjectMemberMapper;
import com.mftb.admin.mapper.RdmRequirementMapper;
import com.mftb.admin.mapper.RdmTestBatchMapper;
import com.mftb.admin.mapper.RdmTestExecutionMapper;
import com.mftb.admin.mapper.RdmWorkCalendarMapper;
import com.mftb.admin.mapper.RdmWorkTaskMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.impl.RdmScheduleServiceImpl;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.OperatorResolver;
import org.springframework.jdbc.core.JdbcTemplate;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;

import java.math.BigDecimal;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verifyNoMoreInteractions;

/**
 * 任务22 A.1 / A.5 / A.6 —— 統一事實源的<b>復用點</b>與<b>資源守衛</b>測試。
 *
 * <p>{@link RdmProjectFactServiceTest} 證明事實源自身口徑正確；本類證明<b>消費方真的在用它</b>，
 * 也就是「單一權威事實源」不是寫在注釋裡的願望：
 * <ol>
 *   <li><b>A.1 復用</b>：{@link RdmProjectService} 與 {@link RdmSummaryService} 的項目維度讀入口
 *       一律委派 {@code factService}，本類不再自行 {@code selectCount}；因此
 *       「卡片 = 行級 = 下鉤 = 導出 = 對賬」是結構性質（同一個對象、同一批事實），
 *       而不是「兩邊都記得用同一個條件」的約定；</li>
 *   <li><b>A.1 筛选同源</b>：列表 / 統計卡 / 導出 / 對賬共用同一個 {@code toFactQuery} 投影，
 *       {@code includeTodos} 與 {@code includeItems} 恒為 true（否則卡片的待辦數與導出項數會靜默變 0）；</li>
 *   <li><b>A.2 mine 不退化全量</b>：工作台摘要在 {@code userId==null} 時<b>連事實源都不碰</b>
 *       （{@code verifyNoInteractions}），返回空摘要而不是全量；控制器在未取得認證主體時
 *       原樣下傳 {@code null}，由服務層 fail-closed 拒絕，絕不在控制器裡兜成某個默認用戶；</li>
 *   <li><b>A.5 不由狀態推導</b>：交付清單的 {@code testStatus=passed} 當且僅當任務20
 *       {@code isTestPassed} 為真 —— 交付項 {@code status=done} 也推不出「已通過」；
 *       {@code acceptanceStatus=passed} 當且僅當產品<b>且</b>業務驗收均為真，
 *       只過一半時是 {@code pending}（待裁決）而不是 passed；</li>
 *   <li><b>A.5 集合條件 + 空集合</b>：交付清單取需求標題用 {@code id IN (reqIds)}，
 *       {@code reqIds} 為空時<b>不發 SQL</b>（舊實現在這裡對 ID 集合用 {@code eq} 單值）；</li>
 *   <li><b>A.5 關閉項目 ≠ 交付完成</b>：統計卡與項目列表統計都把 {@code allDeliveredProjects}
 *       與 {@code closedProjects} 分列，{@code completedProjects} 只認 {@code all_delivered}，
 *       絕不相加；</li>
 *   <li><b>A.5 逾期用真實工作日曆</b>：交付清單的 {@code overdueWorkingDays} 走任務21
 *       {@link RdmWorkingDayCalculator}（含請假/週末支援），不是自然日差、也不是簡單的周一至周五；</li>
 *   <li><b>A.6 資源守衛</b>：項目詳情 / 交付項摘要 / 手動催辦都在取數<b>之前</b>過守衛，
 *       被拒時不發任何明細查詢、不發任何通知（先鑒權後取數，不是取完再過濾）；
 *       交付項無所屬項目時按需求過守衛，絕不因為「查不到項目」就放行；</li>
 *   <li><b>A.6 哨兵不越權</b>：{@code todo-board} 的路徑變量 {@code 0} 表示跨項目工作台視角，
 *       必須歸一成 {@code null} 交給事實源收斂範圍；若把 0 當成項目 id 傳下去，
 *       守衛會按「項目 0」判定，等於換了一種越權方式。</li>
 * </ol>
 *
 * <p><b>純 Mockito 離線單測，不連庫、不跑遷移</b>。本類把 {@code factService} 作為 mock，
 * 目的是證明<b>委派關係與參數傳遞</b>正確；事實源自身的聚合口徑由
 * {@link RdmProjectFactServiceTest} 用真實實現證明。mock 不等價於真實數據庫下的並發/事務證明，
 * 真實 DB 下的一致性、並發與唯一約束兜底歸屬任務24。
 */
class RdmFactReuseAndGuardTest {

    private static final long VIEWER = 41L;
    private static final long COORDINATOR = 61L;
    private static final long PROJECT_A = 300L;
    private static final long PROJECT_B = 400L;
    private static final long ITEM_11 = 11L;
    private static final long ITEM_12 = 12L;
    private static final long REQ_701 = 701L;

    /* ---- RdmProjectService 的依賴 ---- */
    private RdmProjectMapper projectMapper;
    private RdmProjectMemberMapper memberMapper;
    private RdmRequirementMapper requirementMapper;
    private RdmWorkTaskMapper taskMapper;
    private SysUserMapper userMapper;
    private BizSeqService bizSeqService;
    private RdmAccessGuard accessGuard;
    private RdmProjectFactService factService;
    private RdmWorkCalendarMapper calendarMapper;
    private RdmWorkingDayCalculator workingDayCalculator;
    private RdmProjectService projectService;

    /* ---- RdmSummaryService 的依賴（factService 與若干 mapper 與上面共用同一批 mock） ---- */
    private RdmDeliveryItemMapper deliveryItemMapper;
    private RdmTestBatchMapper testBatchMapper;
    private RdmTestExecutionMapper testExecutionMapper;
    private RdmAcceptanceRecordMapper acceptanceMapper;
    private RdmIssueMapper issueMapper;
    private RdmScheduleServiceImpl scheduleService;
    private RdmTestBatchService testBatchService;
    private RdmAcceptanceRecordService acceptanceRecordService;
    private RdmSummaryService summaryService;

    /* ---- RdmProjectController 的依賴 ---- */
    private RdmAllowedActionsService allowedActionsService;
    private OperatorResolver operatorResolver;
    private RdmTodoNotifyService todoNotifyService;
    private RdmProjectController controller;

    @BeforeAll
    static void initTableInfo() {
        // LambdaQueryWrapper 解析字段名需要 TableInfo；這裡初始化本類會出現的全部實體
        MapperBuilderAssistant assistant = new MapperBuilderAssistant(new MybatisConfiguration(), "");
        TableInfoHelper.initTableInfo(assistant, RdmProject.class);
        TableInfoHelper.initTableInfo(assistant, RdmProjectMember.class);
        TableInfoHelper.initTableInfo(assistant, RdmRequirement.class);
        TableInfoHelper.initTableInfo(assistant, RdmWorkTask.class);
        TableInfoHelper.initTableInfo(assistant, RdmDeliveryItem.class);
        TableInfoHelper.initTableInfo(assistant, RdmAcceptanceRecord.class);
        TableInfoHelper.initTableInfo(assistant, RdmIssue.class);
        TableInfoHelper.initTableInfo(assistant, RdmTestExecution.class);
        TableInfoHelper.initTableInfo(assistant, RdmWorkCalendar.class);
    }

    @BeforeEach
    void setUp() {
        projectMapper = mock(RdmProjectMapper.class);
        memberMapper = mock(RdmProjectMemberMapper.class);
        requirementMapper = mock(RdmRequirementMapper.class);
        taskMapper = mock(RdmWorkTaskMapper.class);
        userMapper = mock(SysUserMapper.class);
        bizSeqService = mock(BizSeqService.class);
        accessGuard = mock(RdmAccessGuard.class);
        factService = mock(RdmProjectFactService.class);
        calendarMapper = mock(RdmWorkCalendarMapper.class);
        deliveryItemMapper = mock(RdmDeliveryItemMapper.class);
        testBatchMapper = mock(RdmTestBatchMapper.class);
        testExecutionMapper = mock(RdmTestExecutionMapper.class);
        acceptanceMapper = mock(RdmAcceptanceRecordMapper.class);
        issueMapper = mock(RdmIssueMapper.class);
        scheduleService = mock(RdmScheduleServiceImpl.class);
        testBatchService = mock(RdmTestBatchService.class);
        acceptanceRecordService = mock(RdmAcceptanceRecordService.class);
        allowedActionsService = mock(RdmAllowedActionsService.class);
        operatorResolver = mock(OperatorResolver.class);
        todoNotifyService = mock(RdmTodoNotifyService.class);

        // 工作日曆用真實實現（只 mock 它的 mapper）：逾期工作日口徑必須與任務21 同源，
        // 若把 RdmWorkingDayCalculator 也 mock 掉，本類就證明不了「用的是真實工作日曆」
        workingDayCalculator = new RdmWorkingDayCalculator(calendarMapper);
        projectService = new RdmProjectService(projectMapper, memberMapper, mock(JdbcTemplate.class), requirementMapper, taskMapper,
                userMapper, bizSeqService, accessGuard, factService, workingDayCalculator, operatorResolver);
        summaryService = new RdmSummaryService(factService, projectMapper, deliveryItemMapper, taskMapper,
                testBatchMapper, testExecutionMapper, acceptanceMapper, issueMapper, scheduleService,
                testBatchService, acceptanceRecordService, accessGuard);
        controller = new RdmProjectController(projectService, mock(RdmProjectRequirementBoardService.class),
                allowedActionsService, operatorResolver, todoNotifyService, accessGuard);

        // 安全的默認樁：計數 0、集合空，避免 Math.toIntExact(null) 之類把測試失敗原因搞糊
        doReturn(0L).when(taskMapper).selectCount(any());
        doReturn(0L).when(deliveryItemMapper).selectCount(any());
        doReturn(0L).when(issueMapper).selectCount(any());
        doAnswer(inv -> new ArrayList<RdmWorkTask>()).when(taskMapper).selectList(any());
        doAnswer(inv -> new ArrayList<RdmProjectMember>()).when(memberMapper).selectList(any());
        doAnswer(inv -> new ArrayList<RdmRequirement>()).when(requirementMapper).selectList(any());
        doAnswer(inv -> new ArrayList<RdmDeliveryItem>()).when(deliveryItemMapper).selectList(any());
        doAnswer(inv -> new ArrayList<RdmAcceptanceRecord>()).when(acceptanceMapper).selectList(any());
        doAnswer(inv -> new ArrayList<RdmTestExecution>()).when(testExecutionMapper).selectList(any());
        doAnswer(inv -> new ArrayList<RdmWorkCalendar>()).when(calendarMapper).selectList(any());
        doAnswer(inv -> List.of()).when(scheduleService).getBlockedTasks(any());
    }

    /* ==================== A.1 委派與筛选同源 ==================== */

    @Test
    @DisplayName("A.1 列表行取自事實源分頁：total 是全量行數，行級待裁決不再硬編碼 0")
    void listProjectsDelegatesToFactPage() {
        RdmFactVO.ProjectFact factA = projectFact(PROJECT_A, 6, 3, 2, 1);
        RdmFactVO.ProjectFact factB = projectFact(PROJECT_B, 4, 4, 0, 0);
        factB.setDeliveryItemOverdue(0);
        factB.setOverdueFlag(0);
        Page<RdmFactVO.ProjectFact> factPage = new Page<>(2, 1, 25);
        factPage.setRecords(List.of(factA, factB));
        doReturn(factPage).when(factService).projectFactPage(any(), any(), any(), any());

        Page<RdmProjectVO.ListItem> page = projectService.listProjects(query("關鍵詞", "in_progress", 7L, 2, 1), VIEWER);

        // total 必須是「範圍內全部事實行數」，不是當前頁行數（前端分頁與導出總數都靠它）
        assertEquals(25, page.getTotal());
        assertEquals(2, page.getCurrent());
        assertEquals(1, page.getSize());
        assertEquals(2, page.getRecords().size());
        RdmProjectVO.ListItem rowA = page.getRecords().get(0);
        assertEquals(PROJECT_A, rowA.getId());
        assertEquals(3, rowA.getDeliveredCount());
        assertEquals(6, rowA.getTotalDeliveryCount());
        assertEquals(2, rowA.getBlockedCount());
        // 舊實現這裡寫死 0，卡片卻是真實查詢 —— 行級與卡片永遠對不上
        assertEquals(1, rowA.getPendingDecisionCount());
        // 有未完成項已過計劃結束日即視為逾期（跟隨事實源刷新，不再只讀項目主檔的旗標）
        assertEquals(1, rowA.getOverdueFlag());
        assertEquals(0, page.getRecords().get(1).getOverdueFlag());
        assertEquals("PRJ-B", page.getRecords().get(1).getProjectNo());
    }

    @Test
    @DisplayName("A.1 列表/統計卡/導出/對賬共用同一組 filters，且 includeTodos/includeItems 恒為 true")
    void filtersAreProjectedIdenticallyForEveryReadEntry() {
        doReturn(cardsWithProjectBuckets()).when(factService).cards(any(), any());
        doReturn(new RdmFactVO.ExportBundle()).when(factService).exportBundle(any(), any());
        doReturn(new RdmFactVO.Reconciliation()).when(factService).reconcile(any(), any());
        doReturn(new Page<RdmFactVO.ProjectFact>(1, 20, 0)).when(factService).projectFactPage(any(), any(), any(), any());

        RdmProjectDTO.Query query = query("_alpha", "partial_delivered", 77L, 3, 50);
        // 新增的三个筛选条件必须走同一个 toFactQuery 投影：漏一个就会「列表已筛、卡片仍全量、导出又多一批」
        query.setProductOwnerUserId(88L);
        query.setPlanDateFrom("2026-01-01");
        query.setPlanDateTo("2026-12-31");
        projectService.listProjects(query, VIEWER);
        projectService.getStatsCards(query, VIEWER);
        projectService.getExportBundle(query, VIEWER);
        projectService.getReconciliation(query, VIEWER);

        List<RdmFactVO.FactQuery> projected = new ArrayList<>();
        ArgumentCaptor<RdmFactVO.FactQuery> captor = ArgumentCaptor.forClass(RdmFactVO.FactQuery.class);
        verify(factService).projectFactPage(captor.capture(), eq(VIEWER), eq(3), eq(50));
        projected.add(captor.getValue());
        verify(factService).cards(captor.capture(), eq(VIEWER));
        projected.add(captor.getValue());
        verify(factService).exportBundle(captor.capture(), eq(VIEWER));
        projected.add(captor.getValue());
        verify(factService).reconcile(captor.capture(), eq(VIEWER));
        projected.add(captor.getValue());

        assertEquals(4, projected.size());
        for (RdmFactVO.FactQuery fact : projected) {
            // 四個入口的查詢條件必須逐字一致 —— 這正是「卡片顯示全量、列表已篩選」的根治點
            assertEquals("_alpha", fact.getKeyword());
            assertEquals("partial_delivered", fact.getStatus());
            assertEquals(77L, fact.getPmUserId());
            assertEquals(88L, fact.getProductOwnerUserId(), "產品負責人漏投影就是「列表筛了、卡片没筛」");
            assertEquals("2026-01-01", fact.getPlanDateFrom());
            assertEquals("2026-12-31", fact.getPlanDateTo());
            assertTrue(fact.isIncludeTodos(), "不帶待辦時卡片的待辦數會靜默變 0");
            assertTrue(fact.isIncludeItems(), "不帶交付項時導出項數與對賬項數會靜默變 0");
        }
    }

    @Test
    @DisplayName("A.1/A.5 統計卡：關閉項目與交付完成分列，絕不相加")
    void statsCardsKeepClosedApartFromAllDelivered() {
        doReturn(cardsWithProjectBuckets()).when(factService).cards(any(), any());

        RdmProjectVO.StatsCard card = projectService.getStatsCards(query(null, null, null, 1, 20), VIEWER);

        assertEquals(9, card.getTotalProjects());
        assertEquals(5, card.getInProgressCount());
        assertEquals(2, card.getAttentionCount());
        assertEquals(7, card.getPendingDecisionCount());
        assertEquals(1, card.getAllDeliveredProjects());
        assertEquals(3, card.getClosedProjects());
        // 舊實現把 closed 併入「交付完成」，等於「歸檔就算交付完成」
        assertEquals(4, card.getAllDeliveredProjects() + card.getClosedProjects());
        assertEquals(6, card.getDeferResidualCount());
        assertEquals(8, card.getTodoTotal());
        assertEquals(3, card.getTodoMineCount());
        assertEquals(4, card.getTodoWaitingOthersCount());
        assertEquals(1, card.getTodoUnassignedCount());
        // 三桶互斥且窮盡
        assertEquals(card.getTodoTotal(),
                card.getTodoMineCount() + card.getTodoWaitingOthersCount() + card.getTodoUnassignedCount());
    }

    @Test
    @DisplayName("A.1 概覽/待辦/看板/下鉤/導出/對賬一律委派事實源，本類不再自行統計")
    void everyProjectReadEntryIsASingleDelegation() {
        RdmFactVO.ProjectFact fact = projectFact(PROJECT_A, 6, 3, 2, 1);
        doReturn(fact).when(factService).projectFact(PROJECT_A, VIEWER);
        RdmFactVO.TodoBoard board = new RdmFactVO.TodoBoard();
        board.setTotal(1);
        board.getTodos().add(todo(ITEM_11, RdmConstants.NOTIFY_OBJECT_DELIVERY_ITEM,
                RdmConstants.deliveryItemRoute(ITEM_11)));
        doReturn(board).when(factService).todoBoard(PROJECT_A, VIEWER);
        List<RdmFactVO.ItemFact> items = List.of(itemFact(ITEM_11, REQ_701, RdmConstants.DI_DEVELOPING,
                false, false, false, null, false));
        doReturn(items).when(factService).itemFacts(PROJECT_A, VIEWER);
        RdmFactVO.ExportBundle bundle = new RdmFactVO.ExportBundle();
        doReturn(bundle).when(factService).exportBundle(any(), any());
        RdmFactVO.Reconciliation reconciliation = new RdmFactVO.Reconciliation();
        doReturn(reconciliation).when(factService).reconcile(any(), any());

        // 概覽：全部計數直接搬事實，不再另算一套
        RdmProjectVO.Summary summary = projectService.getProjectSummary(PROJECT_A, VIEWER);
        assertEquals(PROJECT_A, summary.getProjectId());
        assertEquals(6, summary.getTotalItems());
        assertEquals(3, summary.getDeliveredItems());
        assertEquals(2, summary.getBlockedItems());
        assertEquals(1, summary.getPendingItems());
        assertEquals("2026-03-02", summary.getNextMilestone());

        // 待辦行：actionUrl 直接搬事實源的已註冊路由，不在這裡重拼（重拼是「問題套用交付項地址」的成因）
        List<RdmProjectVO.PendingItem> pending = projectService.getPendingItems(PROJECT_A, VIEWER);
        assertEquals(1, pending.size());
        assertEquals(RdmConstants.deliveryItemRoute(ITEM_11), pending.get(0).getActionUrl());
        assertEquals(RdmConstants.NOTIFY_OBJECT_DELIVERY_ITEM, pending.get(0).getObjectType());
        assertEquals(RdmConstants.TODO_REASON_OVERDUE, pending.get(0).getType());

        assertSame(board, projectService.getTodoBoard(PROJECT_A, VIEWER));
        assertSame(items, projectService.getItemFacts(PROJECT_A, VIEWER));
        assertSame(bundle, projectService.getExportBundle(query(null, null, null, 1, 20), VIEWER));
        assertSame(reconciliation, projectService.getReconciliation(query(null, null, null, 1, 20), VIEWER));

        verify(factService, times(1)).projectFact(PROJECT_A, VIEWER);
        verify(factService, times(2)).todoBoard(PROJECT_A, VIEWER);
        verify(factService).itemFacts(PROJECT_A, VIEWER);
        // 委派後本類不再對交付項/問題/提測批次自行計數
        verifyNoInteractions(deliveryItemMapper, issueMapper, testBatchMapper);
    }

    @Test
    @DisplayName("A.1 查詢條件為 null 時按默認條件處理，绝不退化成「無條件全量」的另一套查詢")
    void nullQueryIsNormalizedInsteadOfBuildingAnotherConditionSet() {
        doReturn(new Page<RdmFactVO.ProjectFact>(1, 20, 0)).when(factService).projectFactPage(any(), any(), any(), any());
        doReturn(cardsWithProjectBuckets()).when(factService).cards(any(), any());

        projectService.listProjects(null, VIEWER);
        projectService.getStatsCards(null, VIEWER);

        ArgumentCaptor<RdmFactVO.FactQuery> captor = ArgumentCaptor.forClass(RdmFactVO.FactQuery.class);
        verify(factService).projectFactPage(captor.capture(), eq(VIEWER), eq(1), eq(20));
        assertNull(captor.getValue().getKeyword());
        assertNull(captor.getValue().getStatus());
        assertNull(captor.getValue().getPmUserId());
        verify(factService).cards(captor.capture(), eq(VIEWER));
        assertTrue(captor.getValue().isIncludeTodos());
        // null 查詢仍然帶著登錄人，數據範圍由事實源 fail-closed 收斂
        verify(factService, never()).cards(any(), isNull());
    }

    /* ==================== A.5 交付清單口徑 ==================== */

    @Test
    @DisplayName("A.5 交付清單：testStatus/acceptanceStatus 只消費任務20 權威結論，不由任務或交付狀態推導")
    void checklistConsumesAuthoritativeGatesNotStatuses() {
        // 交付項 11：status=done（發布完成）但沒有任何權威通過結論 —— 舊實現在這裡顯示「已驗收」
        RdmFactVO.ItemFact done = itemFact(ITEM_11, REQ_701, RdmConstants.DI_DONE, false, false, false, null, false);
        done.setDelivered(true);
        // 交付項 12：status=testing，權威結論全通過 —— 舊實現因為「還有 doing 任務」顯示「測試中」
        RdmFactVO.ItemFact testing = itemFact(ITEM_12, REQ_701, RdmConstants.DI_TESTING, true, true, true, null, false);
        doReturn(List.of(done, testing)).when(factService).itemFacts(PROJECT_A, VIEWER);
        doReturn(List.of(requirement(REQ_701))).when(requirementMapper).selectList(any());

        List<RdmProjectVO.DeliveryChecklist> groups = projectService.getDeliveryChecklist(PROJECT_A, VIEWER);

        assertEquals(1, groups.size());
        assertEquals(REQ_701, groups.get(0).getReqId());
        assertEquals("需求-701", groups.get(0).getReqTitle());
        assertEquals(2, groups.get(0).getItems().size());

        RdmProjectVO.ChecklistItem doneRow = groups.get(0).getItems().get(0);
        // status=done 推不出「測試通過」，也推不出「已驗收」
        assertNull(doneRow.getTestStatus());
        assertNull(doneRow.getAcceptanceStatus());
        assertFalse(doneRow.getProductAcceptancePassed());
        assertFalse(doneRow.getBizAcceptancePassed());

        RdmProjectVO.ChecklistItem testingRow = groups.get(0).getItems().get(1);
        assertEquals("passed", testingRow.getTestStatus());
        assertEquals("passed", testingRow.getAcceptanceStatus());
        assertTrue(testingRow.getProductAcceptancePassed());
        assertTrue(testingRow.getBizAcceptancePassed());
        // 行級待裁決與卡片同源（事實源承載），不在這裡另算
        assertEquals(2, testingRow.getPendingDecisionCount());
    }

    @Test
    @DisplayName("A.5 只過一半驗收 = pending（待裁決），絕不顯示 passed；testing 僅表示所處環節")
    void halfAcceptedIsPendingNotPassed() {
        RdmFactVO.ItemFact onlyProduct = itemFact(ITEM_11, REQ_701, RdmConstants.DI_PENDING_ACCEPTANCE,
                false, true, false, null, false);
        RdmFactVO.ItemFact onlyBiz = itemFact(ITEM_12, REQ_701, RdmConstants.DI_PENDING_ACCEPTANCE,
                false, false, true, null, false);
        doReturn(List.of(onlyProduct, onlyBiz)).when(factService).itemFacts(PROJECT_A, VIEWER);

        List<RdmProjectVO.ChecklistItem> rows = projectService.getDeliveryChecklist(PROJECT_A, VIEWER)
                .get(0).getItems();

        assertEquals("pending", rows.get(0).getAcceptanceStatus());
        assertTrue(rows.get(0).getProductAcceptancePassed());
        assertFalse(rows.get(0).getBizAcceptancePassed());
        // 業務驗收單方通過同樣不算通過（雙路驗收缺一不可）；但已進入驗收環節，故呈現待裁決
        assertEquals("pending", rows.get(1).getAcceptanceStatus());
        assertFalse(rows.get(1).getProductAcceptancePassed());
        assertTrue(rows.get(1).getBizAcceptancePassed());
        // 未拿到任務20 的測試通過結論：即使已進入驗收環節，testStatus 也不得呈現 passed
        assertNull(rows.get(1).getTestStatus());
        // reqId 相同但需求表查不到時，分組仍在，只是標題為空（不因此丟行）
        assertNull(rows.get(0).getCoordinatorName());
    }

    @Test
    @DisplayName("A.5 逾期工作日走任務21 真實工作日曆（請假/週末支援），不是自然日差")
    void overdueWorkingDaysUseRealWorkingCalendar() {
        LocalDate due = LocalDate.now().minusDays(10);
        RdmFactVO.ItemFact fact = itemFact(ITEM_11, REQ_701, RdmConstants.DI_DEVELOPING,
                false, false, false, due.toString(), true);
        fact.setCoordinatorUserId(COORDINATOR);
        doReturn(List.of(fact)).when(factService).itemFacts(PROJECT_A, VIEWER);

        // 在逾期窗口內挑一個本來是工作日的日子登記請假
        LocalDate leaveDay = firstWeekdayAfter(due.plusDays(1));
        RdmWorkCalendar leave = new RdmWorkCalendar();
        leave.setUserId(COORDINATOR);
        leave.setDay(leaveDay);
        leave.setDayType(RdmWorkCalendar.TYPE_LEAVE);
        leave.setAvailableHours(BigDecimal.ZERO);
        doReturn(List.of(leave)).when(calendarMapper).selectList(any());

        RdmProjectVO.ChecklistItem row = projectService.getDeliveryChecklist(PROJECT_A, VIEWER).get(0).getItems().get(0);

        int expected = workingDayCalculator.overdueWorkingDays(due, LocalDate.now(), COORDINATOR);
        int withoutLeave = RdmWorkingDayCalculator.countWorking(due.plusDays(1), LocalDate.now(),
                RdmWorkingDayCalculator.emptyCalendar());
        // 請假那天必須真的落在逾期窗口內且本來算工作日，否則本斷言沒有意義
        assertTrue(expected < withoutLeave, "請假未影響逾期工作日數：expected=" + expected + ", default=" + withoutLeave);
        assertNotNull(row.getOverdueWorkingDays());
        assertEquals(expected, row.getOverdueWorkingDays());
        // 自然日差（10）與工作日差（扣掉週末與請假）必須不同，否則說明沒走工作日曆
        assertNotEquals((int) ChronoUnit.DAYS.between(due, LocalDate.now()),
                row.getOverdueWorkingDays().intValue());
    }

    @Test
    @DisplayName("A.5 交付清單用集合條件取需求，reqIds 為空時不發 SQL")
    void checklistUsesCollectionConditionAndSkipsSqlWhenEmpty() {
        RdmFactVO.ItemFact withReq = itemFact(ITEM_11, REQ_701, RdmConstants.DI_DEVELOPING,
                false, false, false, null, false);
        RdmFactVO.ItemFact noReq = itemFact(ITEM_12, null, RdmConstants.DI_DEVELOPING,
                false, false, false, null, false);
        doReturn(List.of(withReq, noReq)).when(factService).itemFacts(PROJECT_A, VIEWER);
        projectService.getDeliveryChecklist(PROJECT_A, VIEWER);

        // 必須是 id IN (...)，舊實現在這裡對 ID 集合用 eq 單值，恒不命中
        ArgumentCaptor<LambdaQueryWrapper<RdmRequirement>> captor =
                ArgumentCaptor.forClass(LambdaQueryWrapper.class);
        verify(requirementMapper).selectList(captor.capture());
        String sql = captor.getValue().getSqlSegment();
        assertTrue(sql.contains("id IN"), "應為集合條件，實際 SQL 片段: " + sql);
        assertFalse(sql.contains("id ="), "不得對 ID 集合用 eq 單值條件: " + sql);
        assertTrue(captor.getValue().getParamNameValuePairs().containsValue(REQ_701),
                "集合條件必須帶著 reqId 參數: " + captor.getValue().getParamNameValuePairs());

        // 空集合：全部交付項都沒有 reqId 時一條 SQL 都不發（in() 空集合會生成非法 SQL）
        org.mockito.Mockito.reset(requirementMapper);
        doAnswer(inv -> new ArrayList<RdmRequirement>()).when(requirementMapper).selectList(any());
        doReturn(List.of(noReq)).when(factService).itemFacts(PROJECT_B, VIEWER);
        List<RdmProjectVO.DeliveryChecklist> groups = projectService.getDeliveryChecklist(PROJECT_B, VIEWER);
        assertTrue(groups.isEmpty());
        verify(requirementMapper, never()).selectList(any());
    }

    @Test
    @DisplayName("A.5 阻塞原因取最近一條 blocked 任務；無阻塞時不發這條查詢")
    void blockedReasonComesFromLatestBlockedTask() {
        RdmFactVO.ItemFact blocked = itemFact(ITEM_11, REQ_701, RdmConstants.DI_DEVELOPING,
                false, false, false, null, false);
        blocked.setBlocked(true);
        RdmFactVO.ItemFact normal = itemFact(ITEM_12, REQ_701, RdmConstants.DI_DEVELOPING,
                false, false, false, null, false);
        doReturn(List.of(blocked, normal)).when(factService).itemFacts(PROJECT_A, VIEWER);
        RdmWorkTask task = new RdmWorkTask();
        task.setBlockedReason("等待上游接口聯調");
        doReturn(List.of(task)).when(taskMapper).selectList(any());

        List<RdmProjectVO.ChecklistItem> rows = projectService.getDeliveryChecklist(PROJECT_A, VIEWER).get(0).getItems();

        assertEquals("等待上游接口聯調", rows.get(0).getBlockedReason());
        assertNull(rows.get(1).getBlockedReason());
        // 只有阻塞行才去查原因
        verify(taskMapper, times(1)).selectList(any());
    }

    /* ==================== A.6 資源守衛 ==================== */

    @Test
    @DisplayName("A.6 項目詳情：事實源守衛拒絕時直接拋出，不查成員、不返回任何項目數據")
    void projectDetailRunsResourceGuardBeforeLoadingAnything() {
        RdmProject project = new RdmProject();
        project.setId(PROJECT_A);
        project.setName("項目A");
        doReturn(project).when(projectMapper).selectById(PROJECT_A);
        doThrow(new BusinessException("無權查看該項目數據")).when(factService).projectFact(PROJECT_A, VIEWER);

        BusinessException ex = assertThrows(BusinessException.class,
                () -> projectService.getProjectDetail(PROJECT_A, VIEWER));

        assertEquals("無權查看該項目數據", ex.getMessage());
        verifyNoInteractions(memberMapper);
    }

    @Test
    @DisplayName("A.6 項目詳情：守衛通過後計數全部來自事實源，且加載在途成員")
    void projectDetailLoadsFactsAndMembersWhenVisible() {
        RdmProject project = new RdmProject();
        project.setId(PROJECT_A);
        project.setProjectNo("PRJ-A");
        project.setName("項目A");
        project.setStatus(RdmConstants.PROJECT_IN_PROGRESS);
        doReturn(project).when(projectMapper).selectById(PROJECT_A);
        doReturn(projectFact(PROJECT_A, 6, 3, 2, 1)).when(factService).projectFact(PROJECT_A, VIEWER);
        RdmProjectMember member = new RdmProjectMember();
        member.setId(900L);
        member.setUserId(VIEWER);
        member.setUserName("張三");
        member.setRoleCode("pm");
        doReturn(List.of(member)).when(memberMapper).selectList(any());

        RdmProjectVO.Detail detail = projectService.getProjectDetail(PROJECT_A, VIEWER);

        assertEquals(3, detail.getDeliveredCount());
        assertEquals(6, detail.getTotalDeliveryCount());
        assertEquals(2, detail.getBlockedCount());
        assertEquals(1, detail.getPendingDecisionCount());
        assertEquals(1, detail.getOverdueFlag());
        assertEquals(1, detail.getMembers().size());
        assertEquals("張三", detail.getMembers().get(0).getUserName());
        verify(factService).projectFact(PROJECT_A, VIEWER);
    }

    @Test
    @DisplayName("A.6 項目不存在時直接拒絕，不碰事實源")
    void missingProjectIsRejectedWithoutTouchingFactService() {
        doReturn(null).when(projectMapper).selectById(PROJECT_A);

        BusinessException ex = assertThrows(BusinessException.class,
                () -> projectService.getProjectDetail(PROJECT_A, VIEWER));

        assertEquals("項目不存在或已刪除", ex.getMessage());
        verifyNoInteractions(factService);
    }

    @Test
    @DisplayName("A.6 寫入口（編輯/加成員/移除成員）在服務層獨立重鑒權，不依賴 allowedActions")
    void writeEntriesReAuthorizeIndependently() {
        RdmProject project = new RdmProject();
        project.setId(PROJECT_A);
        project.setVersion(1);
        doReturn(project).when(projectMapper).selectById(PROJECT_A);
        doThrow(new BusinessException("無權操作該項目")).when(accessGuard).requireProjectMember(PROJECT_A, VIEWER);

        assertThrows(BusinessException.class,
                () -> projectService.updateProject(PROJECT_A, new RdmProjectDTO.Update(), VIEWER));
        assertThrows(BusinessException.class,
                () -> projectService.addMember(PROJECT_A, new RdmProjectDTO.MemberAdd(), VIEWER));
        assertThrows(BusinessException.class,
                () -> projectService.removeMember(PROJECT_A, 42L, VIEWER));

        verify(accessGuard, times(3)).requireProjectMember(PROJECT_A, VIEWER);
        // allowedActions 只供 UI 渲染按鈕，寫入路徑一次都不查它
        verifyNoInteractions(allowedActionsService);
        // 守衛拒絕後不得落库：成員表一次都不碰，項目主檔只被「先查存在性」讀了三次
        verifyNoInteractions(memberMapper);
        verify(projectMapper, times(3)).selectById(PROJECT_A);
        verifyNoMoreInteractions(projectMapper);
    }

    /* ==================== RdmSummaryService 的復用點 ==================== */

    @Test
    @DisplayName("A.1 項目摘要全部計數來自事實源，只額外補「待簽署驗收單數」")
    void projectSummaryIsAFactProjection() {
        RdmFactVO.ProjectFact fact = projectFact(PROJECT_A, 6, 3, 2, 1);
        fact.setRequirementTotal(4);
        fact.setTaskTotal(30);
        fact.setTaskCompleted(12);
        fact.setTaskInProgress(9);
        fact.setBlockedTaskCount(5);
        fact.setIssueOpen(8);
        fact.setIssueCritical(2);
        fact.setIssueMajor(3);
        fact.setTestBatchTotal(7);
        fact.setDeferResidualCount(6);
        fact.setTestPassedItemCount(3);
        fact.setProductAcceptedItemCount(2);
        fact.setBizAcceptedItemCount(1);
        fact.setAllDelivered(true);
        fact.setClosed(false);
        fact.setTodoTotal(8);
        fact.setTodoMineCount(3);
        fact.setTodoWaitingOthersCount(4);
        fact.setTodoUnassignedCount(1);
        doReturn(fact).when(factService).projectFact(PROJECT_A, VIEWER);
        RdmDeliveryItem item = new RdmDeliveryItem();
        item.setId(ITEM_11);
        item.setProjectId(PROJECT_A);
        item.setScopeVersion(2);
        doReturn(List.of(item)).when(deliveryItemMapper).selectList(any());
        RdmAcceptanceRecord pendingCurrent = acceptanceRecord(ITEM_11, 2, null);
        RdmAcceptanceRecord pendingHistory = acceptanceRecord(ITEM_11, 1, null);
        doReturn(List.of(pendingCurrent, pendingHistory)).when(acceptanceMapper).selectList(any());

        RdmSummaryService.ProjectSummary s = summaryService.getProjectSummary(PROJECT_A, VIEWER);

        assertEquals(PROJECT_A, s.getProjectId());
        assertEquals(6, s.getDeliveryItemTotal());
        assertEquals(3, s.getDeliveryItemCompleted());
        assertEquals(2, s.getDeliveryItemBlocked());
        assertEquals(4, s.getRequirementTotal());
        assertEquals(30, s.getTaskTotal());
        assertEquals(8, s.getIssueOpen());
        assertEquals(7, s.getTestBatchTotal());
        // 行級待裁決與卡片同口徑（同一個事實對象），不再硬編碼 0
        assertEquals(1, s.getPendingDecisionCount());
        assertEquals(6, s.getDeferResidualCount());
        assertEquals(3, s.getTestPassedItemCount());
        // 關閉 ≠ 交付完成：兩個獨立布爾，互不推導
        assertTrue(s.isAllDelivered());
        assertFalse(s.isClosed());
        assertEquals(8, s.getTodoTotal());
        assertEquals(s.getTodoTotal(), s.getTodoMineCount() + s.getTodoWaitingOthersCount() + s.getTodoUnassignedCount());
        // 待簽署驗收單只統計當前 scopeVersion，歷史版本不再混算
        assertEquals(1, s.getAcceptancePending());
        verify(factService).projectFact(PROJECT_A, VIEWER);
    }

    @Test
    @DisplayName("A.1 事實源返回空時給零值摘要，不用 null/-1 表達「未定義」")
    void projectSummaryWithoutFactIsZeroed() {
        doReturn(null).when(factService).projectFact(PROJECT_A, VIEWER);

        RdmSummaryService.ProjectSummary s = summaryService.getProjectSummary(PROJECT_A, VIEWER);

        assertEquals(PROJECT_A, s.getProjectId());
        assertEquals(0, s.getDeliveryItemTotal());
        assertEquals(0, s.getPendingDecisionCount());
        assertEquals(0, s.getAcceptancePending());
        assertFalse(s.isAllDelivered());
        assertFalse(s.isClosed());
        assertNotNull(s.getComputedAt());
        // 提前返回，不再為「待簽署驗收單」發任何 SQL
        verifyNoInteractions(deliveryItemMapper, acceptanceMapper);
    }

    @Test
    @DisplayName("A.2 工作台摘要：userId 為 null 時連事實源都不碰，返回空摘要（不退化全量）")
    void workbenchIsFailClosedForAnonymous() {
        RdmSummaryService.WorkbenchSummary s = summaryService.getWorkbenchSummary(null);

        assertNotNull(s);
        assertEquals(0, s.getTodoTotal());
        assertEquals(0, s.getTodoMineCount());
        assertEquals(0, s.getTodoWaitingOthersCount());
        assertEquals(0, s.getTodoUnassignedCount());
        assertTrue(s.getTodos().isEmpty());
        assertTrue(s.getProjects().isEmpty());
        assertEquals(0, s.getMyProjectCount());
        assertEquals(0, s.getMyPendingTaskCount());
        assertEquals(0, s.getMyDeliveryItemCount());
        assertEquals(0, s.getUpcomingDeadlineCount());
        assertNotNull(s.getComputedAt());
        // 舊實現寫的是 if (userId != null) {收斂}，null 時直接查全表 —— 那不是匿名看全部，那是越權
        verifyNoInteractions(factService, taskMapper, deliveryItemMapper, projectMapper);
    }

    @Test
    @DisplayName("A.3 工作台待辦來自跨項目去重看板，三桶互斥窮盡且區分「等待他人」")
    void workbenchConsumesCrossProjectDedupedBoard() {
        RdmFactVO.TodoBoard board = new RdmFactVO.TodoBoard();
        board.setTotal(6);
        board.setMineCount(3);
        board.setWaitingOthersCount(2);
        board.setUnassignedCount(1);
        board.setRawReasonHits(11);
        board.getTodos().add(todo(ITEM_11, RdmConstants.NOTIFY_OBJECT_DELIVERY_ITEM,
                RdmConstants.deliveryItemRoute(ITEM_11)));
        doReturn(board).when(factService).todoBoard(isNull(), eq(VIEWER));
        RdmFactVO.Scope scope = new RdmFactVO.Scope();
        scope.setUserId(VIEWER);
        scope.setAuthenticated(true);
        scope.setRestricted(true);
        scope.setProjectIds(new ArrayList<>(List.of(PROJECT_A)));
        doReturn(scope).when(factService).resolveScope(VIEWER);
        RdmProject project = new RdmProject();
        project.setId(PROJECT_A);
        project.setName("項目A");
        project.setStatus(RdmConstants.PROJECT_IN_PROGRESS);
        doReturn(project).when(projectMapper).selectById(PROJECT_A);
        RdmDeliveryItem done = new RdmDeliveryItem();
        done.setId(ITEM_11);
        done.setProjectId(PROJECT_A);
        done.setStatus(RdmConstants.DI_DONE);
        RdmDeliveryItem doing = new RdmDeliveryItem();
        doing.setId(ITEM_12);
        doing.setProjectId(PROJECT_A);
        doing.setStatus(RdmConstants.DI_DEVELOPING);
        doReturn(List.of(done, doing)).when(deliveryItemMapper).selectList(any());
        doReturn(4L).when(taskMapper).selectCount(any());
        doReturn(2L).when(deliveryItemMapper).selectCount(any());

        RdmSummaryService.WorkbenchSummary s = summaryService.getWorkbenchSummary(VIEWER);

        // 跨項目視角：projectId 傳 null，由事實源收斂範圍
        verify(factService).todoBoard(isNull(), eq(VIEWER));
        assertEquals(6, s.getTodoTotal());
        assertEquals(3, s.getTodoMineCount());
        // 「等待他人」獨立成桶：別人該做的事不再算成我的待辦
        assertEquals(2, s.getTodoWaitingOthersCount());
        assertEquals(1, s.getTodoUnassignedCount());
        assertEquals(s.getTodoTotal(), s.getTodoMineCount() + s.getTodoWaitingOthersCount() + s.getTodoUnassignedCount());
        assertEquals(1, s.getTodos().size());
        assertEquals(RdmConstants.deliveryItemRoute(ITEM_11), s.getTodos().get(0).getActionUrl());
        assertEquals(1, s.getMyProjectCount());
        assertEquals(4, s.getMyPendingTaskCount());
        assertEquals(2, s.getMyDeliveryItemCount());
        assertEquals(1, s.getProjects().size());
        assertEquals(2, s.getProjects().get(0).getDeliveryItemTotal());
        assertEquals(1, s.getProjects().get(0).getDeliveryItemCompleted());
        assertEquals(RdmConstants.projectDetailRoute(PROJECT_A), s.getProjects().get(0).getActionUrl());
    }

    @Test
    @DisplayName("A.6 交付項摘要按所屬項目過守衛，未歸屬項目時按需求過守衛，絕不因「查不到項目」放行")
    void deliveryItemSummaryIsGuardedByProjectOrRequirement() {
        RdmDeliveryItem withProject = new RdmDeliveryItem();
        withProject.setId(ITEM_11);
        withProject.setProjectId(PROJECT_A);
        withProject.setReqId(REQ_701);
        withProject.setScopeVersion(2);
        doReturn(withProject).when(deliveryItemMapper).selectById(ITEM_11);
        doThrow(new BusinessException("無權查看該項目數據")).when(factService).requireProjectVisible(PROJECT_A, VIEWER);

        BusinessException ex = assertThrows(BusinessException.class,
                () -> summaryService.getDeliveryItemSummary(ITEM_11, VIEWER));
        assertEquals("無權查看該項目數據", ex.getMessage());
        // 先鑒權後取數：被拒時不發任何明細查詢
        verifyNoInteractions(taskMapper, acceptanceMapper, testExecutionMapper, scheduleService);
        verify(accessGuard, never()).requireVisible(any(Long.class), any());

        RdmDeliveryItem orphan = new RdmDeliveryItem();
        orphan.setId(ITEM_12);
        orphan.setProjectId(null);
        orphan.setReqId(REQ_701);
        orphan.setScopeVersion(null);
        doReturn(orphan).when(deliveryItemMapper).selectById(ITEM_12);
        doThrow(new BusinessException("無權查看該需求數據")).when(accessGuard).requireVisible(REQ_701, "查看交付項摘要");

        BusinessException ex2 = assertThrows(BusinessException.class,
                () -> summaryService.getDeliveryItemSummary(ITEM_12, VIEWER));
        assertEquals("無權查看該需求數據", ex2.getMessage());
        verify(accessGuard).requireVisible(REQ_701, "查看交付項摘要");
        verifyNoInteractions(taskMapper, acceptanceMapper);
    }

    @Test
    @DisplayName("A.5 交付項摘要：驗收只算當前 scopeVersion，權威結論直接消費任務20")
    void deliveryItemSummaryDoesNotMixHistoricalAcceptance() {
        RdmDeliveryItem item = new RdmDeliveryItem();
        item.setId(ITEM_11);
        item.setProjectId(PROJECT_A);
        item.setScopeVersion(2);
        item.setScopeFrozenAt(LocalDateTime.now());
        doReturn(item).when(deliveryItemMapper).selectById(ITEM_11);
        // 歷史版本（sv=1）的一張 pass 與當前版本（sv=2）的一張 pass；库返回的 null 行也必須被跳過
        List<RdmAcceptanceRecord> records = new ArrayList<>();
        records.add(acceptanceRecord(ITEM_11, 1, RdmConstants.ACCEPT_PASS));
        records.add(acceptanceRecord(ITEM_11, 2, RdmConstants.ACCEPT_PASS));
        records.add(null);
        doReturn(records).when(acceptanceMapper).selectList(any());
        // 交付項 status=done 也不能讓測試/驗收變通過：權威結論由任務20 給
        item.setStatus(RdmConstants.DI_DONE);
        doReturn(true).when(testBatchService).isTestPassed(ITEM_11);
        doReturn(true).when(acceptanceRecordService).hasProductAcceptancePassed(ITEM_11, 2);
        doReturn(false).when(acceptanceRecordService).hasBizAcceptancePassed(ITEM_11, 2);
        doReturn(3L).when(issueMapper).selectCount(any());
        RdmScheduleServiceImpl.BlockedTaskInfo info = new RdmScheduleServiceImpl.BlockedTaskInfo();
        doReturn(List.of(info)).when(scheduleService).getBlockedTasks(ITEM_11);

        RdmSummaryService.DeliveryItemSummary s = summaryService.getDeliveryItemSummary(ITEM_11, VIEWER);

        // 歷史版本的 pass 不再混算
        assertEquals(1, s.getAcceptanceTotal());
        assertEquals(1, s.getAcceptancePassed());
        assertTrue(s.isTestPassed());
        assertTrue(s.isProductAcceptancePassed());
        // 業務驗收未通過就是未通過，不因產品已通過或交付項 done 而推導成通過
        assertFalse(s.isBizAcceptancePassed());
        assertEquals(2, s.getScopeVersion());
        assertTrue(s.isScopeFrozen());
        assertEquals(3, s.getIssueOpenCount());
        assertEquals(1, s.getDependencyBlockCount());
        assertEquals("none", s.getLatestTestBatchStatus());
        // 路由必須是已註冊的交付項詳情路由
        assertEquals(RdmConstants.deliveryItemRoute(ITEM_11), s.getActionUrl());
        verify(acceptanceRecordService).hasProductAcceptancePassed(ITEM_11, 2);
        verify(acceptanceRecordService).hasBizAcceptancePassed(ITEM_11, 2);
    }

    @Test
    @DisplayName("A.6 交付項不存在時直接拒絕，不碰任何守衛與統計")
    void missingDeliveryItemIsRejected() {
        doReturn(null).when(deliveryItemMapper).selectById(ITEM_11);

        BusinessException ex = assertThrows(BusinessException.class,
                () -> summaryService.getDeliveryItemSummary(ITEM_11, VIEWER));

        assertEquals("交付項不存在或已刪除", ex.getMessage());
        verifyNoInteractions(factService, accessGuard, taskMapper);
    }

    @Test
    @DisplayName("A.5 項目列表統計：completedProjects 只認 all_delivered，closedProjects 單列")
    void projectListStatsSegregatesClosedAndPassesFilters() {
        doReturn(cardsWithProjectBuckets()).when(factService).cards(any(), any());

        RdmSummaryService.ProjectListStats s =
                summaryService.getProjectListStats(VIEWER, "partial_delivered", "beta");

        ArgumentCaptor<RdmFactVO.FactQuery> captor = ArgumentCaptor.forClass(RdmFactVO.FactQuery.class);
        verify(factService).cards(captor.capture(), eq(VIEWER));
        assertEquals("partial_delivered", captor.getValue().getStatus());
        assertEquals("beta", captor.getValue().getKeyword());
        assertTrue(captor.getValue().isIncludeTodos());

        assertEquals(9, s.getTotalProjects());
        assertEquals(1, s.getAllDeliveredProjects());
        assertEquals(3, s.getClosedProjects());
        // 關閉項目 ≠ 交付完成：completedProjects 只認 all_delivered，絕不把 closed 加進來
        assertEquals(s.getAllDeliveredProjects(), s.getCompletedProjects());
        assertEquals(1, s.getCompletedProjects());
        assertNotEquals(s.getAllDeliveredProjects() + s.getClosedProjects(), s.getCompletedProjects());
        assertEquals(6, s.getDeferResidualCount());
        assertEquals(7, s.getPendingDecisionCount());
        assertEquals(8, s.getTodoTotal());
        assertEquals(s.getTodoTotal(), s.getTodoMineCount() + s.getTodoWaitingOthersCount() + s.getTodoUnassignedCount());
    }

    @Test
    @DisplayName("A.2 項目列表統計：userId 為 null 時原樣交給事實源 fail-closed，不在這裡放開範圍")
    void projectListStatsPassesNullUserStraightThrough() {
        // 未登錄時事實源會返回全 0 的卡片（范围为空），這裡直接用全 0 夹具模拟
        doReturn(new RdmFactVO.CardSummary()).when(factService).cards(any(), any());

        RdmSummaryService.ProjectListStats s = summaryService.getProjectListStats(null, null, null);

        // 絕不在這裡把 null 兜成「全量」：null 原樣下傳，由事實源返回 0 行
        verify(factService).cards(any(), isNull());
        assertEquals(0, s.getTotalProjects());
        assertEquals(0, s.getTodoTotal());
        assertEquals(0, s.getPendingDecisionCount());
    }

    /* ==================== RdmProjectController 的守衛與哨兵 ==================== */

    @Test
    @DisplayName("A.6/B.4 手動催辦：先過項目成員守衛，再發通知（順序顛倒就等於讓非成員催別人項目）")
    void urgeGuardRunsBeforeNotify() {
        doAnswer(inv -> {
            SysUser user = new SysUser();
            user.setId(VIEWER);
            return user;
        }).when(operatorResolver).currentUser();
        RdmTodoNotifyService.TodoNotifyResult result = new RdmTodoNotifyService.TodoNotifyResult();
        result.setScannedProjects(1);
        result.setScannedTodos(4);
        result.setNotified(2);
        result.setDeduped(1);
        result.setNonWorkingDay(1);
        doReturn(result).when(todoNotifyService).urgeProjectManually(PROJECT_A, VIEWER);

        Result<RdmTodoNotifyService.TodoNotifyResult> response = controller.urgeProject(PROJECT_A);

        InOrder order = inOrder(accessGuard, todoNotifyService);
        order.verify(accessGuard).requireProjectMember(PROJECT_A, VIEWER);
        order.verify(todoNotifyService).urgeProjectManually(PROJECT_A, VIEWER);
        assertSame(result, response.getData());
        assertEquals("已按工作日口徑催辦", response.getMessage());
    }

    @Test
    @DisplayName("A.6 守衛拒絕時一條通知都不發（催辦不得成為越權騷擾通道）")
    void urgeIsBlockedWhenGuardFails() {
        doAnswer(inv -> {
            SysUser user = new SysUser();
            user.setId(VIEWER);
            return user;
        }).when(operatorResolver).currentUser();
        doThrow(new BusinessException("無權操作該項目")).when(accessGuard).requireProjectMember(PROJECT_A, VIEWER);

        BusinessException ex = assertThrows(BusinessException.class, () -> controller.urgeProject(PROJECT_A));

        assertEquals("無權操作該項目", ex.getMessage());
        verifyNoInteractions(todoNotifyService);
    }

    @Test
    @DisplayName("A.6 todo-board 的路徑變量 0 是跨項目哨兵，必須歸一成 null 而不是當成項目 id")
    void todoBoardTreatsZeroAsCrossProjectSentinel() {
        doAnswer(inv -> {
            SysUser user = new SysUser();
            user.setId(VIEWER);
            return user;
        }).when(operatorResolver).currentUser();
        doReturn(new RdmFactVO.TodoBoard()).when(factService).todoBoard(any(), any());

        controller.getTodoBoard(0L);
        verify(factService).todoBoard(isNull(), eq(VIEWER));
        // 0 當項目 id 傳下去會讓守衛按「項目 0」判定，等於換了一種越權方式
        verify(factService, never()).todoBoard(eq(0L), any());

        controller.getTodoBoard(-1L);
        verify(factService, times(2)).todoBoard(isNull(), eq(VIEWER));

        controller.getTodoBoard(PROJECT_A);
        verify(factService).todoBoard(PROJECT_A, VIEWER);
    }

    @Test
    @DisplayName("A.2 身份只取認證主體：未取得時原樣下傳 null，由服務層 fail-closed，絕不兜成默認用戶")
    void anonymousIdentityIsPassedThroughAsNull() {
        RdmProjectService mockedProjectService = mock(RdmProjectService.class);
        RdmProjectController mockedController = controllerWith(mockedProjectService);
        doReturn(null).when(operatorResolver).currentUser();
        doReturn(new Page<RdmProjectVO.ListItem>(1, 20, 0)).when(mockedProjectService).listProjects(any(), any());
        doReturn(new RdmProjectVO.StatsCard()).when(mockedProjectService).getStatsCards(any(), any());
        doReturn(new RdmFactVO.ExportBundle()).when(mockedProjectService).getExportBundle(any(), any());
        doReturn(new RdmFactVO.Reconciliation()).when(mockedProjectService).getReconciliation(any(), any());
        doReturn(new RdmFactVO.TodoBoard()).when(mockedProjectService).getTodoBoard(any(), any());

        mockedController.listProjects(new RdmProjectDTO.Query());
        mockedController.getStatsCards(new RdmProjectDTO.Query());
        mockedController.getExportBundle(new RdmProjectDTO.Query());
        mockedController.getReconciliation(new RdmProjectDTO.Query());
        mockedController.getTodoBoard(0L);
        mockedController.getPendingItems(PROJECT_A);
        mockedController.getDeliveryChecklist(PROJECT_A);

        verify(mockedProjectService).listProjects(any(), isNull());
        verify(mockedProjectService).getStatsCards(any(), isNull());
        verify(mockedProjectService).getExportBundle(any(), isNull());
        verify(mockedProjectService).getReconciliation(any(), isNull());
        verify(mockedProjectService).getTodoBoard(isNull(), isNull());
        verify(mockedProjectService).getPendingItems(eq(PROJECT_A), isNull());
        verify(mockedProjectService).getDeliveryChecklist(eq(PROJECT_A), isNull());
    }

    @Test
    @DisplayName("A.7 導出/對賬端點把與列表同一組 filters 原樣下傳，返回全量數據包")
    void exportAndReconciliationForwardFilters() {
        RdmProjectService mockedProjectService = mock(RdmProjectService.class);
        RdmProjectController mockedController = controllerWith(mockedProjectService);
        doAnswer(inv -> {
            SysUser user = new SysUser();
            user.setId(VIEWER);
            return user;
        }).when(operatorResolver).currentUser();
        RdmFactVO.ExportBundle bundle = new RdmFactVO.ExportBundle();
        bundle.getProjects().add(projectFact(PROJECT_A, 6, 3, 2, 1));
        doReturn(bundle).when(mockedProjectService).getExportBundle(any(), any());
        RdmFactVO.Reconciliation reconciliation = new RdmFactVO.Reconciliation();
        reconciliation.setConsistent(true);
        doReturn(reconciliation).when(mockedProjectService).getReconciliation(any(), any());

        RdmProjectDTO.Query query = query("beta", "in_progress", 9L, 1, 20);
        Result<RdmFactVO.ExportBundle> export = mockedController.getExportBundle(query);
        Result<RdmFactVO.Reconciliation> recon = mockedController.getReconciliation(query);

        assertSame(bundle, export.getData());
        assertEquals(1, export.getData().getProjects().size());
        assertSame(reconciliation, recon.getData());
        assertTrue(recon.getData().isConsistent());
        // 同一組 filters：導出內容不會比頁面多出一行越權數據
        ArgumentCaptor<RdmProjectDTO.Query> captor = ArgumentCaptor.forClass(RdmProjectDTO.Query.class);
        verify(mockedProjectService).getExportBundle(captor.capture(), eq(VIEWER));
        assertEquals("beta", captor.getValue().getKeyword());
        assertEquals("in_progress", captor.getValue().getStatus());
        assertEquals(9L, captor.getValue().getPmUserId());
        verify(mockedProjectService).getReconciliation(captor.capture(), eq(VIEWER));
        assertEquals("beta", captor.getValue().getKeyword());
    }

    @Test
    @DisplayName("A.7 列表端點返回的 total 是事實源全量行數（供前端分頁與導出核對）")
    void listEndpointExposesFullRowCount() {
        RdmProjectService mockedProjectService = mock(RdmProjectService.class);
        RdmProjectController mockedController = controllerWith(mockedProjectService);
        doAnswer(inv -> {
            SysUser user = new SysUser();
            user.setId(VIEWER);
            return user;
        }).when(operatorResolver).currentUser();
        Page<RdmProjectVO.ListItem> page = new Page<>(1, 20, 25);
        page.setRecords(List.of(new RdmProjectVO.ListItem()));
        doReturn(page).when(mockedProjectService).listProjects(any(), any());

        Result<PageResult<RdmProjectVO.ListItem>> response = mockedController.listProjects(new RdmProjectDTO.Query());

        // total 必須是事實源的全量行數，不是當前頁行數
        assertEquals(25, response.getData().getTotal());
        assertEquals(1, response.getData().getRecords().size());
        verify(mockedProjectService).listProjects(any(), eq(VIEWER));
    }

    /**
     * 用 mock 的 {@link RdmProjectService} 組一個控制器：這三個用例只驗「身份取值 / 哨兵歸一 /
     * 參數下傳 / 結果封裝」，服務層口徑已由上面的真實實現用例覆蓋。
     */
    private RdmProjectController controllerWith(RdmProjectService mockedProjectService) {
        return new RdmProjectController(mockedProjectService, mock(RdmProjectRequirementBoardService.class),
                allowedActionsService, operatorResolver, todoNotifyService, accessGuard);
    }

    /* ==================== 夹具 ==================== */

    private static RdmProjectDTO.Query query(String keyword, String status, Long pmUserId, int pageNo, int pageSize) {
        RdmProjectDTO.Query query = new RdmProjectDTO.Query();
        query.setKeyword(keyword);
        query.setStatus(status);
        query.setPmUserId(pmUserId);
        query.setPageNo(pageNo);
        query.setPageSize(pageSize);
        return query;
    }

    private static RdmFactVO.ProjectFact projectFact(Long projectId, int itemTotal, int completed,
                                                    int blocked, int pendingDecision) {
        RdmFactVO.ProjectFact fact = new RdmFactVO.ProjectFact();
        fact.setProjectId(projectId);
        fact.setProjectNo(projectId == PROJECT_A ? "PRJ-A" : "PRJ-B");
        fact.setProjectName("項目-" + projectId);
        fact.setStatus(RdmConstants.PROJECT_IN_PROGRESS);
        fact.setDeliveryItemTotal(itemTotal);
        fact.setDeliveryItemCompleted(completed);
        fact.setDeliveryItemInProgress(itemTotal - completed);
        fact.setDeliveryItemBlocked(blocked);
        fact.setDeliveryItemPendingAcceptance(1);
        fact.setDeliveryItemOverdue(1);
        fact.setPendingDecisionCount(pendingDecision);
        fact.setNextDeliveryDate("2026-03-02");
        fact.setActionUrl(RdmConstants.projectDetailRoute(projectId));
        fact.setUpdatedAt("2026-03-01 10:00:00");
        return fact;
    }

    private static RdmFactVO.ItemFact itemFact(Long itemId, Long reqId, String status, boolean testPassed,
                                              boolean productAccepted, boolean bizAccepted,
                                              String planEndDate, boolean overdue) {
        RdmFactVO.ItemFact fact = new RdmFactVO.ItemFact();
        fact.setItemId(itemId);
        fact.setItemNo("DI-" + itemId);
        fact.setTitle("交付項-" + itemId);
        fact.setProjectId(PROJECT_A);
        fact.setReqId(reqId);
        fact.setStatus(status);
        fact.setScopeVersion(2);
        fact.setVersion(5);
        fact.setTestPassed(testPassed);
        fact.setProductAccepted(productAccepted);
        fact.setBizAccepted(bizAccepted);
        fact.setPlanEndDate(planEndDate);
        fact.setOverdue(overdue);
        fact.setPendingDecisionCount(2);
        fact.setActionUrl(RdmConstants.deliveryItemRoute(itemId));
        return fact;
    }

    private static RdmFactVO.Todo todo(Long refId, String objectType, String actionUrl) {
        RdmFactVO.Todo todo = new RdmFactVO.Todo();
        todo.setKey(objectType + ":" + refId + ":" + VIEWER);
        todo.setObjectType(objectType);
        todo.setRefId(refId);
        todo.setRefNo("DI-" + refId);
        todo.setTitle("交付項-" + refId);
        todo.setProjectId(PROJECT_A);
        todo.setResponsibleUserId(VIEWER);
        todo.setBucket(RdmConstants.TODO_BUCKET_MINE);
        todo.setReasons(new ArrayList<>(List.of(RdmConstants.TODO_REASON_OVERDUE)));
        todo.setOverdue(true);
        todo.setActionUrl(actionUrl);
        return todo;
    }

    /**
     * 項目分桶夹具：已交付完成 1 個、已關閉 3 個、暫停 2 個。
     * <p>三個数字故意互不相同且不等於「交付完成 + 已關閉」，一旦有地方把 closed 併入完成就會当场失敗。
     */
    private static RdmFactVO.CardSummary cardsWithProjectBuckets() {
        RdmFactVO.CardSummary cards = new RdmFactVO.CardSummary();
        cards.setTotalProjects(9);
        cards.setActiveProjects(4);
        cards.setInProgressCount(5);
        cards.setAttentionCount(2);
        cards.setPendingDecisionCount(7);
        cards.setAllDeliveredProjects(1);
        cards.setClosedProjects(3);
        cards.setPausedProjects(2);
        cards.setTotalDeliveryItems(20);
        cards.setDeliveredItems(11);
        cards.setBlockedCount(4);
        cards.setDeferResidualCount(6);
        cards.setTodoTotal(8);
        cards.setTodoMineCount(3);
        cards.setTodoWaitingOthersCount(4);
        cards.setTodoUnassignedCount(1);
        return cards;
    }

    private static RdmRequirement requirement(Long reqId) {
        RdmRequirement req = new RdmRequirement();
        req.setId(reqId);
        req.setReqNo("REQ-" + reqId);
        req.setTitle("需求-" + reqId);
        return req;
    }

    private static RdmAcceptanceRecord acceptanceRecord(Long itemId, Integer scopeVersion, String conclusion) {
        RdmAcceptanceRecord record = new RdmAcceptanceRecord();
        record.setDeliveryItemId(itemId);
        record.setScopeVersion(scopeVersion);
        record.setConclusion(conclusion);
        return record;
    }

    /** 逾期窗口內第一個本來算工作日的日子（跳過週末），保證請假斷言不是空轉 */
    private static LocalDate firstWeekdayAfter(LocalDate from) {
        LocalDate cursor = from;
        for (int guard = 0; guard < 30; guard++) {
            DayOfWeek dow = cursor.getDayOfWeek();
            if (dow != DayOfWeek.SATURDAY && dow != DayOfWeek.SUNDAY) {
                return cursor;
            }
            cursor = cursor.plusDays(1);
        }
        return from;
    }
}
