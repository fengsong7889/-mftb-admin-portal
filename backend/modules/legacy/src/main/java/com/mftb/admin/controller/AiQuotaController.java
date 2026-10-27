package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.common.ResultCode;
import com.mftb.admin.dto.AiMyCenterDTO;
import com.mftb.admin.dto.AiQuotaDTO;
import com.mftb.admin.service.AiMyCenterService;
import com.mftb.admin.service.AiQuotaService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * AI 配额管理控制器
 */
@RestController
@RequestMapping("/api/ai/quota")
@RequiredArgsConstructor
@Tag(name = "AI 智能中心 - 配额管理", description = "部门/员工配额管理接口")
public class AiQuotaController {

    /** 部门额度菜单标识 */
    private static final String MENU_DEPT = "ai-dept-quota";
    /** 员工额度菜单标识 */
    private static final String MENU_EMP = "ai-emp-quota";
    /** 配额管理（二级目录）菜单标识，用于部门/员工共用的删除接口 */
    private static final String MENU_QUOTA_MANAGE = "ai-quota-manage";

    private final AiQuotaService quotaService;
    private final AiMyCenterService myCenterService;

    /**
     * 查询当前账号的额度维度与真实用量（首页「我的用量」数据源）
     */
    @GetMapping("/my")
    @Operation(summary = "查询我的额度维度与用量")
    public Result<AiMyCenterDTO.MyQuotaUsageVO> myQuotaUsage() {
        AiMyCenterDTO.MyQuotaUsageVO vo = myCenterService.myQuotaUsage();
        return vo != null ? Result.success(vo) : Result.error(ResultCode.UNAUTHORIZED);
    }

    /**
     * 配额校验闭环：调用模型前的闸门（自查，不需管理权限）。
     * 网关/前端在发起请求前调用，消费 over_limit_action/downgrade_model_id 给出处置。
     */
    @GetMapping("/check")
    @Operation(summary = "校验当前账号配额處置（不传模型则综合所有维度）")
    public Result<AiMyCenterDTO.QuotaCheckVO> checkQuota(@RequestParam(required = false) Long modelId,
                                                         @RequestParam(required = false) String modelKey) {
        return Result.success(myCenterService.checkQuota(modelId, modelKey));
    }

    /**
     * 查询部门配额列表
     */
    @GetMapping("/departments")
    @Operation(summary = "查询部门配额列表")
    @RequirePermission(menu = MENU_DEPT)
    public Result<List<AiQuotaDTO.QuotaVO>> listDeptQuotas(@RequestBody(required = false)
                                                            AiQuotaDTO.DeptQuotaQueryRequest query) {
        return Result.success(quotaService.listDeptQuotas(query));
    }

    /**
     * 查询员工配额列表
     */
    @GetMapping("/employees")
    @Operation(summary = "查询员工配额列表")
    @RequirePermission(menu = MENU_EMP)
    public Result<List<AiQuotaDTO.QuotaVO>> listEmpQuotas(@RequestBody(required = false)
                                                           AiQuotaDTO.EmpQuotaQueryRequest query) {
        return Result.success(quotaService.listEmpQuotas(query));
    }

    /**
     * 设置部门配额（批量）
     */
    @PostMapping("/departments")
    @Operation(summary = "批量设置部门配额")
    @RequirePermission(menu = MENU_DEPT, action = "edit")
    public Result<Boolean> batchSetDeptQuotas(@Valid @RequestBody AiQuotaDTO.BatchQuotaRequest request) {
        quotaService.batchSetDeptQuotas(request);
        return Result.success(true);
    }

    /**
     * 设置员工配额（批量）
     */
    @PostMapping("/employees")
    @Operation(summary = "批量设置员工配额")
    @RequirePermission(menu = MENU_EMP, action = "edit")
    public Result<Boolean> batchSetEmpQuotas(@Valid @RequestBody AiQuotaDTO.BatchQuotaRequest request) {
        quotaService.batchSetEmpQuotas(request);
        return Result.success(true);
    }

    /**
     * 删除指定目标的配额配置
     */
    @DeleteMapping("/{type}/{targetId}")
    @Operation(summary = "删除目标配额配置")
    @RequirePermission(menu = MENU_QUOTA_MANAGE, action = "delete")
    public Result<Boolean> deleteQuota(@PathVariable String type, @PathVariable Long targetId) {
        return Result.success(quotaService.deleteQuota(type, targetId));
    }
}
