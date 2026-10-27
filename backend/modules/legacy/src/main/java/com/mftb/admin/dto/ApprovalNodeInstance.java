package com.mftb.admin.dto;

import lombok.Data;

import java.util.List;

/**
 * 审批节点实例（每次提交时解析出的实际节点数据）
 */
@Data
public class ApprovalNodeInstance {

    /** 节点ID（对应前端 WorkflowNode.id） */
    private String nodeId;

    /** 节点名称 */
    private String nodeName;

    /** 审批规则: any=单人通过 / all=会签 */
    private String approvalRule;

    /** 审批人列表 */
    private List<ApproverInstance> approvers;
}
