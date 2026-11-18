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
import com.mftb.admin.mapper.RdmRequirementMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.List;

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

    /** 结案态：已上线/已核销/已关闭——仍可导入（收尾工作也要记录），但界面要提示已完结 */
    private static boolean isTerminated(String status) {
        return RdmConstants.STATUS_RELEASED.equals(status)
                || RdmConstants.STATUS_VERIFIED.equals(status)
                || RdmConstants.STATUS_CLOSED.equals(status);
    }

    private final RdmRequirementMapper requirementMapper;

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
}
