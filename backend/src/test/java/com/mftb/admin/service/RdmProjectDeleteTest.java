package com.mftb.admin.service;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.entity.RdmProject;
import com.mftb.admin.mapper.RdmProjectMapper;
import com.mftb.admin.mapper.RdmProjectMemberMapper;
import com.mftb.admin.mapper.RdmRequirementMapper;
import com.mftb.admin.mapper.RdmWorkTaskMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 项目删除（空壳项目清理）回归。
 *
 * <p>钉住三条边界：
 * <ol>
 *   <li>项目下（含挂在该项目迭代上的）需求一条都不能有，否则拒绝且不动任何表；</li>
 *   <li>通过校验后，未挂需求的迭代一并逻辑删除，成员行与项目行清理；</li>
 *   <li>项目不存在时直接拒绝，不做「删了也没报错」的空转。</li>
 * </ol>
 */
class RdmProjectDeleteTest {

    private RdmProjectMapper projectMapper;
    private RdmProjectMemberMapper memberMapper;
    private JdbcTemplate jdbcTemplate;
    private RdmAccessGuard accessGuard;
    private RdmProjectService service;

    @BeforeEach
    void setUp() {
        projectMapper = mock(RdmProjectMapper.class);
        memberMapper = mock(RdmProjectMemberMapper.class);
        jdbcTemplate = mock(JdbcTemplate.class);
        accessGuard = mock(RdmAccessGuard.class);
        OperatorResolver operatorResolver = mock(OperatorResolver.class);
        service = new RdmProjectService(
                projectMapper,
                memberMapper,
                jdbcTemplate,
                mock(RdmRequirementMapper.class),
                mock(RdmWorkTaskMapper.class),
                mock(SysUserMapper.class),
                mock(BizSeqService.class),
                accessGuard,
                mock(RdmProjectFactService.class),
                mock(RdmWorkingDayCalculator.class),
                operatorResolver);

        RdmProject project = new RdmProject();
        project.setId(1L);
        project.setProjectNo("PROJ2026102001");
        project.setName("空殼項目");
        when(projectMapper.selectById(1L)).thenReturn(project);
    }

    @Test
    @DisplayName("項目下仍有需求時拒絕刪除，且不刪任何表")
    void rejectsWhenRequirementsExist() {
        when(jdbcTemplate.queryForObject(contains("FROM rdm_requirement"), eq(Integer.class), any(), any()))
                .thenReturn(2);

        BusinessException ex = assertThrows(BusinessException.class, () -> service.deleteProject(1L, 99L));
        assertTrue(ex.getMessage().contains("2 條需求"), ex.getMessage());
        verify(projectMapper, never()).deleteById(anyLong());
        verify(memberMapper, never()).delete(any());
    }

    @Test
    @DisplayName("空殼項目可刪：級聯邏輯刪除未掛需求的迭代，並清理成員與項目行")
    void deletesEmptyProjectAndCascadesIterations() {
        when(jdbcTemplate.queryForObject(contains("FROM rdm_requirement"), eq(Integer.class), any(), any()))
                .thenReturn(0);
        when(jdbcTemplate.update(contains("UPDATE rdm_iteration"), any(), eq(1L))).thenReturn(3);

        service.deleteProject(1L, 99L);

        // 资源归属守卫与菜单动作是两道独立闸门，服务层必须自行再校验成员资格
        verify(accessGuard).requireProjectMember(1L, 99L);
        verify(jdbcTemplate).update(contains("UPDATE rdm_iteration"), any(), eq(1L));
        verify(memberMapper).delete(any());
        verify(projectMapper).deleteById(1L);
    }

    @Test
    @DisplayName("項目不存在時拒絕，不執行任何刪除")
    void rejectsMissingProject() {
        assertThrows(BusinessException.class, () -> service.deleteProject(404L, 99L));
        verify(projectMapper, never()).deleteById(anyLong());
    }
}
