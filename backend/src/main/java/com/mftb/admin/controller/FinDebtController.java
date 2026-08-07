package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.DebtRepaymentDTO;
import com.mftb.admin.dto.FinDebtBillVO;
import com.mftb.admin.dto.FinDebtPageVO;
import com.mftb.admin.dto.FinDebtQuery;
import com.mftb.admin.service.FinDebtService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 欠款对账接口（欠款对账 / 欠款详情菜单）
 */
@RestController
@RequestMapping("/api/fin/debts")
@RequiredArgsConstructor
public class FinDebtController {

    private final FinDebtService finDebtService;

    /** 欠款单列表（分页 + 品牌待还统计） */
    @GetMapping
    @RequirePermission(menu = "debt-reconcile")
    public Result<FinDebtPageVO> page(FinDebtQuery query) {
        return Result.success(finDebtService.page(query));
    }

    /** 欠款单详情（含还款明细） */
    @GetMapping("/{billNo}")
    @RequirePermission(menu = "debt-reconcile")
    public Result<FinDebtBillVO> detail(@PathVariable String billNo) {
        return Result.success(finDebtService.detail(billNo));
    }

    /** 新增扣款（还款记录） */
    @PostMapping("/{billNo}/repayments")
    @RequirePermission(menu = "debt-reconcile", action = "create")
    public Result<Void> addRepayment(@PathVariable String billNo, @RequestBody DebtRepaymentDTO request) {
        finDebtService.addRepayment(billNo, request);
        return Result.success("扣款记录已新增", null);
    }

    /** 删除还款记录 */
    @DeleteMapping("/repayments/{id}")
    @RequirePermission(menu = "debt-reconcile", action = "delete")
    public Result<Void> deleteRepayment(@PathVariable Long id) {
        finDebtService.deleteRepayment(id);
        return Result.success("还款记录已删除", null);
    }
}
