package com.mftb.admin.dto;

import lombok.Data;

/**
 * 流程节点配置与路由规则保存请求
 */
@Data
public class WorkflowConfigSaveDTO {

    /** 审批节点配置(JSON字符串) */
    private String nodesConfig;

    /** 路由规则(JSON字符串) */
    private String routingRules;
}
