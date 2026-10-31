package com.mftb.admin.service;

import com.mftb.admin.entity.BizSearchIntervention;

import java.util.List;

/** 搜索商家干预规则服务 */
public interface BizSearchInterventionService {

    List<BizSearchIntervention> list(Integer actionType, Integer approvalStatus, Integer status);

    long create(BizSearchIntervention rule);

    void update(Long id, BizSearchIntervention rule);

    /** 审批通过/驳回（高影响规则不得自审自批由权限层保证；此处仅记录审批人与状态）。 */
    void approve(Long id, boolean approved, String approver);

    void delete(Long id);
}
