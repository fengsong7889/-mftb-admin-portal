package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.dto.PayrollPayslipDetailVO;
import com.mftb.admin.dto.PayrollPayslipVO;
import com.mftb.admin.entity.PayrollRun;
import com.mftb.admin.service.PayrollRunService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 核算批次與工資單接口（{@code /api/hcm/v1/payroll/runs/**}）。
 * <p>
 * 所有方法显式声明 {@code @RequirePermission}：HCM 路径下有 fail-closed 拦截器，漏标注直接 403。
 */
@RestController
@RequestMapping("/api/hcm/v1/payroll")
@RequiredArgsConstructor
public class HcmPayrollRunController {

    private final PayrollRunService runService;

    @GetMapping("/runs")
    @RequirePermission(menu = "hcm-payroll-run")
    public Result<PageResult<PayrollRun>> listRuns(@RequestParam(defaultValue = "1") long page,
                                                   @RequestParam(defaultValue = "20") long size,
                                                   @RequestParam(required = false) String period,
                                                   @RequestParam(required = false) String cityCode,
                                                   @RequestParam(required = false) String status) {
        return Result.success(runService.listRuns(page, size, period, cityCode, status));
    }

    @GetMapping("/runs/{id}")
    @RequirePermission(menu = "hcm-payroll-run")
    public Result<PayrollRun> runDetail(@PathVariable Long id) {
        return Result.success(runService.getRun(id));
    }

    @PostMapping("/runs")
    @RequirePermission(menu = "hcm-payroll-run", action = "create")
    public Result<PayrollRun> createRun(@RequestBody PayrollRun entity) {
        entity.setId(null);
        return Result.success("核算批次已建立", runService.createRun(entity));
    }

    @DeleteMapping("/runs/{id}")
    @RequirePermission(menu = "hcm-payroll-run", action = "delete")
    public Result<Void> deleteRun(@PathVariable Long id) {
        runService.deleteRun(id);
        return Result.success("核算批次已刪除", null);
    }

    /** 試算：缺薪酬標準會整批拒絕並列出是哪個雇傭 */
    @PostMapping("/runs/{id}/calculate")
    @RequirePermission(menu = "hcm-payroll-run", action = "edit")
    public Result<PayrollRun> calculate(@PathVariable Long id) {
        return Result.success("試算完成", runService.calculate(id));
    }

    /** 鎖定：鎖定後不可重算 */
    @PostMapping("/runs/{id}/lock")
    @RequirePermission(menu = "hcm-payroll-run", action = "edit")
    public Result<PayrollRun> lock(@PathVariable Long id) {
        return Result.success("批次已鎖定", runService.lock(id));
    }

    @GetMapping("/runs/{id}/payslips")
    @RequirePermission(menu = "hcm-payroll-run")
    public Result<PageResult<PayrollPayslipVO>> listPayslips(@PathVariable Long id,
                                                             @RequestParam(defaultValue = "1") long page,
                                                             @RequestParam(defaultValue = "20") long size) {
        return Result.success(runService.listPayslips(id, page, size));
    }

    @GetMapping("/payslips/{id}")
    @RequirePermission(menu = "hcm-payroll-run")
    public Result<PayrollPayslipDetailVO> payslipDetail(@PathVariable Long id) {
        return Result.success(runService.getPayslipDetail(id));
    }
}
