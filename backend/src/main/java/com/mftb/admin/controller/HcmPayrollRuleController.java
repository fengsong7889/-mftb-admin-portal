package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.PayrollRuleSet;
import com.mftb.admin.entity.PayrollTaxBracket;
import com.mftb.admin.service.PayrollRuleService;
import lombok.Data;
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
import java.util.List;

/**
 * 薪酬規則接口（{@code /api/hcm/v1/payroll/rule-sets/**}）。
 * <p>
 * 所有方法显式声明 {@code @RequirePermission}：HCM 路径下有 fail-closed 拦截器，漏标注直接 403。
 */
@RestController
@RequestMapping("/api/hcm/v1/payroll")
@RequiredArgsConstructor
public class HcmPayrollRuleController {

    private final PayrollRuleService ruleService;

    @GetMapping("/rule-sets")
    @RequirePermission(menu = "hcm-payroll-rule")
    public Result<PageResult<PayrollRuleSet>> listRuleSets(@RequestParam(defaultValue = "1") long page,
                                                           @RequestParam(defaultValue = "20") long size,
                                                           @RequestParam(required = false) String keyword,
                                                           @RequestParam(required = false) String jurisdiction,
                                                           @RequestParam(required = false) Integer status) {
        return Result.success(ruleService.listRuleSets(page, size, keyword, jurisdiction, status));
    }

    @GetMapping("/rule-sets/{id}")
    @RequirePermission(menu = "hcm-payroll-rule")
    public Result<PayrollRuleSet> ruleSetDetail(@PathVariable Long id) {
        return Result.success(ruleService.getRuleSet(id));
    }

    @PostMapping("/rule-sets")
    @RequirePermission(menu = "hcm-payroll-rule", action = "create")
    public Result<PayrollRuleSet> createRuleSet(@RequestBody PayrollRuleSet entity) {
        entity.setId(null);
        return Result.success("薪酬規則集已建立", ruleService.saveRuleSet(entity));
    }

    @PutMapping("/rule-sets/{id}")
    @RequirePermission(menu = "hcm-payroll-rule", action = "edit")
    public Result<PayrollRuleSet> updateRuleSet(@PathVariable Long id, @RequestBody PayrollRuleSet entity) {
        entity.setId(id);
        return Result.success("薪酬規則集已保存", ruleService.saveRuleSet(entity));
    }

    @DeleteMapping("/rule-sets/{id}")
    @RequirePermission(menu = "hcm-payroll-rule", action = "delete")
    public Result<Void> deleteRuleSet(@PathVariable Long id) {
        ruleService.deleteRuleSet(id);
        return Result.success("薪酬規則集已刪除", null);
    }

    /** 复制上一套规则（城市参数年年只改几个数，从空白新建要重录十几档级距） */
    @PostMapping("/rule-sets/{id}/copy")
    @RequirePermission(menu = "hcm-payroll-rule", action = "create")
    public Result<PayrollRuleSet> copyRuleSet(@PathVariable Long id, @RequestBody CopyRequest request) {
        return Result.success("薪酬規則集已複製",
                ruleService.copyRuleSet(id, request.getNewCode(), request.getNewName(),
                        request.getEffectiveFrom(), request.getEffectiveTo()));
    }

    @GetMapping("/rule-sets/{id}/brackets")
    @RequirePermission(menu = "hcm-payroll-rule")
    public Result<List<PayrollTaxBracket>> listBrackets(@PathVariable Long id) {
        return Result.success(ruleService.listBrackets(id));
    }

    /** 级距整体替换：级距是一个整体，逐条改容易出现空档或重叠 */
    @PutMapping("/rule-sets/{id}/brackets")
    @RequirePermission(menu = "hcm-payroll-rule", action = "edit")
    public Result<List<PayrollTaxBracket>> saveBrackets(@PathVariable Long id,
                                                        @RequestBody List<PayrollTaxBracket> brackets) {
        return Result.success("個稅級距已保存", ruleService.saveBrackets(id, brackets));
    }

    /** 复制请求体（只带新期间与新编码，其余口径从源规则集继承） */
    @Data
    public static class CopyRequest {
        private String newCode;
        private String newName;
        @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
        private LocalDate effectiveFrom;
        @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
        private LocalDate effectiveTo;
    }
}
