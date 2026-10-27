package com.mftb.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.RdmDeliveryVO;
import com.mftb.admin.entity.RdmProjectMember;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.RdmProjectMemberMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * 研发团队任务视图的数据范围守卫。
 *
 * <p><b>为什么按「共同项目」而不是按部门/全量</b>：任务协作的真实场景是项目内对接联调，
 * 需要知道同项目同事的进度；按部门会把组织归属摊开，按全量则等于把所有人的工作量
 * 变成可随意查看的绩效看板。
 *
 * <p><b>为什么单独一个服务</b>：数据范围计算要同时被"成员下拉"和"成员任务列表"使用，
 * 散落在交付服务里会出现两份口径（下拉能看到的人，点进去却被拒）。
 *
 * <p><b>边界</b>：只有 {@code canSeeAll}（管理员/PMO）可以跨项目查看；其他人必须与目标
 * 至少同属一个在途项目，且任务还要再按共同项目过滤（见 {@code RdmDeliveryServiceImpl#teamTasks}），
 * 不能借"同项目"看到对方其他项目的活。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RdmTeamScopeService {

    /** 成员下拉上限：项目团队通常几十人，超过上限说明数据异常，不能把全公司扫进下拉 */
    private static final int MAX_TEAM_MEMBERS = 500;

    private final RdmProjectMemberMapper memberMapper;
    private final SysUserMapper userMapper;
    private final RdmAccessGuard accessGuard;
    private final OperatorResolver operatorResolver;

    /**
     * 当前登录人可切换查看的团队成员（不含自己）。
     * <p>普通用户：与我同属任一在途项目的成员，按姓名排序；
     * 全量数据范围：全公司在职员工（上限 500），供管理者按人查看。
     */
    public List<RdmDeliveryVO.TeamMember> teamMembers() {
        SysUser current = operatorResolver.currentUser();
        if (current == null || current.getId() == null) {
            return List.of();
        }
        if (accessGuard.canSeeAll(current)) {
            return userMapper.selectList(new LambdaQueryWrapper<SysUser>()
                            .eq(SysUser::getDeleted, 0)
                            .eq(SysUser::getStatus, 1)
                            .ne(SysUser::getId, current.getId())
                            .orderByAsc(SysUser::getName)
                            .last("LIMIT " + MAX_TEAM_MEMBERS))
                    .stream()
                    .map(u -> toMember(u, null))
                    .toList();
        }
        Set<Long> myProjects = activeProjectIds(current.getId());
        if (myProjects.isEmpty()) {
            return List.of();
        }
        List<RdmProjectMember> members = memberMapper.selectList(new LambdaQueryWrapper<RdmProjectMember>()
                .in(RdmProjectMember::getProjectId, myProjects)
                .isNull(RdmProjectMember::getLeaveTime));
        // 同一人在多个共同项目里会命中多行：按 userId 去重并累计共同项目数
        Map<Long, Set<Long>> projectsByUser = new LinkedHashMap<>();
        for (RdmProjectMember member : members) {
            if (member.getUserId() == null || member.getUserId().equals(current.getId())) {
                continue;
            }
            projectsByUser.computeIfAbsent(member.getUserId(), k -> new LinkedHashSet<>())
                    .add(member.getProjectId());
        }
        if (projectsByUser.isEmpty()) {
            return List.of();
        }
        List<SysUser> users = userMapper.selectBatchIds(projectsByUser.keySet());
        List<RdmDeliveryVO.TeamMember> result = new ArrayList<>();
        for (SysUser u : users) {
            // 离职/停用的人不进入切换列表：点进去也没有在途任务，只会制造空结果
            if (u.getStatus() == null || u.getStatus() != 1) {
                continue;
            }
            Set<Long> shared = projectsByUser.get(u.getId());
            result.add(toMember(u, shared == null ? 0 : shared.size()));
        }
        result.sort(Comparator.comparing(RdmDeliveryVO.TeamMember::getName,
                Comparator.nullsLast(String::compareTo)));
        return result;
    }

    /**
     * 计算当前人与目标成员的共同在途项目。
     *
     * @return {@code null} 表示当前人拥有全量数据范围（调用方不再按项目过滤）；
     *         非空集合表示只允许查看这些项目下的任务
     * @throws BusinessException 目标不是同项目成员（无共同项目）
     */
    public Set<Long> commonProjectIds(Long targetUserId) {
        SysUser current = operatorResolver.currentUser();
        if (current == null || current.getId() == null) {
            throw new BusinessException("登錄狀態失效，請重新登錄");
        }
        if (accessGuard.canSeeAll(current)) {
            return null;
        }
        if (targetUserId == null || targetUserId.equals(current.getId())) {
            return activeProjectIds(current.getId());
        }
        Set<Long> common = new LinkedHashSet<>(activeProjectIds(current.getId()));
        common.retainAll(activeProjectIds(targetUserId));
        if (common.isEmpty()) {
            throw new BusinessException("您與該成員沒有共同項目，無法查看其任務");
        }
        return common;
    }

    /** 在途项目（leave_time IS NULL）；rdm_project_member 无逻辑删除列，不写 deleted 条件 */
    private Set<Long> activeProjectIds(Long userId) {
        if (userId == null) {
            return Set.of();
        }
        return memberMapper.selectList(new LambdaQueryWrapper<RdmProjectMember>()
                        .eq(RdmProjectMember::getUserId, userId)
                        .isNull(RdmProjectMember::getLeaveTime))
                .stream()
                .map(RdmProjectMember::getProjectId)
                .filter(Objects::nonNull)
                .collect(java.util.stream.Collectors.toCollection(LinkedHashSet::new));
    }

    private static RdmDeliveryVO.TeamMember toMember(SysUser user, Integer sharedProjectCount) {
        RdmDeliveryVO.TeamMember member = new RdmDeliveryVO.TeamMember();
        member.setUserId(user.getId());
        member.setName(user.getName());
        member.setEmpNo(user.getEmpId());
        member.setSharedProjectCount(sharedProjectCount);
        return member;
    }
}

