package com.mftb.admin.service;

import com.mftb.admin.dto.WorkflowConfigVO;

import java.util.List;

/**
 * 流程配置服务
 * 提供流程审批开关的查询与更新能力，配置值持久化到 biz_workflow_config 表
 * 高频读取场景内置内存缓存（5 分钟自动刷新）
 */
public interface WorkflowConfigService {

    /**
     * 查询所有流程配置列表
     */
    List<WorkflowConfigVO> listAll();

    /**
     * 更新指定流程的审批开关
     *
     * @param flowType        流程类型标识
     * @param approvalEnabled true=启用审批, false=停用
     */
    void updateApprovalEnabled(String flowType, boolean approvalEnabled);

    /**
     * 判断指定流程是否启用审批
     * 带内存缓存，5 分钟内直接返回缓存值
     *
     * @param flowType 流程类型标识
     * @return true=需要审批, false=直接执行
     */
    boolean isApprovalEnabled(String flowType);
}
