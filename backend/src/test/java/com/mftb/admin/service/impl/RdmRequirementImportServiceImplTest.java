package com.mftb.admin.service.impl;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.RdmRequirementImportDTO;
import com.mftb.admin.dto.RdmRequirementImportVO;
import com.mftb.admin.entity.RdmProject;
import com.mftb.admin.entity.RdmRequirement;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.RdmIterationMapper;
import com.mftb.admin.mapper.RdmPrdMapper;
import com.mftb.admin.mapper.RdmProjectMapper;
import com.mftb.admin.mapper.RdmRequirementMapper;
import com.mftb.admin.mapper.RdmRequirementRoleMapper;
import com.mftb.admin.mapper.RdmStatusLogMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.RdmAccessGuard;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * 存量需求导入的准入与预检口径测试。
 *
 * <p>只钉三件最容易回归的事：
 * <ul>
 *   <li>权限与参数闸门必须先于任何写库动作；</li>
 *   <li>云效编号已存在的行只记 skipped，不能重复插入；</li>
 *   <li>任何一行校验失败时整批不落库（导入是「全有或全无」，避免半批对不上账）。</li>
 * </ul>
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("RDM 存量需求导入")
class RdmRequirementImportServiceImplTest {

    @Mock
    private RdmRequirementMapper requirementMapper;
    @Mock
    private RdmPrdMapper prdMapper;
    @Mock
    private RdmStatusLogMapper statusLogMapper;
    @Mock
    private RdmRequirementRoleMapper roleMapper;
    @Mock
    private RdmProjectMapper projectMapper;
    @Mock
    private RdmIterationMapper iterationMapper;
    @Mock
    private SysUserMapper userMapper;
    @Mock
    private BizSeqService bizSeqService;
    @Mock
    private OperatorResolver operatorResolver;
    @Mock
    private RdmAccessGuard accessGuard;
    @Mock
    private JdbcTemplate jdbcTemplate;

    @InjectMocks
    private RdmRequirementImportServiceImpl service;

    private static SysUser operator() {
        SysUser user = new SysUser();
        user.setId(11L);
        user.setEmpId("MF00011");
        user.setName("張三");
        user.setStatus(1);
        return user;
    }

    private static RdmRequirementImportDTO.Row row(String title, String externalNo, String status) {
        RdmRequirementImportDTO.Row row = new RdmRequirementImportDTO.Row();
        row.setRowNo(2);
        row.setTitle(title);
        row.setExternalNo(externalNo);
        row.setStatus(status);
        return row;
    }

    private static RdmRequirementImportDTO dto(RdmRequirementImportDTO.Row... rows) {
        RdmRequirementImportDTO dto = new RdmRequirementImportDTO();
        dto.setRows(List.of(rows));
        return dto;
    }

    @Test
    @DisplayName("未登录时直接拒绝")
    void rejectsAnonymous() {
        when(operatorResolver.currentUser()).thenReturn(null);

        BusinessException ex = assertThrows(BusinessException.class, () -> service.importRequirements(dto()));
        assertTrue(ex.getMessage().contains("登錄狀態失效"));
    }

    @Test
    @DisplayName("无全量可见权限时拒绝批量写入")
    void rejectsWithoutSeeAll() {
        SysUser user = operator();
        when(operatorResolver.currentUser()).thenReturn(user);
        when(accessGuard.canSeeAll(user)).thenReturn(false);

        BusinessException ex = assertThrows(BusinessException.class, () -> service.importRequirements(dto()));
        assertTrue(ex.getMessage().contains("權限"));
    }

    @Test
    @DisplayName("空列表按参数错误拒绝，不进入逐行校验")
    void rejectsEmptyRows() {
        SysUser user = operator();
        when(operatorResolver.currentUser()).thenReturn(user);
        when(accessGuard.canSeeAll(user)).thenReturn(true);

        BusinessException ex = assertThrows(BusinessException.class, () -> service.importRequirements(dto()));
        assertTrue(ex.getMessage().contains("至少填寫一行"));
    }

    @Test
    @DisplayName("云效编号已存在的行只记 skipped，不重复插入")
    void skipsExistingExternalNo() {
        SysUser user = operator();
        when(operatorResolver.currentUser()).thenReturn(user);
        when(accessGuard.canSeeAll(user)).thenReturn(true);
        when(jdbcTemplate.queryForList(contains("rdm_status_def"), eq(String.class)))
                .thenReturn(List.of("developing"));
        when(jdbcTemplate.queryForList(contains("external_no IN"), eq(String.class), any(Object[].class)))
                .thenReturn(List.of("STORY-1"));

        RdmRequirementImportVO result = service.importRequirements(
                dto(row("已導入過的需求", "STORY-1", "developing")));

        assertEquals(1, result.getSkipped());
        assertEquals(0, result.getImported());
        assertEquals(0, result.getFailed());
        verifyNoInteractions(requirementMapper, prdMapper, roleMapper, statusLogMapper);
    }

    @Test
    @DisplayName("有效行写入需求、角色、状态流水与 PRD")
    void importsValidRow() {
        SysUser user = operator();
        when(operatorResolver.currentUser()).thenReturn(user);
        when(accessGuard.canSeeAll(user)).thenReturn(true);
        when(operatorResolver.operatorSignature(user)).thenReturn("MF00011|張三");
        when(jdbcTemplate.queryForList(contains("rdm_status_def"), eq(String.class)))
                .thenReturn(List.of("developing"));
        when(jdbcTemplate.queryForList(contains("external_no IN"), eq(String.class), any(Object[].class)))
                .thenReturn(List.of());
        when(bizSeqService.next("rdm_requirement")).thenReturn("XQ202610220001");
        when(bizSeqService.next("rdm_prd")).thenReturn("PRD202610220001");

        RdmRequirementImportVO result = service.importRequirements(
                dto(row("有效需求", "STORY-99", "developing")));

        assertEquals(1, result.getImported());
        assertEquals("XQ202610220001", result.getItems().get(0).getReqNo());

        ArgumentCaptor<RdmRequirement> captor = ArgumentCaptor.forClass(RdmRequirement.class);
        verify(requirementMapper).insert(captor.capture());
        RdmRequirement saved = captor.getValue();
        // 外部编号只进 external_no，正式号由服务端发号
        assertEquals("STORY-99", saved.getExternalNo());
        assertEquals("YUNXIAO", saved.getExternalSource());
        // 历史记录口径：V1 + 免审，不能被新链路闸门卡住
        assertEquals(1, saved.getFlowVersion());
        assertEquals(0, saved.getNeedApproval());
        assertEquals("developing", saved.getStatus());
        assertEquals(50, saved.getProgress());
        assertEquals(user.getId(), saved.getSubmitterUserId());

        verify(roleMapper, org.mockito.Mockito.times(1)).insert(any(com.mftb.admin.entity.RdmRequirementRole.class));
        verify(statusLogMapper).insert(any(com.mftb.admin.entity.RdmStatusLog.class));
        verify(prdMapper).insert(any(com.mftb.admin.entity.RdmPrd.class));
    }

    @Test
    @DisplayName("项目填编号、人员填工号也能匹配（业务模板常见填法）")
    void resolvesProjectByNoAndUsersByEmpId() {
        SysUser user = operator();
        when(operatorResolver.currentUser()).thenReturn(user);
        when(accessGuard.canSeeAll(user)).thenReturn(true);
        when(operatorResolver.operatorSignature(user)).thenReturn("MF00011|張三");
        when(jdbcTemplate.queryForList(contains("rdm_status_def"), eq(String.class)))
                .thenReturn(List.of("evaluating"));
        when(jdbcTemplate.queryForList(contains("external_no IN"), eq(String.class), any(Object[].class)))
                .thenReturn(List.of());

        RdmProject project = new RdmProject();
        project.setId(88L);
        project.setProjectNo("PROJ2026102201");
        project.setName("云效导入项目");
        when(projectMapper.selectList(any())).thenReturn(List.of(project));

        SysUser projectManager = new SysUser();
        projectManager.setId(21L);
        projectManager.setEmpId("MF00006");
        projectManager.setName("古月");
        projectManager.setStatus(1);
        SysUser productManager = new SysUser();
        productManager.setId(22L);
        productManager.setEmpId("MF00002");
        productManager.setName("冯松");
        productManager.setStatus(1);
        // 纯工号匹配路径：先按姓名查无结果，再按工号命中
        when(userMapper.selectList(any())).thenReturn(
                List.of(), List.of(projectManager),
                List.of(), List.of(productManager));

        RdmRequirementImportDTO.Row row = row("无敌星星算法库配置", "MFTB-2327", "evaluating");
        row.setProjectName("PROJ2026102201");
        row.setProjectManager("MF00006");
        row.setProductManager("MF00002");
        when(bizSeqService.next("rdm_requirement")).thenReturn("XQ202610220001");
        when(bizSeqService.next("rdm_prd")).thenReturn("PRD202610220001");

        RdmRequirementImportVO result = service.importRequirements(dto(row));

        assertEquals(1, result.getImported());
        ArgumentCaptor<RdmRequirement> captor = ArgumentCaptor.forClass(RdmRequirement.class);
        verify(requirementMapper).insert(captor.capture());
        RdmRequirement saved = captor.getValue();
        assertEquals(88L, saved.getProjectId());
        assertEquals(21L, saved.getProjectManagerUserId());
        assertEquals(22L, saved.getAssigneePmUserId());
        // 当前处理人快照与主流程同口径：带工号，列表回退展示时不会只剩姓名
        assertEquals("冯松（MF00002）", saved.getCurrentHandlerName());
    }

    @Test
    @DisplayName("云效编号非必填：留空可导入，落库为 NULL 不撞唯一索引")
    void importsWithoutExternalNo() {
        SysUser user = operator();
        when(operatorResolver.currentUser()).thenReturn(user);
        when(accessGuard.canSeeAll(user)).thenReturn(true);
        when(operatorResolver.operatorSignature(user)).thenReturn("MF00011|張三");
        when(jdbcTemplate.queryForList(contains("rdm_status_def"), eq(String.class)))
                .thenReturn(List.of("developing"));
        when(bizSeqService.next("rdm_requirement")).thenReturn("XQ202610220002");
        when(bizSeqService.next("rdm_prd")).thenReturn("PRD202610220002");

        RdmRequirementImportVO result = service.importRequirements(
                dto(row("非雲效來源需求", null, "developing")));

        assertEquals(1, result.getImported());
        ArgumentCaptor<RdmRequirement> captor = ArgumentCaptor.forClass(RdmRequirement.class);
        verify(requirementMapper).insert(captor.capture());
        RdmRequirement saved = captor.getValue();
        // 空串会与 (external_source, external_no) 唯一索引冲突，必须落 NULL
        assertNull(saved.getExternalNo());
        assertNull(saved.getExternalSource());
    }

    @Test
    @DisplayName("同批重复的项目与人员只回查一次（导入性能）")
    void reusesLookupsWithinBatch() {
        SysUser user = operator();
        when(operatorResolver.currentUser()).thenReturn(user);
        when(accessGuard.canSeeAll(user)).thenReturn(true);
        when(operatorResolver.operatorSignature(user)).thenReturn("MF00011|張三");
        when(jdbcTemplate.queryForList(contains("rdm_status_def"), eq(String.class)))
                .thenReturn(List.of("developing"));
        when(jdbcTemplate.queryForList(contains("external_no IN"), eq(String.class), any(Object[].class)))
                .thenReturn(List.of());

        RdmProject project = new RdmProject();
        project.setId(88L);
        project.setProjectNo("PROJ2026102201");
        project.setName("云效导入项目");
        when(projectMapper.selectList(any())).thenReturn(List.of(project));

        SysUser projectManager = new SysUser();
        projectManager.setId(21L);
        projectManager.setEmpId("MF00006");
        projectManager.setName("古月");
        projectManager.setStatus(1);
        SysUser productManager = new SysUser();
        productManager.setId(22L);
        productManager.setEmpId("MF00002");
        productManager.setName("冯松");
        productManager.setStatus(1);
        // 两行填同项目、同经理：工号匹配各只查一次（姓名 miss + 工号命中），不该按行重复回查
        when(userMapper.selectList(any())).thenReturn(
                List.of(), List.of(projectManager),
                List.of(), List.of(productManager));

        RdmRequirementImportDTO.Row first = row("需求一", "MFTB-1", "developing");
        first.setProjectName("PROJ2026102201");
        first.setProjectManager("MF00006");
        first.setProductManager("MF00002");
        RdmRequirementImportDTO.Row second = row("需求二", "MFTB-2", "developing");
        second.setProjectName("PROJ2026102201");
        second.setProjectManager("MF00006");
        second.setProductManager("MF00002");
        when(bizSeqService.next("rdm_requirement")).thenReturn("XQ202610220001");
        when(bizSeqService.next("rdm_prd")).thenReturn("PRD202610220001");

        RdmRequirementImportVO result = service.importRequirements(dto(first, second));

        assertEquals(2, result.getImported());
        verify(projectMapper, org.mockito.Mockito.times(1)).selectList(any());
        verify(userMapper, org.mockito.Mockito.times(4)).selectList(any());
    }

    @Test
    @DisplayName("状态不在启用字典内时整批不写库")
    void rejectsUnknownStatusWithoutWriting() {
        SysUser user = operator();
        when(operatorResolver.currentUser()).thenReturn(user);
        when(accessGuard.canSeeAll(user)).thenReturn(true);
        when(jdbcTemplate.queryForList(contains("rdm_status_def"), eq(String.class)))
                .thenReturn(List.of("developing"));
        when(jdbcTemplate.queryForList(contains("external_no IN"), eq(String.class), any(Object[].class)))
                .thenReturn(List.of());

        RdmRequirementImportVO result = service.importRequirements(
                dto(row("狀態非法", "STORY-2", "not_a_status")));

        assertEquals(1, result.getFailed());
        assertEquals(0, result.getImported());
        assertTrue(result.getItems().get(0).getMessage().contains("不在啟用中的狀態字典內"));
        verifyNoInteractions(requirementMapper, prdMapper, roleMapper, statusLogMapper);
        verify(bizSeqService, never()).next(anyString());
        verify(requirementMapper, never()).selectById(anyLong());
    }
}
