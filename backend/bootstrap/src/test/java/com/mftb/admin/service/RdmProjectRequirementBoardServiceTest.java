package com.mftb.admin.service;

import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.RdmFactVO;
import com.mftb.admin.dto.RdmProjectRequirementVO;
import com.mftb.admin.entity.RdmDeliveryItem;
import com.mftb.admin.entity.RdmIteration;
import com.mftb.admin.entity.RdmRequirement;
import com.mftb.admin.entity.RdmWorkTask;
import com.mftb.admin.mapper.RdmDeliveryItemMapper;
import com.mftb.admin.mapper.RdmIterationMapper;
import com.mftb.admin.mapper.RdmRequirementMapper;
import com.mftb.admin.mapper.RdmWorkTaskMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 项目详情「迭代 → 需求」视角单测（纯 Mockito，不连库）。
 *
 * <p>钉住三件事：需求按迭代归组（未挂迭代进「未排期」而不是消失）、
 * 待推进按需求/任务类型生成、概览同时给出需求与交付项两套口径
 * —— 旧实现只按交付项取数，项目挂着待准入需求时详情页整块为空。
 */
class RdmProjectRequirementBoardServiceTest {

    private static final long PROJECT_ID = 4L;
    private static final long USER_ID = 41L;

    private RdmIterationMapper iterationMapper;
    private RdmRequirementMapper requirementMapper;
    private RdmDeliveryItemMapper deliveryItemMapper;
    private RdmWorkTaskMapper taskMapper;
    private RdmProjectFactService factService;
    private RdmProjectRequirementBoardService service;

    @BeforeEach
    void setUp() {
        iterationMapper = mock(RdmIterationMapper.class);
        requirementMapper = mock(RdmRequirementMapper.class);
        deliveryItemMapper = mock(RdmDeliveryItemMapper.class);
        taskMapper = mock(RdmWorkTaskMapper.class);
        factService = mock(RdmProjectFactService.class);

        RdmFactVO.ProjectFact fact = new RdmFactVO.ProjectFact();
        fact.setDeliveryItemTotal(3);
        fact.setDeliveryItemCompleted(1);
        fact.setDeliveryItemPendingAcceptance(1);
        fact.setPendingDecisionCount(2);
        when(factService.projectFact(PROJECT_ID, USER_ID)).thenReturn(fact);
        RdmFactVO.TodoBoard emptyBoard = new RdmFactVO.TodoBoard();
        emptyBoard.setTodos(List.of());
        when(factService.todoBoard(PROJECT_ID, USER_ID)).thenReturn(emptyBoard);

        when(iterationMapper.selectList(any())).thenReturn(List.of());
        when(requirementMapper.selectList(any())).thenReturn(List.of());
        when(deliveryItemMapper.selectList(any())).thenReturn(List.of());
        when(taskMapper.selectList(any())).thenReturn(List.of());

        service = new RdmProjectRequirementBoardService(
                iterationMapper, requirementMapper, deliveryItemMapper, taskMapper, factService);
    }

    private RdmRequirement req(long id, String no, String title, String status, String iterationCode) {
        RdmRequirement req = new RdmRequirement();
        req.setId(id);
        req.setReqNo(no);
        req.setTitle(title);
        req.setStatus(status);
        req.setIterationCode(iterationCode);
        return req;
    }

    @Test
    @DisplayName("需求按迭代分组：挂迭代的进组，未挂迭代的进「未排期」而不是消失")
    void groupsRequirementsByIteration() {
        RdmIteration iteration = new RdmIteration();
        iteration.setCode("SP2026-10A");
        iteration.setName("10月迭代");
        iteration.setStatus("active");
        iteration.setStartDate(LocalDate.of(2026, 10, 1));
        iteration.setEndDate(LocalDate.of(2026, 10, 31));
        when(iterationMapper.selectList(any())).thenReturn(List.of(iteration));

        RdmRequirement planned = req(10L, "XQ001", "已排期需求", "developing", "SP2026-10A");
        RdmRequirement unplanned = req(11L, "XQ002", "未排期需求", "developing", null);
        when(requirementMapper.selectList(any())).thenReturn(List.of(planned, unplanned));

        RdmDeliveryItem item = new RdmDeliveryItem();
        item.setId(100L);
        item.setReqId(10L);
        item.setStatus(RdmConstants.DI_DONE);
        when(deliveryItemMapper.selectList(any())).thenReturn(List.of(item));

        RdmProjectRequirementVO.Board board = service.getBoard(PROJECT_ID, USER_ID);

        assertEquals(1, board.getIterations().size());
        assertEquals("SP2026-10A", board.getIterations().get(0).getIterationCode());
        assertEquals(1, board.getIterations().get(0).getRequirements().size());
        // 交付项降为需求行上的完成度：拆过就显示 1/1
        assertEquals(1, board.getIterations().get(0).getRequirements().get(0).getDeliveryItemTotal());
        assertEquals(1, board.getIterations().get(0).getRequirements().get(0).getDeliveryItemDone());
        // 未挂迭代的需求必须仍可见，且交付项为 0=未拆分
        assertEquals(1, board.getUnplanned().size());
        assertEquals(0, board.getUnplanned().get(0).getDeliveryItemTotal());
    }

    @Test
    @DisplayName("待推进按需求/任务口径：待准入、未排期、阻塞任务、待裁决都进待办")
    void buildsRequirementAndTaskTodos() {
        RdmRequirement pending = req(10L, "XQ001", "待准入需求", RdmConstants.STATUS_INTAKE_PENDING, null);
        RdmRequirement noPlan = req(11L, "XQ002", "已受理未排期", RdmConstants.STATUS_REVIEW_PASSED, null);
        RdmRequirement planned = req(12L, "XQ003", "已排期", RdmConstants.STATUS_DEVELOPING, "SP2026-10A");
        planned.setDevOwnerUserId(9L);
        when(requirementMapper.selectList(any())).thenReturn(List.of(pending, noPlan, planned));

        RdmWorkTask blocked = new RdmWorkTask();
        blocked.setId(300L);
        blocked.setReqId(12L);
        blocked.setTaskNo("RT001");
        blocked.setTitle("聯調被卡");
        blocked.setStatus(RdmConstants.TASK_BLOCKED);
        blocked.setBlockedReason("等第三方");
        when(taskMapper.selectList(any())).thenReturn(List.of(blocked));

        RdmFactVO.Todo issue = new RdmFactVO.Todo();
        issue.setObjectType(RdmConstants.NOTIFY_OBJECT_ISSUE);
        issue.setRefId(900L);
        issue.setTitle("未決問題");
        issue.setActionUrl("/rdm-issue?id=900");
        RdmFactVO.TodoBoard issueBoard = new RdmFactVO.TodoBoard();
        issueBoard.setTodos(List.of(issue));
        when(factService.todoBoard(PROJECT_ID, USER_ID)).thenReturn(issueBoard);

        RdmProjectRequirementVO.Board board = service.getBoard(PROJECT_ID, USER_ID);

        Set<String> types = board.getTodos().stream()
                .map(RdmProjectRequirementVO.Todo::getType)
                .collect(Collectors.toSet());
        assertTrue(types.containsAll(Set.of("intake_pending", "unplanned", "blocked_task", "decision")),
                "待办类型缺项: " + types);
        assertEquals(1, board.getSummary().getBlockedTaskCount());
        assertEquals(1, board.getSummary().getRequirementPending());
    }

    @Test
    @DisplayName("概览双口径：需求进度与交付项进度同一次查询产出")
    void summaryKeepsBothRequirementAndDeliveryItemCounts() {
        RdmRequirement delivered = req(10L, "XQ001", "已交付", RdmConstants.STATUS_VERIFIED, null);
        RdmRequirement working = req(11L, "XQ002", "进行中", RdmConstants.STATUS_TESTING, null);
        RdmRequirement pending = req(12L, "XQ003", "待准入", RdmConstants.STATUS_INTAKE_PENDING, null);
        when(requirementMapper.selectList(any())).thenReturn(List.of(delivered, working, pending));

        RdmProjectRequirementVO.Board board = service.getBoard(PROJECT_ID, USER_ID);
        RdmProjectRequirementVO.Summary summary = board.getSummary();

        assertEquals(3, summary.getRequirementTotal());
        assertEquals(1, summary.getRequirementDelivered());
        assertEquals(1, summary.getRequirementInProgress());
        assertEquals(1, summary.getRequirementPending());
        // 交付项口径来自事实源，保持不变（未拆分时项目级仍可能为 0）
        assertEquals(3, summary.getDeliveryItemTotal());
        assertEquals(1, summary.getDeliveryItemDone());
        assertEquals(1, summary.getPendingAcceptanceCount());
        assertEquals(2, summary.getPendingDecisionCount());
    }
}
