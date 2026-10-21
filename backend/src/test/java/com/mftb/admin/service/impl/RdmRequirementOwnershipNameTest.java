package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.RdmRequirementQuery;
import com.mftb.admin.dto.RdmRequirementVO;
import com.mftb.admin.entity.RdmRequirement;
import com.mftb.admin.entity.RdmWorkTask;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.RdmAcceptanceCaseMapper;
import com.mftb.admin.mapper.RdmAcceptanceMapper;
import com.mftb.admin.mapper.RdmAttachmentMapper;
import com.mftb.admin.mapper.RdmCommentMapper;
import com.mftb.admin.mapper.RdmDeliveryItemMapper;
import com.mftb.admin.mapper.RdmProjectMemberMapper;
import com.mftb.admin.mapper.RdmReleaseBatchMapper;
import com.mftb.admin.mapper.RdmRequirementMapper;
import com.mftb.admin.mapper.RdmRequirementRoleMapper;
import com.mftb.admin.mapper.RdmRequirementTargetMapper;
import com.mftb.admin.mapper.RdmStatusLogMapper;
import com.mftb.admin.mapper.RdmTestBatchMapper;
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
import com.mftb.admin.service.RdmReleaseService;
import com.mftb.admin.service.RdmRequirementStructureService;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.OperatorResolver;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * 需求归属名称回填测试（第二阶段：服务端下发 projectName / iterationName）。
 * <p>钉住三条口径：
 * <ol>
 *   <li>列表行必须带上项目名与迭代名 —— 前端类型里有字段不等于后端真的有供数；</li>
 *   <li>同一维度只查一次（IN 批量），不能逐行回查成 N+1；</li>
 *   <li>查不到的迭代（已删除/编码过期）保持 null，由前端回退显示编码，不伪造名称。</li>
 * </ol>
 */
class RdmRequirementOwnershipNameTest {

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
                roleMapper, mock(RdmProjectMemberMapper.class), mock(com.mftb.admin.mapper.RdmProjectMapper.class),
                mock(RdmDeliveryItemMapper.class),
                mock(RdmTestBatchMapper.class), mock(RdmReleaseBatchMapper.class));
        service = new RdmRequirementServiceImpl(
                requirementMapper, mock(RdmRequirementTargetMapper.class),
                roleMapper, mock(RdmStatusLogMapper.class),
                mock(RdmCommentMapper.class),
                mock(RdmAttachmentMapper.class),
                mock(RdmAcceptanceMapper.class),
                mock(RdmAcceptanceCaseMapper.class),
                mock(SysUserMapper.class),
                mock(SysDepartmentMapper.class), mock(BizSeqService.class),
                operatorResolver, configService,
                mock(RdmNotifyService.class), mock(OaRequestService.class),
                mock(RdmIntakeCallbackService.class),
                permissionService, jdbcTemplate, accessGuard,
                mock(RdmWorkTaskMapper.class),
                mock(RdmIntakePolicyService.class),
                mock(RdmIntakeRoundService.class),
                mock(RdmReleaseService.class),
                mock(RdmFlowVersionGuard.class),
                mock(RdmRequirementStructureService.class),
                mock(RdmDeliveryItemService.class),
                mock(RdmAllowedActionsService.class));
        when(configService.stageMap()).thenReturn(Map.of());
        // 纯单测无 MyBatis 容器：LambdaQueryWrapper 需要实体 TableInfo 才能把方法引用映射成列
        MapperBuilderAssistant assistant = new MapperBuilderAssistant(new MybatisConfiguration(), "");
        TableInfoHelper.initTableInfo(assistant, RdmRequirement.class);
        TableInfoHelper.initTableInfo(assistant, RdmWorkTask.class);
    }

    private static RdmRequirementVO vo(Long projectId, String iterationCode) {
        RdmRequirementVO v = new RdmRequirementVO();
        v.setProjectId(projectId);
        v.setIterationCode(iterationCode);
        return v;
    }

    private static RdmRequirement req(long id) {
        RdmRequirement r = new RdmRequirement();
        r.setId(id);
        r.setReqNo("XQ202610210001");
        r.setTitle("測試需求");
        r.setStatus(RdmConstants.STATUS_ASSIGNED);
        r.setProjectId(11L);
        r.setIterationCode("SP202610001");
        return r;
    }

    /** 归属名称查库桩：项目两行、迭代一行，模拟同名的同类归属去重后一次 IN */
    private void stubNames() {
        Map<String, Object> portal = new HashMap<>();
        portal.put("id", 11L);
        portal.put("name", "門戶改版");
        Map<String, Object> billing = new HashMap<>();
        billing.put("id", 12L);
        billing.put("name", "結算重構");
        when(jdbcTemplate.queryForList(contains("FROM rdm_project"), any(Object[].class)))
                .thenReturn(List.of(portal, billing));
        Map<String, Object> iteration = new HashMap<>();
        iteration.put("code", "SP202610001");
        iteration.put("name", "B1迭代");
        when(jdbcTemplate.queryForList(contains("FROM rdm_iteration"), any(Object[].class)))
                .thenReturn(List.of(iteration));
    }

    @Test
    @DisplayName("批量回填项目名与迭代名，缺失的一侧保持 null")
    void fillsOwnershipNames() {
        stubNames();
        RdmRequirementVO both = vo(11L, "SP202610001");
        RdmRequirementVO projectOnly = vo(12L, null);
        RdmRequirementVO unknownIteration = vo(null, "SP999999999");
        RdmRequirementVO none = vo(null, null);

        service.fillOwnershipNames(List.of(both, projectOnly, unknownIteration, none));

        assertEquals("門戶改版", both.getProjectName());
        assertEquals("B1迭代", both.getIterationName());
        assertEquals("結算重構", projectOnly.getProjectName());
        assertNull(projectOnly.getIterationName());
        // 迭代查不到（已删除/编码过期）不伪造名称：前端据此回退显示编码
        assertNull(unknownIteration.getIterationName());
        assertNull(none.getProjectName());
        assertNull(none.getIterationName());
    }

    @Test
    @DisplayName("同一维度只查一次，不随行数退化成 N+1")
    void queriesOncePerDimension() {
        stubNames();
        service.fillOwnershipNames(List.of(
                vo(11L, "SP202610001"), vo(12L, "SP202610001"), vo(11L, "SP202610001")));

        verify(jdbcTemplate, times(1)).queryForList(contains("FROM rdm_project"), any(Object[].class));
        verify(jdbcTemplate, times(1)).queryForList(contains("FROM rdm_iteration"), any(Object[].class));
    }

    @Test
    @DisplayName("空集合不查库")
    void skipsEmpty() {
        service.fillOwnershipNames(List.of());

        verifyNoInteractions(jdbcTemplate);
    }

    @Test
    @DisplayName("列表 page() 真的带出归属名称，而不是只声明在前端类型里")
    void pageFillsOwnershipNames() {
        stubNames();
        SysUser current = new SysUser();
        current.setId(1L);
        current.setName("測試人");
        when(operatorResolver.currentUser()).thenReturn(current);
        Page<RdmRequirement> page = new Page<>(1, 10);
        page.setRecords(List.of(req(7L)));
        page.setTotal(1);
        when(requirementMapper.selectPage(any(Page.class), any())).thenReturn(page);

        RdmRequirementQuery query = new RdmRequirementQuery();
        query.setScope(RdmConstants.SCOPE_MINE);
        PageResult<RdmRequirementVO> result = service.page(query);

        assertEquals(1, result.getRecords().size());
        assertEquals("門戶改版", result.getRecords().get(0).getProjectName());
        assertEquals("B1迭代", result.getRecords().get(0).getIterationName());
    }
}
