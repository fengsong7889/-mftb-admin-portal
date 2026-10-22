package com.mftb.admin.service.impl;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.RdmTransitionDTO;
import com.mftb.admin.entity.RdmRequirement;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.RdmRequirementMapper;
import com.mftb.admin.mapper.RdmRequirementRoleMapper;
import com.mftb.admin.mapper.RdmRequirementTargetMapper;
import com.mftb.admin.mapper.RdmStatusLogMapper;
import com.mftb.admin.mapper.SysDepartmentMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.OaRequestService;
import com.mftb.admin.service.PermissionService;
import com.mftb.admin.service.RdmAccessGuard;
import com.mftb.admin.service.RdmConfigService;
import com.mftb.admin.service.RdmNotifyService;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * RDM 归属体系改造测试（项目—迭代—需求—任务归属链）。
 * <p>钉住四条口径：
 * <ol>
 *   <li>排期硬闸门：进入研发执行前必须挂项目+迭代（required=true）；</li>
 *   <li>迭代项目单一真值源：迭代有项目时以迭代为准回写需求，冲突即拒；</li>
 *   <li>hotfix 例外：无项目的紧急修复迭代须由调用方显式指定项目归属；</li>
 *   <li>调整迭代：状态白名单（released 后拒绝）+ 未完成任务同步换迭代。</li>
 * </ol>
 */
class RdmIterationOwnershipTest {

    private static final String ITERATION_SQL =
            "SELECT project_id, status FROM rdm_iteration WHERE deleted = 0 AND code = ?";
    private static final String PROJECT_COUNT_SQL =
            // rdm_project 建表即无 deleted 列（Batch 1），存在性判断只按主键
            "SELECT COUNT(*) FROM rdm_project WHERE id = ?";

    private OperatorResolver operatorResolver;
    private PermissionService permissionService;
    private RdmRequirementMapper requirementMapper;
    private RdmConfigService configService;
    private JdbcTemplate jdbcTemplate;
    private RdmRequirementServiceImpl service;

    @BeforeEach
    void setUp() {
        operatorResolver = mock(OperatorResolver.class);
        permissionService = mock(PermissionService.class);
        requirementMapper = mock(RdmRequirementMapper.class);
        configService = mock(RdmConfigService.class);
        jdbcTemplate = mock(JdbcTemplate.class);
        RdmRequirementRoleMapper roleMapper = mock(RdmRequirementRoleMapper.class);
        when(roleMapper.selectCount(any())).thenReturn(0L);
        RdmAccessGuard accessGuard = new RdmAccessGuard(operatorResolver, permissionService, requirementMapper,
                roleMapper,
                mock(com.mftb.admin.mapper.RdmProjectMemberMapper.class),
                mock(com.mftb.admin.mapper.RdmProjectMapper.class),
                mock(com.mftb.admin.mapper.RdmDeliveryItemMapper.class),
                mock(com.mftb.admin.mapper.RdmTestBatchMapper.class),
                mock(com.mftb.admin.mapper.RdmReleaseBatchMapper.class));
        service = new RdmRequirementServiceImpl(
                requirementMapper, mock(RdmRequirementTargetMapper.class),
                roleMapper, mock(RdmStatusLogMapper.class),
                mock(com.mftb.admin.mapper.RdmCommentMapper.class),
                mock(com.mftb.admin.mapper.RdmAttachmentMapper.class),
                mock(com.mftb.admin.mapper.RdmAcceptanceMapper.class),
                mock(com.mftb.admin.mapper.RdmAcceptanceCaseMapper.class),
                mock(SysUserMapper.class),
                mock(SysDepartmentMapper.class), mock(BizSeqService.class),
                operatorResolver, configService,
                mock(RdmNotifyService.class), mock(OaRequestService.class),
                mock(com.mftb.admin.service.RdmIntakeCallbackService.class),
                permissionService, jdbcTemplate, accessGuard,
                mock(com.mftb.admin.mapper.RdmWorkTaskMapper.class),
                mock(com.mftb.admin.service.RdmIntakePolicyService.class),
                mock(com.mftb.admin.service.RdmIntakeRoundService.class),
                mock(com.mftb.admin.service.RdmReleaseService.class),
                mock(com.mftb.admin.service.RdmFlowVersionGuard.class),
                mock(com.mftb.admin.service.RdmRequirementStructureService.class),
                mock(com.mftb.admin.service.RdmDeliveryItemService.class),
                mock(com.mftb.admin.service.RdmAllowedActionsService.class),
                mock(com.mftb.admin.service.RdmPrdTaskService.class));
        when(configService.stageMap()).thenReturn(Map.of());
    }

    private static SysUser user(long id, String name) {
        SysUser u = new SysUser();
        u.setId(id);
        u.setEmpId("MF0000" + id);
        u.setName(name);
        return u;
    }

    private static RdmRequirement req(long id, String status) {
        RdmRequirement r = new RdmRequirement();
        r.setId(id);
        r.setReqNo("XQ202610190001");
        r.setTitle("測試需求");
        r.setStatus(status);
        return r;
    }

    /** 迭代查库桩：project_id 可为 null（hotfix 未挂项目），故用 HashMap 而非 Map.of */
    private void stubIteration(Long projectId, String status) {
        Map<String, Object> row = new HashMap<>();
        row.put("project_id", projectId);
        row.put("status", status);
        when(jdbcTemplate.queryForList(eq(ITERATION_SQL), anyString())).thenReturn(List.of(row));
    }

    private void stubIterationMissing() {
        when(jdbcTemplate.queryForList(eq(ITERATION_SQL), anyString())).thenReturn(List.of());
    }

    private void stubProjectExists() {
        when(jdbcTemplate.queryForObject(eq(PROJECT_COUNT_SQL), eq(Integer.class), any())).thenReturn(1);
    }

    /* ==================== 排期硬闸门（applyProjectAndIteration required=true） ==================== */

    @Test
    @DisplayName("排期闸门：项目与迭代都缺时拒绝")
    void scheduleRequiresProjectAndIteration() {
        RdmRequirement r = req(1L, RdmConstants.STATUS_REVIEW_PASSED);
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.applyProjectAndIteration(r, new RdmTransitionDTO(), true));
        assertTrue(ex.getMessage().contains("提交排期必須選擇所屬項目與迭代"), ex.getMessage());
        assertNull(r.getIterationCode());
        assertNull(r.getProjectId());
    }

    @Test
    @DisplayName("排期闸门：迭代有项目时以迭代为准回写需求项目（单一真值源）")
    void scheduleDerivesProjectFromIteration() {
        RdmRequirement r = req(1L, RdmConstants.STATUS_REVIEW_PASSED);
        stubIteration(9L, "active");
        stubProjectExists();
        RdmTransitionDTO dto = new RdmTransitionDTO();
        dto.setIterationCode("SP202610002");
        service.applyProjectAndIteration(r, dto, true);
        assertEquals("SP202610002", r.getIterationCode());
        assertEquals(9L, r.getProjectId());
    }

    @Test
    @DisplayName("排期闸门：所选项目与迭代项目不一致时拒绝（防归属分裂）")
    void scheduleRejectsProjectIterationMismatch() {
        RdmRequirement r = req(1L, RdmConstants.STATUS_REVIEW_PASSED);
        stubIteration(9L, "active");
        RdmTransitionDTO dto = new RdmTransitionDTO();
        dto.setIterationCode("SP202610002");
        dto.setProjectId(8L);
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.applyProjectAndIteration(r, dto, true));
        assertTrue(ex.getMessage().contains("該迭代不屬於所選項目"), ex.getMessage());
    }

    @Test
    @DisplayName("排期闸门：已关闭迭代不能排入")
    void scheduleRejectsClosedIteration() {
        RdmRequirement r = req(1L, RdmConstants.STATUS_REVIEW_PASSED);
        stubIteration(9L, "closed");
        RdmTransitionDTO dto = new RdmTransitionDTO();
        dto.setIterationCode("SP202609001");
        dto.setProjectId(9L);
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.applyProjectAndIteration(r, dto, true));
        assertTrue(ex.getMessage().contains("迭代已關閉"), ex.getMessage());
    }

    @Test
    @DisplayName("排期闸门：迭代不存在时拒绝（不信任前端传值）")
    void scheduleRejectsUnknownIteration() {
        RdmRequirement r = req(1L, RdmConstants.STATUS_REVIEW_PASSED);
        stubIterationMissing();
        RdmTransitionDTO dto = new RdmTransitionDTO();
        dto.setIterationCode("SP999999999");
        dto.setProjectId(9L);
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.applyProjectAndIteration(r, dto, true));
        assertTrue(ex.getMessage().contains("迭代不存在"), ex.getMessage());
    }

    @Test
    @DisplayName("排期闸门：项目不存在时拒绝")
    void scheduleRejectsUnknownProject() {
        RdmRequirement r = req(1L, RdmConstants.STATUS_REVIEW_PASSED);
        when(jdbcTemplate.queryForObject(eq(PROJECT_COUNT_SQL), eq(Integer.class), any())).thenReturn(0);
        RdmTransitionDTO dto = new RdmTransitionDTO();
        dto.setProjectId(404L);
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.applyProjectAndIteration(r, dto, true));
        assertTrue(ex.getMessage().contains("所屬項目不存在"), ex.getMessage());
    }

    @Test
    @DisplayName("hotfix 例外：无项目迭代须由调用方显式指定项目，否则排期闸门拒绝")
    void hotfixIterationStillRequiresProjectAtSchedule() {
        RdmRequirement r = req(1L, RdmConstants.STATUS_REVIEW_PASSED);
        stubIteration(null, "active");
        RdmTransitionDTO dto = new RdmTransitionDTO();
        dto.setIterationCode("HF2026101901");
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.applyProjectAndIteration(r, dto, true));
        assertTrue(ex.getMessage().contains("提交排期必須選擇所屬項目"), ex.getMessage());

        // 显式给了项目则放行，迭代照挂
        stubProjectExists();
        RdmRequirement r2 = req(2L, RdmConstants.STATUS_REVIEW_PASSED);
        RdmTransitionDTO dto2 = new RdmTransitionDTO();
        dto2.setIterationCode("HF2026101901");
        dto2.setProjectId(7L);
        service.applyProjectAndIteration(r2, dto2, true);
        assertEquals("HF2026101901", r2.getIterationCode());
        assertEquals(7L, r2.getProjectId());
    }

    @Test
    @DisplayName("选填模式（dispatch/accept）：什么都不给时不动需求，也不报错")
    void optionalModeNoopWhenNothingGiven() {
        RdmRequirement r = req(1L, RdmConstants.STATUS_POOL);
        r.setProjectId(3L);
        r.setIterationCode("SP202610001");
        service.applyProjectAndIteration(r, new RdmTransitionDTO(), false);
        assertEquals(3L, r.getProjectId());
        assertEquals("SP202610001", r.getIterationCode());
        verify(jdbcTemplate, never()).queryForList(eq(ITERATION_SQL), anyString());
    }

    /* ==================== 调整迭代（changeIteration） ==================== */

    @Test
    @DisplayName("调整迭代：已上线需求拒绝（须先重新打开）")
    void changeIterationRejectsReleased() {
        SysUser admin = user(1L, "管理員");
        when(operatorResolver.currentUser()).thenReturn(admin);
        when(operatorResolver.isAdmin(admin)).thenReturn(true);
        RdmRequirement r = req(1L, RdmConstants.STATUS_RELEASED);
        when(requirementMapper.selectById(1L)).thenReturn(r);
        RdmTransitionDTO dto = new RdmTransitionDTO();
        dto.setIterationCode("SP202610002");
        BusinessException ex = assertThrows(BusinessException.class, () -> service.changeIteration(1L, dto));
        assertTrue(ex.getMessage().contains("不允許調整迭代"), ex.getMessage());
    }

    @Test
    @DisplayName("调整迭代：成功后同步未完成任务的迭代归属")
    void changeIterationSyncsOpenTasks() {
        SysUser admin = user(1L, "管理員");
        when(operatorResolver.currentUser()).thenReturn(admin);
        when(operatorResolver.isAdmin(admin)).thenReturn(true);
        when(operatorResolver.operatorSignature(any())).thenReturn("管理員");
        RdmRequirement r = req(1L, RdmConstants.STATUS_DEVELOPING);
        r.setIterationCode("SP202610001");
        when(requirementMapper.selectById(1L)).thenReturn(r);
        stubIteration(9L, "active");
        stubProjectExists();
        when(jdbcTemplate.update(contains("UPDATE rdm_work_task"), any(), any(), any())).thenReturn(2);

        RdmTransitionDTO dto = new RdmTransitionDTO();
        dto.setIterationCode("SP202610002");
        service.changeIteration(1L, dto);

        assertEquals("SP202610002", r.getIterationCode());
        assertEquals(9L, r.getProjectId());
        verify(requirementMapper).updateById(r);
        // 任务同步必须发生：需求迭代与任务迭代同源，否则按迭代统计分裂
        verify(jdbcTemplate).update(contains("UPDATE rdm_work_task"),
                eq("SP202610002"), eq("管理員"), eq(1L));
    }

    @Test
    @DisplayName("调整迭代：目标迭代与当前一致且未换项目时拒绝（无意义操作）")
    void changeIterationRejectsNoop() {
        SysUser admin = user(1L, "管理員");
        when(operatorResolver.currentUser()).thenReturn(admin);
        when(operatorResolver.isAdmin(admin)).thenReturn(true);
        RdmRequirement r = req(1L, RdmConstants.STATUS_DEVELOPING);
        r.setIterationCode("SP202610001");
        when(requirementMapper.selectById(1L)).thenReturn(r);
        RdmTransitionDTO dto = new RdmTransitionDTO();
        dto.setIterationCode("SP202610001");
        BusinessException ex = assertThrows(BusinessException.class, () -> service.changeIteration(1L, dto));
        assertTrue(ex.getMessage().contains("無需調整"), ex.getMessage());
    }
}
