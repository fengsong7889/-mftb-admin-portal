package com.mftb.admin.dto;

import com.mftb.admin.entity.WorkflowConfig;
import lombok.Data;

/**
 * 流程配置视图对象
 */
@Data
public class WorkflowConfigVO {

    private Long id;

    /** 流程类型标识 */
    private String flowType;

    /** 流程展示名称 */
    private String flowName;

    /** 审批开关: true=启用审批, false=停用 */
    private Boolean approvalEnabled;

    /** 流程说明 */
    private String description;

    /** 审批节点配置JSON */
    private String nodesConfig;

    /** 路由规则JSON */
    private String routingRules;

    /** 最后更新人 */
    private String updatedBy;

    private String updatedAt;

    public static WorkflowConfigVO from(WorkflowConfig config) {
        WorkflowConfigVO vo = new WorkflowConfigVO();
        vo.setId(config.getId());
        vo.setFlowType(config.getFlowType());
        vo.setFlowName(config.getFlowName());
        vo.setApprovalEnabled(config.getApprovalEnabled() != null && config.getApprovalEnabled() == 1);
        vo.setDescription(config.getDescription());
        vo.setNodesConfig(config.getNodesConfig());
        vo.setRoutingRules(config.getRoutingRules());
        vo.setUpdatedBy(config.getUpdatedBy());
        vo.setUpdatedAt(config.getUpdatedAt() != null ? config.getUpdatedAt().toString() : null);
        return vo;
    }
}
