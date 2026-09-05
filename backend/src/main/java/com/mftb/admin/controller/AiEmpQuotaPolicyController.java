package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.AiEmpQuotaDTO;
import com.mftb.admin.service.AiEmpQuotaService;
import com.mftb.admin.util.OperatorResolver;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 員工額度策略控制器（職位額度 + 角色額度）
 */
@RestController
@RequestMapping("/api/ai/emp-quota")
@RequiredArgsConstructor
@Tag(name = "AI 智能中心 - 員工額度", description = "職位額度 / 角色額度策略管理")
public class AiEmpQuotaPolicyController {

    /** 本菜单标识（sys_menu.menu_key），员工额度页（职位额度 + 角色额度） */
    private static final String MENU = "ai-emp-quota";

    private final AiEmpQuotaService quotaService;
    private final OperatorResolver operatorResolver;

    /* ══════════════════════ 職位額度 ══════════════════════ */

    @GetMapping("/positions")
    @Operation(summary = "查詢職位額度列表")
    @RequirePermission(menu = MENU)
    public Result<List<AiEmpQuotaDTO.PosQuotaVO>> listPosQuotas(AiEmpQuotaDTO.QuotaQueryRequest query) {
        return Result.success(quotaService.listPosQuotas(query));
    }

    @GetMapping("/positions/{id}")
    @Operation(summary = "查詢職位額度詳情")
    @RequirePermission(menu = MENU)
    public Result<AiEmpQuotaDTO.PosQuotaVO> getPosQuota(@PathVariable Long id) {
        AiEmpQuotaDTO.PosQuotaVO vo = quotaService.getPosQuotaById(id);
        return vo != null ? Result.success(vo) : Result.error("額度策略不存在");
    }

    @PostMapping("/positions")
    @Operation(summary = "新增/更新職位額度策略")
    @RequirePermission(menu = MENU, action = "edit")
    public Result<Long> savePosQuota(@Valid @RequestBody AiEmpQuotaDTO.PosQuotaRequest request) {
        String operator = operatorResolver.currentOperatorName();
        Long id = quotaService.savePosQuota(request, operator);
        return Result.success(id);
    }

    @DeleteMapping("/positions/{id}")
    @Operation(summary = "刪除職位額度策略")
    @RequirePermission(menu = MENU, action = "delete")
    public Result<Boolean> deletePosQuota(@PathVariable Long id) {
        quotaService.deletePosQuota(id);
        return Result.success(true);
    }

    @PutMapping("/positions/{id}/status")
    @Operation(summary = "切換職位額度啟用/停用")
    @RequirePermission(menu = MENU, action = "edit")
    public Result<Boolean> togglePosStatus(@PathVariable Long id, @RequestParam Integer status) {
        String operator = operatorResolver.currentOperatorName();
        quotaService.togglePosQuotaStatus(id, status, operator);
        return Result.success(true);
    }

    /* ══════════════════════ 角色額度 ══════════════════════ */

    @GetMapping("/roles")
    @Operation(summary = "查詢角色額度列表")
    @RequirePermission(menu = MENU)
    public Result<List<AiEmpQuotaDTO.RoleQuotaVO>> listRoleQuotas(AiEmpQuotaDTO.QuotaQueryRequest query) {
        return Result.success(quotaService.listRoleQuotas(query));
    }

    @GetMapping("/roles/{id}")
    @Operation(summary = "查詢角色額度詳情")
    @RequirePermission(menu = MENU)
    public Result<AiEmpQuotaDTO.RoleQuotaVO> getRoleQuota(@PathVariable Long id) {
        AiEmpQuotaDTO.RoleQuotaVO vo = quotaService.getRoleQuotaById(id);
        return vo != null ? Result.success(vo) : Result.error("額度策略不存在");
    }

    @PostMapping("/roles")
    @Operation(summary = "新增/更新角色額度策略")
    @RequirePermission(menu = MENU, action = "edit")
    public Result<Long> saveRoleQuota(@Valid @RequestBody AiEmpQuotaDTO.RoleQuotaRequest request) {
        String operator = operatorResolver.currentOperatorName();
        Long id = quotaService.saveRoleQuota(request, operator);
        return Result.success(id);
    }

    @DeleteMapping("/roles/{id}")
    @Operation(summary = "刪除角色額度策略")
    @RequirePermission(menu = MENU, action = "delete")
    public Result<Boolean> deleteRoleQuota(@PathVariable Long id) {
        quotaService.deleteRoleQuota(id);
        return Result.success(true);
    }

    @PutMapping("/roles/{id}/status")
    @Operation(summary = "切換角色額度啟用/停用")
    @RequirePermission(menu = MENU, action = "edit")
    public Result<Boolean> toggleRoleStatus(@PathVariable Long id, @RequestParam Integer status) {
        String operator = operatorResolver.currentOperatorName();
        quotaService.toggleRoleQuotaStatus(id, status, operator);
        return Result.success(true);
    }
}
