package com.mftb.admin.service;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.RdmDeliveryVO;
import com.mftb.admin.entity.RdmProjectMember;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.RdmProjectMemberMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 团队任务视图的数据范围测试。
 *
 * <p>钉住四条口径：
 * <ol>
 *   <li>普通成员只能看到「共同在途项目」的同事，离职/停用不进列表；</li>
 *   <li>同一人在多个共同项目里只出现一次，并累计共同项目数；</li>
 *   <li>与目标没有共同项目时拒绝，而不是返回空列表伪装成「对方没任务」；</li>
 *   <li>全量数据范围（管理员/PMO）不受项目限制，返回 null 表示调用方不再按项目过滤。</li>
 * </ol>
 */
class RdmTeamScopeServiceTest {

    private RdmProjectMemberMapper memberMapper;
    private SysUserMapper userMapper;
    private RdmAccessGuard accessGuard;
    private RdmTeamScopeService service;

    @BeforeEach
    void setUp() {
        memberMapper = mock(RdmProjectMemberMapper.class);
        userMapper = mock(SysUserMapper.class);
        accessGuard = mock(RdmAccessGuard.class);
        OperatorResolver operatorResolver = mock(OperatorResolver.class);
        when(operatorResolver.currentUser()).thenReturn(user(1L, "當前用戶", "MF00001", 1));
        when(accessGuard.canSeeAll(any())).thenReturn(false);
        service = new RdmTeamScopeService(memberMapper, userMapper, accessGuard, operatorResolver);
    }

    private static SysUser user(long id, String name, String empNo, int status) {
        SysUser u = new SysUser();
        u.setId(id);
        u.setName(name);
        u.setEmpId(empNo);
        u.setStatus(status);
        return u;
    }

    private static RdmProjectMember member(long projectId, long userId) {
        RdmProjectMember m = new RdmProjectMember();
        m.setProjectId(projectId);
        m.setUserId(userId);
        return m;
    }

    @Test
    @DisplayName("成员列表：只返回共同项目成员，离职/停用与自己在列表外")
    void teamMembersScopesToSharedProjects() {
        // 第 1 次：我的在途项目；第 2 次：这些项目的全部成员
        when(memberMapper.selectList(any()))
                .thenReturn(List.of(member(10L, 1L)))
                .thenReturn(List.of(
                        member(10L, 1L),
                        member(10L, 8L),
                        member(10L, 9L),
                        member(10L, 12L)));
        when(userMapper.selectBatchIds(any())).thenReturn(List.of(
                user(8L, "張三", "MF00008", 1),
                user(9L, "李四", "MF00009", 1),
                user(12L, "離職者", "MF00012", 0)));

        List<RdmDeliveryVO.TeamMember> members = service.teamMembers();

        assertEquals(2, members.size());
        assertTrue(members.stream().anyMatch(m -> m.getUserId().equals(8L)));
        assertTrue(members.stream().anyMatch(m -> m.getUserId().equals(9L)));
        assertTrue(members.stream().noneMatch(m -> m.getUserId().equals(12L)), "停用员工不能进下拉");
        assertTrue(members.stream().noneMatch(m -> m.getUserId().equals(1L)), "自己不需要出现在切换列表");
        assertTrue(members.stream().allMatch(m -> Integer.valueOf(1).equals(m.getSharedProjectCount())));
    }

    @Test
    @DisplayName("全量数据范围：成员列表退化为全公司在职员工，共同项目数为 null")
    void teamMembersUnrestrictedReturnsActiveUsers() {
        when(accessGuard.canSeeAll(any())).thenReturn(true);
        when(userMapper.selectList(any())).thenReturn(List.of(
                user(8L, "張三", "MF00008", 1),
                user(9L, "李四", "MF00009", 1)));

        List<RdmDeliveryVO.TeamMember> members = service.teamMembers();

        assertEquals(2, members.size());
        assertTrue(members.stream().allMatch(m -> m.getSharedProjectCount() == null));
        verify(memberMapper, never()).selectList(any());
    }

    @Test
    @DisplayName("共同项目：取双方在途项目的交集")
    void commonProjectIdsIntersects() {
        when(memberMapper.selectList(any()))
                .thenReturn(List.of(member(10L, 1L), member(11L, 1L)))
                .thenReturn(List.of(member(11L, 8L), member(12L, 8L)));

        Set<Long> common = service.commonProjectIds(8L);

        assertEquals(Set.of(11L), common);
    }

    @Test
    @DisplayName("没有共同项目时拒绝，不能伪装成空任务列表")
    void commonProjectIdsRejectsWithoutSharedProject() {
        when(memberMapper.selectList(any()))
                .thenReturn(List.of(member(10L, 1L)))
                .thenReturn(List.of(member(12L, 8L)));

        BusinessException ex = assertThrows(BusinessException.class, () -> service.commonProjectIds(8L));
        assertTrue(ex.getMessage().contains("沒有共同項目"), ex.getMessage());
    }

    @Test
    @DisplayName("全量数据范围：返回 null 表示调用方不再按项目过滤")
    void commonProjectIdsUnrestrictedReturnsNull() {
        when(accessGuard.canSeeAll(any())).thenReturn(true);

        assertNull(service.commonProjectIds(8L));
        verify(memberMapper, never()).selectList(any());
    }
}
