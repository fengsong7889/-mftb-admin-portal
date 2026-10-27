package com.mftb.admin.service.impl;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.RdmBatchBackfillAcceptDTO;
import com.mftb.admin.dto.RdmBatchBackfillVO;
import com.mftb.admin.entity.RdmRequirement;
import com.mftb.admin.entity.RdmStatusLog;
import com.mftb.admin.entity.RdmWorkTask;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.RdmAcceptanceCaseMapper;
import com.mftb.admin.mapper.RdmAcceptanceMapper;
import com.mftb.admin.mapper.RdmAttachmentMapper;
import com.mftb.admin.mapper.RdmCommentMapper;
import com.mftb.admin.mapper.RdmRequirementMapper;
import com.mftb.admin.mapper.RdmRequirementRoleMapper;
import com.mftb.admin.mapper.RdmRequirementTargetMapper;
import com.mftb.admin.mapper.RdmStatusLogMapper;
import com.mftb.admin.mapper.RdmWorkTaskMapper;
import com.mftb.admin.mapper.SysDepartmentMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.OaRequestService;
import com.mftb.admin.service.PermissionService;
import com.mftb.admin.service.RdmAccessGuard;
import com.mftb.admin.service.RdmAllowedActionsService;
import com.mftb.admin.service.RdmConfigService;
import com.mftb.admin.service.RdmDeliveryItemService;
import com.mftb.admin.service.RdmFlowVersionGuard;
import com.mftb.admin.service.RdmIntakeCallbackService;
import com.mftb.admin.service.RdmIntakePolicyService;
import com.mftb.admin.service.RdmIntakeRoundService;
import com.mftb.admin.service.RdmNotifyService;
import com.mftb.admin.service.RdmPrdTaskService;
import com.mftb.admin.service.RdmReleaseService;
import com.mftb.admin.service.RdmRequirementStructureService;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 存量導入需求補錄受理信息測試。
 *
 * <p>釘住四條口徑：
 * <ol>
 *   <li>只有分配權/全量權/管理員可以補錄，普通參與人不能；</li>
 *   <li>只處理 PRD 階段（受理後、排期前）的 V1/V2 需求，排期後/V3 一律跳過；</li>
 *   <li>缺產品經理的行不建任務（否則任務掛空負責人，任務視圖看不到人）；</li>
 *   <li>補建的產品任務按「已完成」落庫，並寫一條立即閉合的補錄流水。</li>
 * </ol>
 */
class RdmRequirementBackfillTest {

    private OperatorResolver operatorResolver;
    private RdmRequirementMapper requirementMapper;
    private RdmWorkTaskMapper taskMapper;
    private RdmStatusLogMapper statusLogMapper;
    private SysUserMapper userMapper;
    private RdmAccessGuard accessGuard;
    private BizSeqService bizSeqService;
    private JdbcTemplate jdbcTemplate;
    private RdmConfigService configService;
    private RdmRequirementServiceImpl service;

    @BeforeEach
    void setUp() {
        operatorResolver = mock(OperatorResolver.class);
        requirementMapper = mock(RdmRequirementMapper.class);
        taskMapper = mock(RdmWorkTaskMapper.class);
        statusLogMapper = mock(RdmStatusLogMapper.class);
        userMapper = mock(SysUserMapper.class);
        accessGuard = mock(RdmAccessGuard.class);
        bizSeqService = mock(BizSeqService.class);
        jdbcTemplate = mock(JdbcTemplate.class);
        configService = mock(RdmConfigService.class);
        when(configService.stageMap()).thenReturn(Map.of());
        when(operatorResolver.operatorSignature(any())).thenReturn("sysadmin(00001)");
        when(operatorResolver.isAdmin(any())).thenReturn(false);
        when(bizSeqService.next(anyString())).thenReturn("RT202610220001");

        service = new RdmRequirementServiceImpl(
                requirementMapper, mock(RdmRequirementTargetMapper.class),
                mock(RdmRequirementRoleMapper.class), statusLogMapper,
                mock(RdmCommentMapper.class),
                mock(RdmAttachmentMapper.class),
                mock(RdmAcceptanceMapper.class),
                mock(RdmAcceptanceCaseMapper.class),
                userMapper,
                mock(SysDepartmentMapper.class), bizSeqService,
                operatorResolver, configService,
                mock(RdmNotifyService.class), mock(OaRequestService.class),
                mock(RdmIntakeCallbackService.class),
                mock(PermissionService.class), jdbcTemplate, accessGuard,
                taskMapper,
                mock(RdmIntakePolicyService.class),
                mock(RdmIntakeRoundService.class),
                mock(RdmReleaseService.class),
                mock(RdmFlowVersionGuard.class),
                mock(RdmRequirementStructureService.class),
                mock(RdmDeliveryItemService.class),
                mock(RdmAllowedActionsService.class),
                mock(RdmPrdTaskService.class));
    }

    private static SysUser user(long id, String name, String empNo) {
        SysUser user = new SysUser();
        user.setId(id);
        user.setName(name);
        user.setEmpId(empNo);
        user.setDepartmentId(13L);
        user.setDepartment("產品部");
        user.setStatus(1);
        return user;
    }

    private static RdmRequirement requirement(String status, Integer flowVersion) {
        RdmRequirement req = new RdmRequirement();
        req.setId(1L);
        req.setReqNo("XQ202610220001");
        req.setTitle("存量需求");
        req.setStatus(status);
        req.setFlowVersion(flowVersion);
        req.setAcceptTime(LocalDateTime.of(2026, 10, 20, 10, 0));
        req.setAssigneePmUserId(8L);
        req.setAssigneePmName("產品甲");
        req.setAssigneePmEmpNo("MF00008");
        return req;
    }

    private static RdmBatchBackfillAcceptDTO dto(Long... ids) {
        RdmBatchBackfillAcceptDTO dto = new RdmBatchBackfillAcceptDTO();
        dto.setIds(List.of(ids));
        dto.setPromisedPrdDate("2026-11-30");
        dto.setRemark("存量導入補錄");
        return dto;
    }

    @Test
    @DisplayName("無分配權/全量權的普通參與人不能補錄")
    void rejectWithoutDispatchPermission() {
        SysUser current = user(5L, "李四", "MF00005");
        when(operatorResolver.currentUser()).thenReturn(current);
        when(accessGuard.canSeeAll(current)).thenReturn(false);
        when(accessGuard.canDispatch(current)).thenReturn(false);

        BusinessException ex = assertThrows(BusinessException.class, () -> service.batchBackfillAccept(dto(1L)));
        assertEquals("只有需求分配人/管理員可以補錄受理信息", ex.getMessage());
    }

    @Test
    @DisplayName("承諾出 PRD 日期必填")
    void requirePromisedDate() {
        SysUser current = user(1L, "管理員", "MF00001");
        when(operatorResolver.currentUser()).thenReturn(current);
        when(operatorResolver.isAdmin(current)).thenReturn(true);
        RdmBatchBackfillAcceptDTO dto = dto(1L);
        dto.setPromisedPrdDate(null);

        BusinessException ex = assertThrows(BusinessException.class, () -> service.batchBackfillAccept(dto));
        assertEquals("請填寫承諾出 PRD 日期", ex.getMessage());
    }

    @Test
    @DisplayName("非 PRD 階段的狀態逐條跳過，不靜默改寫")
    void skipStatusOutsidePrdPhase() {
        SysUser current = user(1L, "管理員", "MF00001");
        when(operatorResolver.currentUser()).thenReturn(current);
        when(operatorResolver.isAdmin(current)).thenReturn(true);
        when(requirementMapper.selectById(1L)).thenReturn(requirement("developing", 1));

        RdmBatchBackfillVO result = service.batchBackfillAccept(dto(1L));

        assertEquals(0, result.getUpdated());
        assertEquals(1, result.getSkippedStatus());
        verify(taskMapper, never()).insert(any(RdmWorkTask.class));
    }

    @Test
    @DisplayName("V3 分批交付需求不補整需求產品任務")
    void skipV3Requirement() {
        SysUser current = user(1L, "管理員", "MF00001");
        when(operatorResolver.currentUser()).thenReturn(current);
        when(operatorResolver.isAdmin(current)).thenReturn(true);
        when(requirementMapper.selectById(1L)).thenReturn(requirement("accepted", 3));

        RdmBatchBackfillVO result = service.batchBackfillAccept(dto(1L));

        assertEquals(0, result.getUpdated());
        assertEquals(1, result.getSkippedStatus());
        verify(taskMapper, never()).insert(any(RdmWorkTask.class));
    }

    @Test
    @DisplayName("缺產品經理的行跳過並單獨計數，不建空負責人任務")
    void skipWhenNoPm() {
        SysUser current = user(1L, "管理員", "MF00001");
        when(operatorResolver.currentUser()).thenReturn(current);
        when(operatorResolver.isAdmin(current)).thenReturn(true);
        RdmRequirement req = requirement("review_passed", 1);
        req.setAssigneePmUserId(null);
        when(requirementMapper.selectById(1L)).thenReturn(req);

        RdmBatchBackfillVO result = service.batchBackfillAccept(dto(1L));

        assertEquals(0, result.getUpdated());
        assertEquals(1, result.getSkippedNoPm());
        verify(taskMapper, never()).insert(any(RdmWorkTask.class));
    }

    @Test
    @DisplayName("歷史產品經理已離職/停用時跳過，不給停用賬號建任務")
    void skipWhenPmInactive() {
        SysUser current = user(1L, "管理員", "MF00001");
        when(operatorResolver.currentUser()).thenReturn(current);
        when(operatorResolver.isAdmin(current)).thenReturn(true);
        when(requirementMapper.selectById(1L)).thenReturn(requirement("review_passed", 1));
        SysUser inactive = user(8L, "產品甲", "MF00008");
        inactive.setStatus(0);
        when(userMapper.selectById(8L)).thenReturn(inactive);

        RdmBatchBackfillVO result = service.batchBackfillAccept(dto(1L));

        assertEquals(0, result.getUpdated());
        assertEquals(1, result.getSkippedNoPm());
        verify(taskMapper, never()).insert(any(RdmWorkTask.class));
    }

    @Test
    @DisplayName("補錄成功：寫承諾日期、按已完成建 PRD 任務、寫閉合流水")
    void backfillCreatesDonePrdTask() {
        SysUser current = user(1L, "管理員", "MF00001");
        when(operatorResolver.currentUser()).thenReturn(current);
        when(operatorResolver.isAdmin(current)).thenReturn(true);
        when(requirementMapper.selectById(1L)).thenReturn(requirement("review_passed", 1));
        when(userMapper.selectById(8L)).thenReturn(user(8L, "產品甲", "MF00008"));
        when(taskMapper.selectOne(any())).thenReturn(null);

        RdmBatchBackfillVO result = service.batchBackfillAccept(dto(1L));

        assertEquals(1, result.getUpdated());
        verify(jdbcTemplate).update(contains("promised_prd_date"),
                eq(LocalDate.of(2026, 11, 30)), eq("sysadmin(00001)"), eq(1L));
        verify(taskMapper).insert(org.mockito.ArgumentMatchers.argThat((RdmWorkTask task) ->
                "prd".equals(task.getTaskType())
                        && "done".equals(task.getStatus())
                        && Integer.valueOf(100).equals(task.getProgress())
                        && LocalDate.of(2026, 11, 30).equals(task.getPlanFinishDate())
                        && Long.valueOf(8L).equals(task.getOwnerUserId())));
        verify(statusLogMapper).insert(org.mockito.ArgumentMatchers.argThat((RdmStatusLog log) ->
                "backfill_accept".equals(log.getActionCode())
                        && "review_passed".equals(log.getFromStatus())
                        && "review_passed".equals(log.getToStatus())
                        && log.getLeaveTime() != null));
    }

    @Test
    @DisplayName("已有已完成產品任務時只同步承諾日期，不重複建任務")
    void idempotentWhenDoneTaskExists() {
        SysUser current = user(1L, "管理員", "MF00001");
        when(operatorResolver.currentUser()).thenReturn(current);
        when(operatorResolver.isAdmin(current)).thenReturn(true);
        when(requirementMapper.selectById(1L)).thenReturn(requirement("review_passed", 1));
        when(userMapper.selectById(8L)).thenReturn(user(8L, "產品甲", "MF00008"));
        RdmWorkTask done = new RdmWorkTask();
        done.setId(99L);
        done.setStatus("done");
        when(taskMapper.selectOne(any())).thenReturn(done);

        RdmBatchBackfillVO result = service.batchBackfillAccept(dto(1L));

        assertEquals(1, result.getUpdated());
        verify(taskMapper, never()).insert(any(RdmWorkTask.class));
        verify(jdbcTemplate).update(contains("promised_prd_date"),
                eq(LocalDate.of(2026, 11, 30)), eq("sysadmin(00001)"), eq(1L));
    }
}
