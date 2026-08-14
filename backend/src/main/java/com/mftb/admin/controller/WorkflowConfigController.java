package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.WorkflowConfigVO;
import com.mftb.admin.service.WorkflowConfigService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * 流程配置接口
 * 供前端流程配置页面查询与更新审批开关
 */
@RestController
@RequestMapping("/api/workflow-config")
@RequiredArgsConstructor
public class WorkflowConfigController {

    private final WorkflowConfigService workflowConfigService;

    /** 查询所有流程配置列表 */
    @GetMapping
    @RequirePermission(menu = "workflow-config")
    public Result<List<WorkflowConfigVO>> listAll() {
        return Result.success(workflowConfigService.listAll());
    }

    /** 更新指定流程的审批开关 */
    @PutMapping("/{flowType}/approval-enabled")
    @RequirePermission(menu = "workflow-config", action = "edit")
    public Result<Void> updateApprovalEnabled(
            @PathVariable String flowType,
            @RequestBody Map<String, Boolean> body) {
        Boolean value = body.get("value");
        if (value == null) {
            return Result.error(400, "审批开关值不能为空");
        }
        workflowConfigService.updateApprovalEnabled(flowType, value);
        return Result.success();
    }

    /** 保存流程节点配置和路由规则 */
    @PutMapping("/{flowType}/config")
    @RequirePermission(menu = "workflow-config", action = "edit")
    public Result<Void> updateConfig(
            @PathVariable String flowType,
            @RequestBody Map<String, String> body) {
        String nodesConfig = body.get("nodesConfig");
        String routingRules = body.get("routingRules");
        workflowConfigService.updateNodesConfig(flowType, nodesConfig, routingRules);
        return Result.success();
    }

    /** 读取流程节点配置和路由规则 */
    @GetMapping("/{flowType}/config")
    @RequirePermission(menu = "workflow-config")
    public Result<WorkflowConfigVO> getConfig(@PathVariable String flowType) {
        List<WorkflowConfigVO> all = workflowConfigService.listAll();
        WorkflowConfigVO config = all.stream()
                .filter(c -> flowType.equals(c.getFlowType()))
                .findFirst().orElse(null);
        if (config == null) {
            return Result.error(404, "流程类型不存在: " + flowType);
        }
        return Result.success(config);
    }
}
