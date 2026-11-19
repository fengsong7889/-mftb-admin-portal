/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.contracts.rdm.RdmWorkItemSource;
import com.mftb.admin.dto.RdmRequirementQuery;
import com.mftb.admin.entity.RdmRequirement;
import com.mftb.admin.entity.RdmWorkTask;
import com.mftb.admin.mapper.RdmRequirementMapper;
import com.mftb.admin.mapper.RdmWorkTaskMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * {@link RdmWorkItemSource} 的 RDM 域实现：把「与某人相关且未结案的需求」以扁平引用交给 CPM。
 *
 * <p>口径为什么不自己写：直接复用 {@link RdmRequirementQuery#toWrapper(Long, boolean)} 并固定
 * {@code scope=SCOPE_PERSON} + {@code relatedUserId=本人} —— 这条组合正是 RDM 列表「某人视角」
 * 用的那一条，命中提出人/产品经理/研发负责人/验收人/未完成任务负责人五类关系。
 * 若在 CPM 侧另写一套四个 OR，RDM 以后新增角色列时 CPM 的导入清单会静默漏项，
 * 而漏项在界面上看起来完全正常（少几条而已），是最难被发现的那类缺陷。
 *
 * <p>scope 必须显式设为 SCOPE_PERSON：默认分支会追加「提出人=本人」，与 relatedOnly 的 OR 组
 * 形成 AND，结果只剩自己提的单——研发/验收角色全部消失（RDM 历史上真踩过这个坑）。
 */
@Service
@RequiredArgsConstructor
public class RdmWorkItemSourceService implements RdmWorkItemSource {

    /** 候选清单上限：导入挑选器不分页，一次给太多反而没人看；与 CPM 侧 limit 双向夹紧 */
    private static final int CANDIDATE_LIMIT_MAX = 50;

    /** 参与者线一次回溯的需求上限：任务挂在需求下，先收敛需求再取任务，避免全表扫 */
    private static final int RELATED_REQ_LIMIT = 20;

    /** 结案态：已上线/已核销/已关闭——仍可导入（收尾工作也要记录），但界面要提示已完结 */
    private static boolean isTerminated(String status) {
        return RdmConstants.STATUS_RELEASED.equals(status)
                || RdmConstants.STATUS_VERIFIED.equals(status)
                || RdmConstants.STATUS_CLOSED.equals(status);
    }

    private final RdmRequirementMapper requirementMapper;
    private final RdmWorkTaskMapper taskMapper;

    @Override
    public List<WorkItemRef> findRelatedOpenRequirements(long userId, String keyword, int limit) {
        RdmRequirementQuery query = new RdmRequirementQuery();
        query.setScope(RdmConstants.SCOPE_PERSON);
        query.setRelatedUserId(userId);
        if (StringUtils.hasText(keyword)) {
            query.setKeyword(keyword.trim());
        }
        LambdaQueryWrapper<RdmRequirement> wrapper = query.toWrapper(userId, true);
        // 结案三态用逐个 ne 而不是 notIn：与 RdmRequirementQuery 同因，notIn 在本 MP 版本会渲染成 NOT IN ()
        wrapper.ne(RdmRequirement::getStatus, RdmConstants.STATUS_CLOSED)
                .ne(RdmRequirement::getStatus, RdmConstants.STATUS_INTAKE_REJECTED)
                .ne(RdmRequirement::getStatus, RdmConstants.STATUS_REJECTED);
        // 上限是本地整型常量夹紧后的值，不含任何用户输入；导入挑选器不需要翻页
        wrapper.last("LIMIT " + Math.max(1, Math.min(limit, 50)));

        List<WorkItemRef> result = new ArrayList<>();
        for (RdmRequirement req : requirementMapper.selectList(wrapper)) {
            result.add(new WorkItemRef(
                    req.getId(), req.getReqNo(), req.getTitle(), req.getStatus(), req.getProgress(),
                    roleOf(req, userId), req.getPlanReleaseDate(), isTerminated(req.getStatus())));
        }
        return result;
    }

    /** 本人所乘角色：一个需求可能同时命中多个，取展示优先级最高的一个 */
    private String roleOf(RdmRequirement req, long userId) {
        if (Long.valueOf(userId).equals(req.getSubmitterUserId())) {
            return "submitter";
        }
        if (Long.valueOf(userId).equals(req.getAssigneePmUserId())
                || Long.valueOf(userId).equals(req.getProjectManagerUserId())) {
            return "pm";
        }
        if (Long.valueOf(userId).equals(req.getDevOwnerUserId())) {
            return "dev";
        }
        if (Long.valueOf(userId).equals(req.getAcceptorUserId())) {
            return "accept";
        }
        // 命中条件里还有「未完成任务负责人」这一条，需求表上没有对应列，统一归为 participant
        return "participant";
    }

    /**
     * 阶段三：本人可关联的未结案任务。
     *
     * <p>两条线合并而不是只查 {@code owner_user_id}：RDM 的「与我相关」在需求侧认五种角色列，
     * 任务侧只有负责人列。只查负责人会让「我参与的需求里的别人的任务」完全消失，
     * 而参与者确实需要记录自己的投入；两条线并集后再按任务 id 去重，
     * owner 优先（同一任务既是自己负责又出现在相关需求里，只能有一条）。
     *
     * <p>结案任务不列出（{@link RdmConstants#TASK_OPEN_STATUSES}），但已结案需求下的开案任务仍列出——
     * 需求上线后的收尾任务恰恰是最需要被记录的那部分工作。
     */
    @Override
    public List<TaskRef> findMyOpenTasks(long userId, String keyword, int limit) {
        int cap = Math.max(1, Math.min(limit, CANDIDATE_LIMIT_MAX));
        String kw = StringUtils.hasText(keyword) ? keyword.trim() : null;

        Map<Long, TaskRef> merged = new java.util.LinkedHashMap<>();

        LambdaQueryWrapper<RdmWorkTask> owned = new LambdaQueryWrapper<RdmWorkTask>()
                .eq(RdmWorkTask::getOwnerUserId, userId)
                .eq(RdmWorkTask::getDeleted, 0)
                .in(RdmWorkTask::getStatus, RdmConstants.TASK_OPEN_STATUSES);
        if (kw != null) {
            owned.and(w -> w.like(RdmWorkTask::getTitle, kw).or().like(RdmWorkTask::getTaskNo, kw));
        }
        owned.orderByAsc(RdmWorkTask::getPlanFinishDate).orderByDesc(RdmWorkTask::getUpdatedAt)
                .last("LIMIT " + cap);
        for (RdmWorkTask task : taskMapper.selectList(owned)) {
            merged.put(task.getId(), toTaskRef(task, "owner"));
        }

        int remaining = cap - merged.size();
        if (remaining > 0) {
            // 参与者线：复用需求侧「某人视角」同一条 wrapper，绝不在这里另写一套角色 OR
            RdmRequirementQuery query = new RdmRequirementQuery();
            query.setScope(RdmConstants.SCOPE_PERSON);
            query.setRelatedUserId(userId);
            LambdaQueryWrapper<RdmRequirement> reqWrapper = query.toWrapper(userId, true);
            reqWrapper.select(RdmRequirement::getId)
                    .last("LIMIT " + RELATED_REQ_LIMIT);
            List<Long> reqIds = requirementMapper.selectList(reqWrapper).stream()
                    .map(RdmRequirement::getId).filter(java.util.Objects::nonNull).toList();
            if (!reqIds.isEmpty()) {
                LambdaQueryWrapper<RdmWorkTask> related = new LambdaQueryWrapper<RdmWorkTask>()
                        .in(RdmWorkTask::getReqId, reqIds)
                        .eq(RdmWorkTask::getDeleted, 0)
                        .in(RdmWorkTask::getStatus, RdmConstants.TASK_OPEN_STATUSES)
                        .ne(RdmWorkTask::getOwnerUserId, userId);
                if (kw != null) {
                    related.and(w -> w.like(RdmWorkTask::getTitle, kw).or().like(RdmWorkTask::getTaskNo, kw));
                }
                related.orderByAsc(RdmWorkTask::getPlanFinishDate).orderByDesc(RdmWorkTask::getUpdatedAt)
                        .last("LIMIT " + remaining);
                for (RdmWorkTask task : taskMapper.selectList(related)) {
                    merged.putIfAbsent(task.getId(), toTaskRef(task, "participant"));
                }
            }
        }

        List<TaskRef> refs = new ArrayList<>(merged.values());
        fillParentTitles(refs);
        return refs;
    }

    private TaskRef toTaskRef(RdmWorkTask task, String myRole) {
        boolean open = RdmConstants.TASK_OPEN_STATUSES.contains(task.getStatus());
        return new TaskRef(
                task.getId(), task.getTaskNo(), task.getReqId(), null, task.getTitle(),
                task.getStatus(), task.getProgress(), task.getPlanHours(), myRole,
                task.getPlanFinishDate(),
                RdmPrdTaskService.TASK_TYPE_PRD.equals(task.getTaskType()),
                !open);
    }

    /**
     * 补所属需求标题：一次批量查而不是逐条 selectById（N+1 在这种清单里是必然踩的坑）。
     * 标题只作界面素材，CPM 侧落库的是 source_label 快照，需求改名不会改写历史记录。
     */
    private void fillParentTitles(List<TaskRef> refs) {
        List<Long> reqIds = refs.stream().map(TaskRef::reqId).filter(java.util.Objects::nonNull).distinct().toList();
        if (reqIds.isEmpty()) {
            return;
        }
        Map<Long, String> titles = new HashMap<>();
        for (RdmRequirement req : requirementMapper.selectBatchIds(reqIds)) {
            titles.put(req.getId(), req.getTitle());
        }
        for (int i = 0; i < refs.size(); i++) {
            TaskRef ref = refs.get(i);
            refs.set(i, new TaskRef(ref.taskId(), ref.taskNo(), ref.reqId(), titles.get(ref.reqId()),
                    ref.title(), ref.status(), ref.progress(), ref.planHours(), ref.myRole(),
                    ref.planFinishDate(), ref.prdTask(), ref.terminated()));
        }
    }
}
