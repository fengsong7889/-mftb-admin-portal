package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.dto.PayrollEnrollmentVO;
import com.mftb.admin.entity.PayrollBenefitPlan;
import com.mftb.admin.entity.PayrollEnrollment;
import com.mftb.admin.service.PayrollBenefitService;
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
 * 福利參保接口（{@code /api/hcm/v1/payroll/benefits/**}）。
 * <p>
 * 所有方法都显式声明 {@code @RequirePermission}：HCM 路径下有 fail-closed 拦截器，漏标注直接 403。
 */
@RestController
@RequestMapping("/api/hcm/v1/payroll")
@RequiredArgsConstructor
public class HcmPayrollBenefitController {

    private final PayrollBenefitService benefitService;

    /* ==================== 參保方案 ==================== */

    @GetMapping("/plans")
    @RequirePermission(menu = "hcm-payroll-benefit")
    public Result<PageResult<PayrollBenefitPlan>> listPlans(@RequestParam(defaultValue = "1") long page,
                                                           @RequestParam(defaultValue = "20") long size,
                                                           @RequestParam(required = false) String keyword,
                                                           @RequestParam(required = false) String planType,
                                                           @RequestParam(required = false) String jurisdiction,
                                                           @RequestParam(required = false) Integer status) {
        return Result.success(benefitService.listPlans(page, size, keyword, planType, jurisdiction, status));
    }

    @GetMapping("/plans/{id}")
    @RequirePermission(menu = "hcm-payroll-benefit")
    public Result<PayrollBenefitPlan> planDetail(@PathVariable Long id) {
        return Result.success(benefitService.getPlan(id));
    }

    @PostMapping("/plans")
    @RequirePermission(menu = "hcm-payroll-benefit", action = "create")
    public Result<PayrollBenefitPlan> createPlan(@RequestBody PayrollBenefitPlan entity) {
        entity.setId(null);
        return Result.success("參保方案已建立", benefitService.savePlan(entity));
    }

    @PutMapping("/plans/{id}")
    @RequirePermission(menu = "hcm-payroll-benefit", action = "edit")
    public Result<PayrollBenefitPlan> updatePlan(@PathVariable Long id, @RequestBody PayrollBenefitPlan entity) {
        entity.setId(id);
        return Result.success("參保方案已保存", benefitService.savePlan(entity));
    }

    @DeleteMapping("/plans/{id}")
    @RequirePermission(menu = "hcm-payroll-benefit", action = "delete")
    public Result<Void> deletePlan(@PathVariable Long id) {
        benefitService.deletePlan(id);
        return Result.success("參保方案已刪除", null);
    }

    /* ==================== 人員參保 ==================== */

    @GetMapping("/enrollments")
    @RequirePermission(menu = "hcm-payroll-benefit")
    public Result<PageResult<PayrollEnrollmentVO>> listEnrollments(
            @RequestParam(defaultValue = "1") long page,
            @RequestParam(defaultValue = "20") long size,
            @RequestParam(required = false) Long employmentId,
            @RequestParam(required = false) Long planId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate asOf,
            @RequestParam(required = false) Boolean activeOnly) {
        return Result.success(benefitService.listEnrollments(page, size, employmentId, planId, asOf, activeOnly));
    }

    @GetMapping("/enrollments/{id}")
    @RequirePermission(menu = "hcm-payroll-benefit")
    public Result<PayrollEnrollment> enrollmentDetail(@PathVariable Long id) {
        return Result.success(benefitService.getEnrollment(id));
    }

    @PostMapping("/enrollments")
    @RequirePermission(menu = "hcm-payroll-benefit", action = "create")
    public Result<PayrollEnrollment> createEnrollment(@RequestBody PayrollEnrollment entity) {
        entity.setId(null);
        return Result.success("參保記錄已建立", benefitService.saveEnrollment(entity));
    }

    @PutMapping("/enrollments/{id}")
    @RequirePermission(menu = "hcm-payroll-benefit", action = "edit")
    public Result<PayrollEnrollment> updateEnrollment(@PathVariable Long id, @RequestBody PayrollEnrollment entity) {
        entity.setId(id);
        return Result.success("參保記錄已保存", benefitService.saveEnrollment(entity));
    }

    @DeleteMapping("/enrollments/{id}")
    @RequirePermission(menu = "hcm-payroll-benefit", action = "delete")
    public Result<Void> deleteEnrollment(@PathVariable Long id) {
        benefitService.deleteEnrollment(id);
        return Result.success("參保記錄已刪除", null);
    }
}
