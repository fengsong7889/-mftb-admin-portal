package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.AiDeptQuotaDTO;
import com.mftb.admin.service.AiDeptQuotaService;
import com.mftb.admin.util.OperatorResolver;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * AI 智能中心 - 部门额度策略管理端点（列表/详情/保存/删除/启停）
 */
@RestController
@RequestMapping("/api/ai/dept-quota")
@RequiredArgsConstructor
@Tag(name = "AI 智能中心 - 部门额度", description = "部门额度策略管理")
public class AiDeptQuotaPolicyController {

    /** 本菜单标识（sys_menu.menu_key），部门额度页 */
    private static final String MENU = "ai-dept-quota";

    private final AiDeptQuotaService deptQuotaService;
    private final OperatorResolver operatorResolver;

    /**
     * 查询部门额度策略列表（按条件过滤，不含分页）
     *
     * @param query 查询条件（名称/周期/状态）
     * @return 策略列表
     */
    @GetMapping
    @Operation(summary = "查询部门额度列表")
    @RequirePermission(menu = MENU)
    public Result<List<AiDeptQuotaDTO.DeptQuotaVO>> listDeptQuotas(AiDeptQuotaDTO.DeptQuotaQueryRequest query) {
        return Result.success(deptQuotaService.listDeptQuotas(query));
    }

    /**
     * 查询部门额度策略详情
     *
     * @param id 策略主键 ID
     * @return 策略详情；不存在时返回业务错误
     */
    @GetMapping("/{id}")
    @Operation(summary = "查询部门额度详情")
    @RequirePermission(menu = MENU)
    public Result<AiDeptQuotaDTO.DeptQuotaVO> getDeptQuota(@PathVariable Long id) {
        AiDeptQuotaDTO.DeptQuotaVO vo = deptQuotaService.getDeptQuotaById(id);
        return vo != null ? Result.success(vo) : Result.error("額度策略不存在");
    }

    /**
     * 新增或更新部门额度策略（根据 request.id 是否为空判定）
     *
     * @param request 策略保存请求体
     * @return 保存后的策略 ID
     */
    @PostMapping
    @Operation(summary = "新增/更新部门额度策略")
    @RequirePermission(menu = MENU, action = "edit")
    public Result<Long> saveDeptQuota(@Valid @RequestBody AiDeptQuotaDTO.DeptQuotaRequest request) {
        String operator = operatorResolver.currentOperatorName();
        Long id = deptQuotaService.saveDeptQuota(request, operator);
        return Result.success(id);
    }

    /**
     * 删除部门额度策略（逻辑删除）
     *
     * @param id 策略主键 ID
     * @return 操作是否成功
     */
    @DeleteMapping("/{id}")
    @Operation(summary = "删除部门额度策略")
    @RequirePermission(menu = MENU, action = "delete")
    public Result<Boolean> deleteDeptQuota(@PathVariable Long id) {
        deptQuotaService.deleteDeptQuota(id);
        return Result.success(true);
    }

    /**
     * 启用/停用部门额度策略
     *
     * @param id     策略主键 ID
     * @param status 目标状态（1=启用，0=停用）
     * @return 操作是否成功
     */
    @PutMapping("/{id}/status")
    @Operation(summary = "切换部门额度启用/停用")
    @RequirePermission(menu = MENU, action = "edit")
    public Result<Boolean> toggleStatus(@PathVariable Long id, @RequestParam Integer status) {
        String operator = operatorResolver.currentOperatorName();
        deptQuotaService.toggleDeptQuotaStatus(id, status, operator);
        return Result.success(true);
    }
}
