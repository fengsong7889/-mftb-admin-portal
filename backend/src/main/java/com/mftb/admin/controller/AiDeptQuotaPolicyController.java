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

@RestController
@RequestMapping("/api/ai/dept-quota")
@RequiredArgsConstructor
@Tag(name = "AI 智能中心 - 部門額度", description = "部門額度策略管理")
public class AiDeptQuotaPolicyController {

    /** 本菜单标识（sys_menu.menu_key），部门额度页 */
    private static final String MENU = "ai-dept-quota";

    private final AiDeptQuotaService deptQuotaService;
    private final OperatorResolver operatorResolver;

    @GetMapping
    @Operation(summary = "查詢部門額度列表")
    @RequirePermission(menu = MENU)
    public Result<List<AiDeptQuotaDTO.DeptQuotaVO>> listDeptQuotas(AiDeptQuotaDTO.DeptQuotaQueryRequest query) {
        return Result.success(deptQuotaService.listDeptQuotas(query));
    }

    @GetMapping("/{id}")
    @Operation(summary = "查詢部門額度詳情")
    @RequirePermission(menu = MENU)
    public Result<AiDeptQuotaDTO.DeptQuotaVO> getDeptQuota(@PathVariable Long id) {
        AiDeptQuotaDTO.DeptQuotaVO vo = deptQuotaService.getDeptQuotaById(id);
        return vo != null ? Result.success(vo) : Result.error("額度策略不存在");
    }

    @PostMapping
    @Operation(summary = "新增/更新部門額度策略")
    @RequirePermission(menu = MENU, action = "edit")
    public Result<Long> saveDeptQuota(@Valid @RequestBody AiDeptQuotaDTO.DeptQuotaRequest request) {
        String operator = operatorResolver.currentOperatorName();
        Long id = deptQuotaService.saveDeptQuota(request, operator);
        return Result.success(id);
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "刪除部門額度策略")
    @RequirePermission(menu = MENU, action = "delete")
    public Result<Boolean> deleteDeptQuota(@PathVariable Long id) {
        deptQuotaService.deleteDeptQuota(id);
        return Result.success(true);
    }

    @PutMapping("/{id}/status")
    @Operation(summary = "切換部門額度啟用/停用")
    @RequirePermission(menu = MENU, action = "edit")
    public Result<Boolean> toggleStatus(@PathVariable Long id, @RequestParam Integer status) {
        String operator = operatorResolver.currentOperatorName();
        deptQuotaService.toggleDeptQuotaStatus(id, status, operator);
        return Result.success(true);
    }
}
