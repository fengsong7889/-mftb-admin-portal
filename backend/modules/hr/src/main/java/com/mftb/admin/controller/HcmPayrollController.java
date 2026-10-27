package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.PayrollComponent;
import com.mftb.admin.entity.PayrollSalaryStandard;
import com.mftb.admin.service.PayrollService;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;

/**
 * 薪酬基礎接口（{@code /api/hcm/v1/payroll/**}）。
 * <p>
 * 每个方法都显式声明 {@code @RequirePermission}：HCM 路径下还有一层 fail-closed 拦截器，
 * 漏标注的端点会被直接拦成 403（不是放行）。
 */
@RestController
@RequestMapping("/api/hcm/v1/payroll")
@RequiredArgsConstructor
public class HcmPayrollController {

    private final PayrollService payrollService;

    /* ==================== 薪酬項目 ==================== */

    @GetMapping("/components")
    @RequirePermission(menu = "hcm-payroll-component")
    public Result<PageResult<PayrollComponent>> listComponents(@RequestParam(defaultValue = "1") long page,
                                                              @RequestParam(defaultValue = "20") long size,
                                                              @RequestParam(required = false) String keyword,
                                                              @RequestParam(required = false) String componentType,
                                                              @RequestParam(required = false) Integer status) {
        return Result.success(payrollService.listComponents(page, size, keyword, componentType, status));
    }

    @GetMapping("/components/{id}")
    @RequirePermission(menu = "hcm-payroll-component")
    public Result<PayrollComponent> componentDetail(@PathVariable Long id) {
        return Result.success(payrollService.getComponent(id));
    }

    @PostMapping("/components")
    @RequirePermission(menu = "hcm-payroll-component", action = "create")
    public Result<PayrollComponent> createComponent(@RequestBody PayrollComponent entity) {
        entity.setId(null);
        return Result.success("薪資項目已建立", payrollService.saveComponent(entity));
    }

    @PutMapping("/components/{id}")
    @RequirePermission(menu = "hcm-payroll-component", action = "edit")
    public Result<PayrollComponent> updateComponent(@PathVariable Long id, @RequestBody PayrollComponent entity) {
        entity.setId(id);
        return Result.success("薪資項目已保存", payrollService.saveComponent(entity));
    }

    @DeleteMapping("/components/{id}")
    @RequirePermission(menu = "hcm-payroll-component", action = "delete")
    public Result<Void> deleteComponent(@PathVariable Long id) {
        payrollService.deleteComponent(id);
        return Result.success("薪資項目已刪除", null);
    }

    /* ==================== 薪酬標準 ==================== */

    @GetMapping("/standards")
    @RequirePermission(menu = "hcm-payroll-standard")
    public Result<PageResult<PayrollSalaryStandard>> listStandards(
            @RequestParam(required = false) Long employmentId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate asOf,
            @RequestParam(defaultValue = "1") long page,
            @RequestParam(defaultValue = "20") long size) {
        return Result.success(payrollService.listStandards(employmentId, asOf, page, size));
    }

    @GetMapping("/standards/{id}")
    @RequirePermission(menu = "hcm-payroll-standard")
    public Result<PayrollSalaryStandard> standardDetail(@PathVariable Long id) {
        return Result.success(payrollService.getStandard(id));
    }

    @PostMapping("/standards")
    @RequirePermission(menu = "hcm-payroll-standard", action = "create")
    public Result<PayrollSalaryStandard> createStandard(@RequestBody PayrollSalaryStandard entity) {
        entity.setId(null);
        return Result.success("薪酬標準已建立", payrollService.saveStandard(entity));
    }

    @PutMapping("/standards/{id}")
    @RequirePermission(menu = "hcm-payroll-standard", action = "edit")
    public Result<PayrollSalaryStandard> updateStandard(@PathVariable Long id, @RequestBody PayrollSalaryStandard entity) {
        entity.setId(id);
        return Result.success("薪酬標準已保存", payrollService.saveStandard(entity));
    }

    @DeleteMapping("/standards/{id}")
    @RequirePermission(menu = "hcm-payroll-standard", action = "delete")
    public Result<Void> deleteStandard(@PathVariable Long id) {
        payrollService.deleteStandard(id);
        return Result.success("薪酬標準已刪除", null);
    }
}
