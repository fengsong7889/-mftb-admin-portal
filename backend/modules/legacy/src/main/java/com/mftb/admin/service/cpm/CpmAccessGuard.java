/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.service.cpm;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.CpmConstants;
import com.mftb.admin.entity.CpmItem;
import com.mftb.admin.entity.CpmReport;
import com.mftb.admin.entity.SysDepartment;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.CpmItemMapper;
import com.mftb.admin.mapper.CpmRecognitionMapper;
import com.mftb.admin.mapper.CpmReportMapper;
import com.mftb.admin.mapper.CpmViewGrantMapper;
import com.mftb.admin.mapper.SysDepartmentMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * CPM 资源级守卫：所有「碰别人的数据」的路径只在这里开口子。
 *
 * <p>数据范围模型（方案 §十二）：
 * <ul>
 *   <li>使用侧（条目/汇报草稿/发布）——一律硬约束 user_id=登录人，控制器注解不参与判定；</li>
 *   <li>阅读范围 = 本人 + dept_manager 推导（我任主管的部门成员）+ explicit 显式授权；
 *       「看谁的汇报」永远不是调用方能传的参数，只认这里算出来的集合；</li>
 *   <li>CFR 写（评论/点赞/认定）——必须在阅读范围内且非本人（自赞自认在 SQL 层还有唯一键/CHECK 兜底）。</li>
 * </ul>
 *
 * <p>主管推导口径沿用 {@code ApproverResolverService} 的现状：sys_department.leader 按姓名匹配用户。
 * 该字段是自由文本、匹配不上属于「组织数据不全」而不是异常——推不出就只剩显式授权线，
 * 与方案 §十五 的假设一致（主管关系数据不全时以显式授权为主、推导为辅）。
 */
@Component
@RequiredArgsConstructor
public class CpmAccessGuard {

    private final OperatorResolver operatorResolver;
    private final SysUserMapper userMapper;
    private final SysDepartmentMapper departmentMapper;
    private final CpmViewGrantMapper grantMapper;
    private final CpmItemMapper itemMapper;
    private final CpmReportMapper reportMapper;
    private final CpmRecognitionMapper recognitionMapper;

    /** 当前登录人（未登录直接业务异常，控制器不应指望切面兜这个）。 */
    public SysUser currentUser() {
        SysUser current = operatorResolver.currentUser();
        if (current == null || current.getId() == null) {
            throw new BusinessException("登錄狀態失效，請重新登錄");
        }
        return current;
    }

    /** 按 id 取用户（展示归属人用；不存在返回 null，由调用方决定兜底文案）。 */
    public SysUser userById(long userId) {
        return userMapper.selectById(userId);
    }

    /**
     * 阅读范围：viewer 能看哪些人的汇报/成果。
     * <p>每次实时算（数据量=本人+直属部门成员+显式授权行，无缓存必要）；
     * 组织调整次日生效，不需要等任何同步作业的「推导行」重建。
     */
    public Set<Long> viewableUserIds(SysUser viewer) {
        Set<Long> ids = new LinkedHashSet<>();
        ids.add(viewer.getId());
        // 1) 部门主管推导：我名字出现在某部门 leader 字段 → 该部门在职成员可见
        String name = StringUtils.hasText(viewer.getName()) ? viewer.getName().trim() : null;
        if (name != null) {
            List<Long> ledDeptIds = departmentMapper.selectList(
                            new LambdaQueryWrapper<SysDepartment>()
                                    .select(SysDepartment::getId)
                                    .eq(SysDepartment::getDeleted, 0)
                                    .eq(SysDepartment::getLeader, name))
                    .stream().map(SysDepartment::getId).toList();
            if (!ledDeptIds.isEmpty()) {
                userMapper.selectList(new LambdaQueryWrapper<SysUser>()
                                .select(SysUser::getId)
                                .in(SysUser::getDepartmentId, ledDeptIds)
                                .eq(SysUser::getStatus, 1)
                                .eq(SysUser::getDeleted, 0))
                        .forEach(u -> ids.add(u.getId()));
            }
        }
        // 2) 显式授权行（含同步作业写入的 dept_manager 持久化行——人工线与推导行同表同读）
        ids.addAll(grantMapper.listTargetUserIds(viewer.getId()));
        return ids;
    }

    /** 条目必须属于本人（使用侧唯一写入口径）。 */
    public CpmItem requireOwnedItem(long itemId, SysUser user) {
        CpmItem item = itemMapper.selectAliveById(itemId);
        if (item == null) {
            throw new BusinessException("工作記錄不存在或已被刪除");
        }
        if (!item.getUserId().equals(user.getId())) {
            throw new BusinessException("只能操作自己的工作記錄");
        }
        return item;
    }

    /** 汇报可读（本人 or 阅读范围内）；返回汇报本体，读回执由服务层另发。 */
    public CpmReport requireReadableReport(long reportId, SysUser viewer) {
        CpmReport report = reportMapper.selectAliveById(reportId);
        if (report == null) {
            throw new BusinessException("匯報不存在或已被移除");
        }
        if (report.getUserId().equals(viewer.getId())) {
            return report;
        }
        if (!viewableUserIds(viewer).contains(report.getUserId())) {
            throw new BusinessException("無權查看該成員的匯報");
        }
        return report;
    }

    /** CFR 写资格：目标作者必须在阅读范围内，且不能是自己（自评/自赞/自认全部拒绝）。 */
    public void requireCfrWritable(long targetUserId, SysUser viewer) {
        if (targetUserId == viewer.getId()) {
            throw new BusinessException("不能對自己的內容發起反饋或認定");
        }
        if (!viewableUserIds(viewer).contains(targetUserId)) {
            throw new BusinessException("無權反饋該成員的內容");
        }
    }

    /** 反馈读资格：评论列表的读取范围与目标本体一致（条目=本人；汇报=本人或可见范围）。 */
    public void requireCfrReadableForTarget(String targetType, long targetId, SysUser viewer) {
        if (CpmConstants.TARGET_ITEM.equals(targetType)) {
            requireOwnedItem(targetId, viewer);
            return;
        }
        requireReadableReport(targetId, viewer);
    }

    /** 认定重复防线的前置快查（数据库唯一键/CHECK 才是最终裁判，这里只是给用户更早的错）。 */
    public void requireNoDuplicateRecognition(String targetType, long targetId, long fromUserId) {
        if (recognitionMapper.countSameFromOnTarget(targetType, targetId, fromUserId) > 0) {
            throw new BusinessException("你已認定過該內容，可先撤回再重新發起");
        }
    }

    /** 显式授权行写入（授权管理入口用；grant_type=explicit，人工线与推导线互不覆盖）。 */
    public void grantExplicitViewer(long viewerUserId, long targetUserId, String operatorName) {
        if (viewerUserId == targetUserId) {
            throw new BusinessException("不能授權看自己的匯報（本來就能看）");
        }
        SysUser target = userMapper.selectById(targetUserId);
        if (target == null || target.getStatus() != 1) {
            throw new BusinessException("被授權員工不存在或已停用");
        }
        grantMapper.insertIgnore(viewerUserId, targetUserId, CpmConstants.GRANT_EXPLICIT, operatorName);
    }

    /** 推导行持久化同步（作业调用）：重建 viewer→target 的 dept_manager 集合，返回新增行数。 */
    public int rebuildDerivedGrants() {
        grantMapper.purgeDerived();
        List<SysDepartment> ledDepartments = departmentMapper.selectList(
                new LambdaQueryWrapper<SysDepartment>().eq(SysDepartment::getDeleted, 0).isNotNull(SysDepartment::getLeader));
        List<SysUser> activeUsers = userMapper.selectList(new LambdaQueryWrapper<SysUser>()
                .select(SysUser::getId, SysUser::getName, SysUser::getDepartmentId)
                .eq(SysUser::getStatus, 1).eq(SysUser::getDeleted, 0));
        int inserted = 0;
        for (SysDepartment dept : ledDepartments) {
            if (!StringUtils.hasText(dept.getLeader())) {
                continue;
            }
            String leaderName = dept.getLeader().trim();
            List<Long> memberIds = activeUsers.stream()
                    .filter(u -> dept.getId().equals(u.getDepartmentId()))
                    .map(SysUser::getId).toList();
            for (SysUser candidate : activeUsers) {
                if (leaderName.equals(candidate.getName())) {
                    for (Long memberId : memberIds) {
                        if (!memberId.equals(candidate.getId())
                                && grantMapper.insertIgnore(candidate.getId(), memberId,
                                CpmConstants.GRANT_DEPT_MANAGER, "system") > 0) {
                            inserted++;
                        }
                    }
                    break;
                }
            }
        }
        return inserted;
    }
}
