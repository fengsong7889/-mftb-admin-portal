package com.mftb.admin.service;

import com.mftb.admin.dto.RdmProjectDTO;
import com.mftb.admin.entity.RdmProject;
import com.mftb.admin.entity.RdmProjectMember;
import com.mftb.admin.entity.SysUser;
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
import org.mockito.ArgumentCaptor;

import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 項目負責人写入语义单测（清空 / 不误清 / 最后更新人）。
 *
 * <p>这一组的失败模式全都是<b>静默的</b>：清空不生效时接口照样返回成功，只是库里旧值还在；
 * 局部更新误清负责人时也没有报错，只是把人洗没了。肉眼看不出，只能靠断言钉住。
 *
 * <p>两条必须同时成立才叫「支持清空」，缺一侧都会回到清不掉的老路：
 * <ol>
 *   <li>服务层以「userName 非 null」为提供哨兵（而不是 {@code pmUserId != null} 的 null-skip
 *       —— 清空时 ID 本来就是 null，null-skip 会直接跳过，永远清不掉）；</li>
 *   <li>实体列标了 {@code updateStrategy = ALWAYS}（MyBatis-Plus 默认 NOT_NULL 会把 null
 *       从 SET 子句剔除，服务层置空也写不进库）。本类断言的是第 1 条落进实体的值，
 *       第 2 条由 {@code RdmProject} 上的注解与注释共同把关。</li>
 * </ol>
 *
 * <p><b>纯 Mockito 离线单测，不连库</b>：证明的是「交给 mapper 的实体形状」，
 * 真实 SQL 是否把 NULL 写进列归属集成测试（任务24）。
 */
class RdmProjectOwnerWriteTest {

    private static final long PROJECT = 500L;
    private static final long OPERATOR = 41L;
    private static final long OLD_PM = 7L;
    private static final long OLD_PO = 9L;

    private RdmProjectMapper projectMapper;
    private RdmProjectMemberMapper memberMapper;
    private SysUserMapper userMapper;
    private RdmProjectService service;

    @BeforeEach
    void setUp() {
        projectMapper = mock(RdmProjectMapper.class);
        memberMapper = mock(RdmProjectMemberMapper.class);
        userMapper = mock(SysUserMapper.class);
        BizSeqService bizSeqService = mock(BizSeqService.class);
        RdmAccessGuard accessGuard = mock(RdmAccessGuard.class);
        RdmProjectFactService factService = mock(RdmProjectFactService.class);
        OperatorResolver operatorResolver = mock(OperatorResolver.class);
        when(bizSeqService.next("rdm_project")).thenReturn("PJ202610190001");
        when(operatorResolver.currentOperatorName()).thenReturn("古月");

        service = new RdmProjectService(projectMapper, memberMapper,
                mock(RdmRequirementMapper.class), mock(RdmWorkTaskMapper.class), userMapper,
                bizSeqService, accessGuard, factService,
                mock(RdmWorkingDayCalculator.class), operatorResolver);
    }

    /** 库里已存在的项目：配了 PM 与产品负责人，version 与表单回传值一致 */
    private RdmProject stored() {
        RdmProject p = new RdmProject();
        p.setId(PROJECT);
        p.setProjectNo("PJ-OLD");
        p.setName("推廣金重構項目");
        p.setPmUserId(OLD_PM);
        p.setPmUserName("張三");
        p.setProductOwnerUserId(OLD_PO);
        p.setProductOwnerUserName("李四");
        p.setVersion(3);
        return p;
    }

    private RdmProject capturedUpdate() {
        ArgumentCaptor<RdmProject> captor = ArgumentCaptor.forClass(RdmProject.class);
        verify(projectMapper).updateById(captor.capture());
        return captor.getValue();
    }

    @Test
    @DisplayName("清空负责人：userName 空串 + userId null 必须把两列都置空（旧 null-skip 永远清不掉）")
    void clearingOwnersPersistsNulls() {
        doReturn(stored()).when(projectMapper).selectById(PROJECT);
        doReturn(1).when(projectMapper).updateById(any(RdmProject.class));

        RdmProjectDTO.Update dto = new RdmProjectDTO.Update();
        dto.setExpectedVersion(3);
        dto.setPmUserId(null);
        dto.setPmUserName("");
        dto.setProductOwnerUserId(null);
        dto.setProductOwnerUserName("");
        service.updateProject(PROJECT, dto, OPERATOR);

        RdmProject saved = capturedUpdate();
        assertNull(saved.getPmUserId(), "PM 未清掉就是表单里删了人、刷新又回来");
        assertNull(saved.getPmUserName());
        assertNull(saved.getProductOwnerUserId(), "產品負責人未清掉");
        assertNull(saved.getProductOwnerUserName());
    }

    @Test
    @DisplayName("只改暂停标记时不带负责人 key，绝不能把已配的负责人洗空")
    void partialPauseUpdateKeepsOwners() {
        doReturn(stored()).when(projectMapper).selectById(PROJECT);
        doReturn(1).when(projectMapper).updateById(any(RdmProject.class));

        RdmProjectDTO.Update dto = new RdmProjectDTO.Update();
        dto.setExpectedVersion(3);
        dto.setPausedFlag(1);
        service.updateProject(PROJECT, dto, OPERATOR);

        RdmProject saved = capturedUpdate();
        assertEquals(OLD_PM, saved.getPmUserId());
        assertEquals("張三", saved.getPmUserName());
        assertEquals(OLD_PO, saved.getProductOwnerUserId());
        assertEquals(1, saved.getPausedFlag());
    }

    @Test
    @DisplayName("换人时姓名以库内为准：前端只给 userId 也要落到正确的姓名快照")
    void reassigningOwnerResolvesNameFromStore() {
        doReturn(stored()).when(projectMapper).selectById(PROJECT);
        doReturn(1).when(projectMapper).updateById(any(RdmProject.class));
        SysUser newPm = new SysUser();
        newPm.setId(88L);
        newPm.setName("王五");
        doReturn(newPm).when(userMapper).selectById(88L);

        RdmProjectDTO.Update dto = new RdmProjectDTO.Update();
        dto.setExpectedVersion(3);
        dto.setPmUserId(88L);
        // 姓名快照留空：服务端必须按 userId 回查，而不是把空串写进库
        dto.setPmUserName("");
        service.updateProject(PROJECT, dto, OPERATOR);

        RdmProject saved = capturedUpdate();
        assertEquals(88L, saved.getPmUserId());
        assertEquals("王五", saved.getPmUserName());
    }

    @Test
    @DisplayName("创建与编辑都刷新 updated_by：列表「最後更新人」只有一个写入源")
    void bothWriteEntriesStampUpdatedBy() {
        doReturn(1).when(projectMapper).insert(any(RdmProject.class));
        RdmProjectDTO.Create create = new RdmProjectDTO.Create();
        create.setName("新项目");
        service.createProject(create, OPERATOR);
        ArgumentCaptor<RdmProject> inserted = ArgumentCaptor.forClass(RdmProject.class);
        verify(projectMapper).insert(inserted.capture());
        assertEquals("古月", inserted.getValue().getUpdatedBy(), "新建不写更新人，列表上刚建的项目会显示没人改过");

        doReturn(stored()).when(projectMapper).selectById(PROJECT);
        doReturn(1).when(projectMapper).updateById(any(RdmProject.class));
        RdmProjectDTO.Update update = new RdmProjectDTO.Update();
        update.setExpectedVersion(3);
        update.setPausedFlag(1);
        service.updateProject(PROJECT, update, OPERATOR);
        assertEquals("古月", capturedUpdate().getUpdatedBy());
    }

    /** 创建时 projectMapper.insert 不回填 id，成员同步依赖它 → 用 doAnswer 补上 */
    private void stubInsertBackfillsId() {
        doAnswer(inv -> {
            ((RdmProject) inv.getArgument(0)).setId(PROJECT);
            return 1;
        }).when(projectMapper).insert(any(RdmProject.class));
    }

    @Test
    @DisplayName("创建项目：六类负责人全部入组（不只是 PM），同一人兼任多角色写多行")
    void createProjectEnrollsAllOwners() {
        stubInsertBackfillsId();

        RdmProjectDTO.Create dto = new RdmProjectDTO.Create();
        dto.setName("六負責人項目");
        dto.setPmUserId(7L);
        dto.setPmUserName("張三");
        // 同一人兼任产品：uk_project_user_role 允许同人不同角色各一行
        dto.setProductOwnerUserId(7L);
        dto.setProductOwnerUserName("張三");
        dto.setTechLeadUserId(8L);
        dto.setTechLeadUserName("李四");
        dto.setUiDesignerUserId(9L);
        dto.setUiDesignerUserName("王五");
        dto.setQaLeadUserId(10L);
        dto.setQaLeadUserName("趙六");
        dto.setOpsLeadUserId(11L);
        dto.setOpsLeadUserName("錢七");
        service.createProject(dto, OPERATOR);

        ArgumentCaptor<RdmProjectMember> captor = ArgumentCaptor.forClass(RdmProjectMember.class);
        verify(memberMapper, times(6)).insert(captor.capture());
        List<RdmProjectMember> members = captor.getAllValues();
        assertEquals(Set.of("pm", "product", "dev_lead", "designer", "qa", "ops"),
                members.stream().map(RdmProjectMember::getRoleCode).collect(Collectors.toSet()),
                "六类负责人必须各自入组，缺一类详情页就会少一行成员");
        assertTrue(members.stream().allMatch(m -> PROJECT == m.getProjectId()));
        assertEquals(2, members.stream().filter(m -> m.getUserId() == 7L).count(),
                "同一人兼任 PM 与产品时必须写两行，否则换掉其中一个角色会误删另一个");
        assertTrue(members.stream().allMatch(m -> m.getJoinTime() != null));
    }

    @Test
    @DisplayName("编辑换 PM：旧 PM 行软移除、新 PM 入组（否则成员区永远与负责人不一致）")
    void updateProjectSwapsPmMember() {
        doReturn(stored()).when(projectMapper).selectById(PROJECT);
        doReturn(1).when(projectMapper).updateById(any(RdmProject.class));
        RdmProjectMember oldPm = new RdmProjectMember();
        oldPm.setId(900L);
        oldPm.setProjectId(PROJECT);
        oldPm.setUserId(OLD_PM);
        oldPm.setUserName("張三");
        oldPm.setRoleCode("pm");
        doReturn(List.of(oldPm)).when(memberMapper).selectList(any());

        SysUser newPm = new SysUser();
        newPm.setId(88L);
        newPm.setName("王五");
        doReturn(newPm).when(userMapper).selectById(88L);

        RdmProjectDTO.Update dto = new RdmProjectDTO.Update();
        dto.setExpectedVersion(3);
        dto.setPmUserId(88L);
        dto.setPmUserName("王五");
        service.updateProject(PROJECT, dto, OPERATOR);

        ArgumentCaptor<RdmProjectMember> updated = ArgumentCaptor.forClass(RdmProjectMember.class);
        verify(memberMapper).updateById(updated.capture());
        assertEquals(OLD_PM, updated.getValue().getUserId());
        assertNotNull(updated.getValue().getLeaveTime(), "换人后旧 PM 必须软移除，否则两个人同时留在项目里");

        ArgumentCaptor<RdmProjectMember> inserted = ArgumentCaptor.forClass(RdmProjectMember.class);
        verify(memberMapper).insert(inserted.capture());
        assertEquals(88L, inserted.getValue().getUserId());
        assertEquals("pm", inserted.getValue().getRoleCode());
        assertEquals("王五", inserted.getValue().getUserName());
    }

    @Test
    @DisplayName("编辑清空负责人：只软移除该角色行，不插入新成员")
    void clearingOwnerRemovesMemberRow() {
        doReturn(stored()).when(projectMapper).selectById(PROJECT);
        doReturn(1).when(projectMapper).updateById(any(RdmProject.class));
        RdmProjectMember oldPo = new RdmProjectMember();
        oldPo.setId(901L);
        oldPo.setProjectId(PROJECT);
        oldPo.setUserId(OLD_PO);
        oldPo.setUserName("李四");
        oldPo.setRoleCode("product");
        doReturn(List.of(oldPo)).when(memberMapper).selectList(any());

        RdmProjectDTO.Update dto = new RdmProjectDTO.Update();
        dto.setExpectedVersion(3);
        dto.setProductOwnerUserId(null);
        dto.setProductOwnerUserName("");
        service.updateProject(PROJECT, dto, OPERATOR);

        ArgumentCaptor<RdmProjectMember> updated = ArgumentCaptor.forClass(RdmProjectMember.class);
        verify(memberMapper).updateById(updated.capture());
        assertEquals(OLD_PO, updated.getValue().getUserId());
        assertNotNull(updated.getValue().getLeaveTime());
        verify(memberMapper, never()).insert(any(RdmProjectMember.class));
    }
}
