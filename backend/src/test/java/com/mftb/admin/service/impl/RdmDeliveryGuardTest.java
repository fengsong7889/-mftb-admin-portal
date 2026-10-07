package com.mftb.admin.service.impl;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.RdmDeliveryDTO;
import com.mftb.admin.entity.RdmMilestone;
import com.mftb.admin.entity.RdmPrd;
import com.mftb.admin.entity.RdmRequirement;
import com.mftb.admin.entity.RdmWorkLog;
import com.mftb.admin.entity.RdmWorkTask;
import com.mftb.admin.mapper.RdmChangeRequestMapper;
import com.mftb.admin.mapper.RdmIterationMapper;
import com.mftb.admin.mapper.RdmMilestoneMapper;
import com.mftb.admin.mapper.RdmPrdMapper;
import com.mftb.admin.mapper.RdmPrdSnapshotMapper;
import com.mftb.admin.mapper.RdmRequirementMapper;
import com.mftb.admin.mapper.RdmRequirementRoleMapper;
import com.mftb.admin.mapper.RdmReviewMapper;
import com.mftb.admin.mapper.RdmWorkLogMapper;
import com.mftb.admin.mapper.RdmWorkTaskMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.OaRequestService;
import com.mftb.admin.service.PermissionService;
import com.mftb.admin.service.RdmAccessGuard;
import com.mftb.admin.service.RdmConfigService;
import com.mftb.admin.service.RdmDeliveryService;
import com.mftb.admin.service.RdmNotifyService;
import com.mftb.admin.service.RdmRequirementService;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 交付守卫测试（阶段 3）。
 * <p>锁死的是「计划与交付事实不能被糊过去」这几条：
 * <ol>
 *   <li>已定稿的 PRD 不可原地修改，只能开新版本并写原因；</li>
 *   <li>任务估时/日期必须自洽，负责人必须有交付权限；</li>
 *   <li>完成任务必须留交付说明，不再自动补 1 工日；</li>
 *   <li>基线冻结后初步计划不可回改，不适用节点必须写原因。</li>
 * </ol>
 */
class RdmDeliveryGuardTest {

    private RdmAccessGuard accessGuard;
    private RdmPrdMapper prdMapper;
    private RdmWorkTaskMapper taskMapper;
    private RdmMilestoneMapper milestoneMapper;
    private RdmWorkLogMapper workLogMapper;
    private RdmRequirementMapper requirementMapper;
    private OperatorResolver operatorResolver;
    private RdmDeliveryService service;

    @BeforeEach
    void setUp() {
        prdMapper = mock(RdmPrdMapper.class);
        taskMapper = mock(RdmWorkTaskMapper.class);
        milestoneMapper = mock(RdmMilestoneMapper.class);
        workLogMapper = mock(RdmWorkLogMapper.class);
        requirementMapper = mock(RdmRequirementMapper.class);
        accessGuard = mock(RdmAccessGuard.class);
        operatorResolver = mock(OperatorResolver.class);
        when(operatorResolver.operatorSignature(any())).thenReturn("MF00041|李四");
        // 当前登录人固定为任务负责人：工时明细只允许本人填报，多个用例要走到真实分支
        when(operatorResolver.currentUser()).thenReturn(owner41());
        service = new RdmDeliveryServiceImpl(
                prdMapper, mock(RdmReviewMapper.class), taskMapper,
                mock(RdmIterationMapper.class), mock(RdmChangeRequestMapper.class),
                requirementMapper, mock(RdmRequirementRoleMapper.class), mock(SysUserMapper.class),
                mock(BizSeqService.class), operatorResolver, mock(RdmConfigService.class),
                mock(RdmNotifyService.class), mock(RdmRequirementService.class),
                mock(OaRequestService.class), mock(JdbcTemplate.class), accessGuard,
                milestoneMapper, workLogMapper, mock(RdmPrdSnapshotMapper.class),
                mock(PermissionService.class));
        when(accessGuard.requireDeliveryWriter(anyLong(), anyString())).thenReturn(requirement(RdmConstants.STATUS_ACCEPTED));
        when(accessGuard.requireVisible(anyLong(), anyString())).thenReturn(requirement(RdmConstants.STATUS_ACCEPTED));
        when(requirementMapper.selectById(any())).thenReturn(requirement(RdmConstants.STATUS_ACCEPTED));
        when(milestoneMapper.selectList(any())).thenReturn(List.of());
        when(milestoneMapper.selectOne(any())).thenReturn(null);
        when(prdMapper.selectById(any())).thenReturn(frozenPrd());
        when(taskMapper.selectById(any())).thenReturn(task());
    }

    /** 任务负责人（ownerUserId=41，与 task() 一致） */
    private static com.mftb.admin.entity.SysUser owner41() {
        com.mftb.admin.entity.SysUser u = new com.mftb.admin.entity.SysUser();
        u.setId(41L);
        u.setEmpId("MF00041");
        u.setName("李四");
        u.setStatus(1);
        return u;
    }

    private static RdmRequirement requirement(String status) {
        RdmRequirement req = new RdmRequirement();
        req.setId(1L);
        req.setReqNo("XQ202610060001");
        req.setTitle("門店自營活動報名後台");
        req.setStatus(status);
        req.setSubmitterUserId(11L);
        req.setAssigneePmUserId(21L);
        req.setAssigneePmName("陳雅婷");
        return req;
    }

    private static RdmPrd frozenPrd() {
        RdmPrd prd = new RdmPrd();
        prd.setId(9L);
        prd.setReqId(1L);
        prd.setPrdNo("PRD202610060001");
        prd.setTitle("活動報名後台 PRD");
        prd.setStatus("approved");
        prd.setVersionNo("v1.0");
        return prd;
    }

    private static RdmWorkTask task() {
        RdmWorkTask task = new RdmWorkTask();
        task.setId(5L);
        task.setReqId(1L);
        task.setTaskType("backend");
        task.setTitle("報名接口開發");
        task.setStatus("doing");
        task.setOwnerUserId(41L);
        return task;
    }

    private static RdmDeliveryDTO.Task taskDto(String type, BigDecimal planHours, String start, String finish) {
        RdmDeliveryDTO.Task dto = new RdmDeliveryDTO.Task();
        dto.setReqId(1L);
        dto.setTaskType(type);
        dto.setTitle("報名接口開發");
        dto.setPlanHours(planHours);
        dto.setPlanStartDate(start);
        dto.setPlanFinishDate(finish);
        return dto;
    }

    private static RdmDeliveryDTO.Milestone milestone(String code, String status, String preliminary, String reason) {
        RdmDeliveryDTO.Milestone m = new RdmDeliveryDTO.Milestone();
        m.setCode(code);
        m.setStatus(status);
        m.setPreliminaryDate(preliminary);
        m.setNaReason(reason);
        return m;
    }

    @Test
    @DisplayName("已定稿的 PRD 不可原地修改")
    void approvedPrdCannotBeEditedInPlace() {
        RdmDeliveryDTO.Prd dto = new RdmDeliveryDTO.Prd();
        dto.setId(9L);
        dto.setTitle("改了标题");

        BusinessException ex = assertThrows(BusinessException.class, () -> service.savePrd(dto));
        assertTrue(ex.getMessage().contains("不可原地修改"), ex.getMessage());
    }

    @Test
    @DisplayName("开新版本必须写变更原因")
    void newVersionRequiresReason() {
        RdmDeliveryDTO.Prd dto = new RdmDeliveryDTO.Prd();
        dto.setId(9L);
        dto.setTitle("改了标题");
        dto.setNewVersion(true);

        BusinessException ex = assertThrows(BusinessException.class, () -> service.savePrd(dto));
        assertTrue(ex.getMessage().contains("變更原因"), ex.getMessage());
    }

    @Test
    @DisplayName("负数估时、起止倒挂、未知任务类型都被拦下")
    void taskFormIsValidated() {
        assertThrows(BusinessException.class,
                () -> service.saveTask(taskDto("backend", new BigDecimal("-3"), null, null)));
        assertThrows(BusinessException.class,
                () -> service.saveTask(taskDto("backend", BigDecimal.TEN, "2026-10-20", "2026-10-10")));
        assertThrows(BusinessException.class,
                () -> service.saveTask(taskDto("firmware", BigDecimal.TEN, null, null)));
    }

    @Test
    @DisplayName("完成任务必须写交付说明，不再自动补 1 工日")
    void doneRequiresEvidenceAndNoFakeHours() {
        RdmDeliveryDTO.TaskProgress dto = new RdmDeliveryDTO.TaskProgress();
        dto.setAction("done");
        dto.setProgress(100);

        BusinessException ex = assertThrows(BusinessException.class, () -> service.updateTaskProgress(5L, dto));
        assertTrue(ex.getMessage().contains("交付說明"), ex.getMessage());

        RdmDeliveryDTO.TaskProgress outOfRange = new RdmDeliveryDTO.TaskProgress();
        outOfRange.setAction("start");
        outOfRange.setProgress(180);
        assertThrows(BusinessException.class, () -> service.updateTaskProgress(5L, outOfRange));
    }

    @Test
    @DisplayName("节点标为不适用必须写原因")
    void notApplicableRequiresReason() {
        BusinessException ex = assertThrows(BusinessException.class, () -> service.saveMilestones(1L,
                List.of(milestone(RdmMilestone.CODE_DESIGN_DONE, RdmMilestone.STATUS_NOT_APPLICABLE, null, null))));
        assertTrue(ex.getMessage().contains("原因"), ex.getMessage());
    }

    @Test
    @DisplayName("基线已冻结的节点不能回改初步计划")
    void frozenBaselineLocksPreliminary() {
        RdmMilestone existing = new RdmMilestone();
        existing.setId(7L);
        existing.setReqId(1L);
        existing.setCode(RdmMilestone.CODE_DEV_DONE);
        existing.setName("開發完成");
        existing.setStatus(RdmMilestone.STATUS_PENDING);
        existing.setBaselineDate(LocalDate.of(2026, 10, 30));
        existing.setPreliminaryDate(LocalDate.of(2026, 10, 30));
        when(milestoneMapper.selectOne(any())).thenReturn(existing);

        BusinessException ex = assertThrows(BusinessException.class, () -> service.saveMilestones(1L,
                List.of(milestone(RdmMilestone.CODE_DEV_DONE, RdmMilestone.STATUS_PENDING, "2026-11-20", null))));
        assertTrue(ex.getMessage().contains("基線已凍結"), ex.getMessage());
    }

    @Test
    @DisplayName("未到评审通过阶段不能冻结基线")
    void freezeRequiresReviewPassed() {
        when(accessGuard.requireDeliveryWriter(anyLong(), anyString()))
                .thenReturn(requirement(RdmConstants.STATUS_PRD_DESIGNING));

        BusinessException ex = assertThrows(BusinessException.class, () -> service.freezeMilestoneBaseline(1L));
        assertTrue(ex.getMessage().contains("凍結基線"), ex.getMessage());
    }

    @Test
    @DisplayName("无任何节点计划时不能冻结基线")
    void freezeNeedsPlanFirst() {
        // 先过状态关（评审通过），才能跑到「有没有计划」这一道
        when(accessGuard.requireDeliveryWriter(anyLong(), anyString()))
                .thenReturn(requirement(RdmConstants.STATUS_REVIEW_PASSED));
        when(milestoneMapper.selectList(any())).thenReturn(List.of());

        BusinessException ex = assertThrows(BusinessException.class, () -> service.freezeMilestoneBaseline(1L));
        assertTrue(ex.getMessage().contains("尚未規劃"), ex.getMessage());
    }

    /**
     * 评审/上线时间两种常见格式都要能解析。
     * <p>回归场景：LocalDateTime.parse 只认 ISO 的 'T'，把 T 换成空格的写法
     * 会让所有带空格的页面时间在改严之后直接报错（以前那么写会被静默当成 now）。
     */
    @Test
    @DisplayName("时间解析兼容空格与 ISO 格式")
    void dateTimeParsingAcceptsBothFormats() {
        java.time.LocalDateTime expected = java.time.LocalDateTime.of(2026, 10, 8, 20, 0);
        assertEquals(expected, RdmDeliveryServiceImpl.parseDateTimeStrict("2026-10-08 20:00"));
        assertEquals(expected, RdmDeliveryServiceImpl.parseDateTimeStrict("2026-10-08T20:00:00"));
        assertEquals(expected, RdmDeliveryServiceImpl.parseDateTimeStrict("2026-10-08T20:00"));
        // 不可解析时必须抛出（上层包成业务异常），不得再静默返回 now
        assertThrows(java.time.format.DateTimeParseException.class,
                () -> RdmDeliveryServiceImpl.parseDateTimeStrict("2026年10月8日 20:00"));
    }

    /** 未知节点编码直接拒绝：静默丢弃会让人以为节点已经盘过 */
    @Test
    @DisplayName("未知节点编码直接拒绝")
    void unknownMilestoneCodeRejected() {
        BusinessException ex = assertThrows(BusinessException.class, () -> service.saveMilestones(1L,
                List.of(milestone("LAUNCH_PARTY", RdmMilestone.STATUS_PENDING, "2026-11-01", null))));
        assertTrue(ex.getMessage().contains("節點編碼"), ex.getMessage());
    }

    /**
     * 补报过去的工时必须落在填报那一天，而不是今天。
     * <p>回归场景：开发昨天做了 6 小时、今天才上报；若被记成今天，
     * 负载核算与按日统计会双双失真，而表面上总数看起来还是对的。
     */
    @Test
    @DisplayName("工时明细按填报日期落库，不会全部堆到今天")
    void workLogKeepsReportedDate() {
        RdmDeliveryDTO.WorkLog entry = new RdmDeliveryDTO.WorkLog();
        entry.setWorkDate(LocalDate.now().minusDays(1).toString());
        entry.setHours(new BigDecimal("6"));

        service.saveWorkLogs(5L, List.of(entry));

        ArgumentCaptor<RdmWorkLog> captor = ArgumentCaptor.forClass(RdmWorkLog.class);
        verify(workLogMapper).insert(captor.capture());
        assertEquals(LocalDate.now().minusDays(1), captor.getValue().getWorkDate());
        assertEquals(new BigDecimal("6"), captor.getValue().getHours());
    }
}
