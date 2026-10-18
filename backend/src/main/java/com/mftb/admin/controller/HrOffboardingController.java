package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.HrOffboardingReceiverRequest;
import com.mftb.admin.dto.HrOffboardingTaskVO;
import com.mftb.admin.entity.HrOffboardingTask;
import com.mftb.admin.service.HrOffboardingTaskService;
import com.mftb.admin.util.OperatorResolver;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 离职联动接口：看任务、指定交接接收人、重试失败任务。
 * <p>
 * 权限沿用人事入转调离那一组菜单（离职单可能从任一个人事菜单进入），写动作用 {@code edit}；
 * 真正的人员归属由服务层按组织数据范围逐个校验（接收人也必须在操作者范围内），
 * 因为「把别人的资产转给自己管不到的人」正是这类批量入口最容易漏的越权。
 */
@Tag(name = "离职联动")
@RestController
@RequestMapping("/api/hr/offboarding")
@RequiredArgsConstructor
public class HrOffboardingController {

    private final HrOffboardingTaskService offboardingTaskService;
    private final OperatorResolver operatorResolver;

    @Operation(summary = "某张离职单的联动任务列表")
    @GetMapping("/requests/{requestId}/tasks")
    @RequirePermission(menu = "hr-dimission",
            anyOf = {"hr-onboarding", "hr-regularization", "hr-transfer", "contract-ledger"}, action = "view")
    public Result<List<HrOffboardingTaskVO>> tasks(@PathVariable Long requestId) {
        List<HrOffboardingTaskVO> rows = offboardingTaskService.listByRequest(requestId).stream()
                .map(HrOffboardingTaskVO::from)
                .toList();
        return Result.success(rows);
    }

    @Operation(summary = "指定/变更交接接收人（并把等待中的任务退回待执行）")
    @PostMapping("/requests/{requestId}/receiver")
    @RequirePermission(menu = "hr-dimission",
            anyOf = {"hr-onboarding", "hr-regularization", "hr-transfer", "contract-ledger"}, action = "edit")
    public Result<Void> assignReceiver(@PathVariable Long requestId,
                                       @Valid @RequestBody HrOffboardingReceiverRequest request) {
        offboardingTaskService.assignReceiver(requestId, request.getReceiverUserId(),
                operatorResolver.currentOperatorName());
        return Result.success("交接接收人已指定，待執行任務已重新排程", null);
    }

    @Operation(summary = "重试单个联动任务（终态任务会被拒绝，避免重复建交接单）")
    @PostMapping("/tasks/{taskId}/retry")
    @RequirePermission(menu = "hr-dimission",
            anyOf = {"hr-onboarding", "hr-regularization", "hr-transfer", "contract-ledger"}, action = "edit")
    public Result<String> retry(@PathVariable Long taskId) {
        boolean terminal = offboardingTaskService.execute(taskId, operatorResolver.currentOperatorName());
        return Result.success(terminal ? "任務已完成" : "任務未進入終態，請查看失敗原因", null);
    }

    /** 供界面渲染任务类型与状态文案的取值清单（真值在 {@link HrOffboardingTask} 常量上） */
    @Operation(summary = "任务类型清单")
    @GetMapping("/task-types")
    @RequirePermission(menu = "hr-dimission",
            anyOf = {"hr-onboarding", "hr-regularization", "hr-transfer", "contract-ledger"}, action = "view")
    public Result<List<String>> taskTypes() {
        return Result.success(List.of(HrOffboardingTask.TYPE_ASSET_HANDOVER, HrOffboardingTask.TYPE_OA_TODO_TRANSFER));
    }
}
