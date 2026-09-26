package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.ContractExpirySummaryVO;
import com.mftb.admin.dto.ContractLedgerVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.service.EmployeeContractService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 合同全局台账接口 (P1-B)
 * <p>
 * 跨员工查看/筛选合同；查看权限归入独立菜单 {@code contract-ledger}（可单独授权），
 * 并通过 anyOf 兼容存量 employee-management 授权（拆分前经员工页按钮进入），避免拆分瞬间断访。
 * 新增/编辑/删除仍在员工详情内维护（employee-management）。
 */
@RestController
@RequestMapping("/api/contracts")
@RequiredArgsConstructor
@Tag(name = "集团人事 - 合同台账", description = "跨员工合同全局台账查询")
public class EmployeeContractController {

    private final EmployeeContractService employeeContractService;

    /** 合同全局台账（分页 + 关键字/签约主体/类型/状态/到期分桶筛选） */
    @GetMapping
    @RequirePermission(menu = "contract-ledger", anyOf = {"employee-management"})
    @Operation(summary = "合同全局台账分页查询")
    public Result<PageResult<ContractLedgerVO>> ledger(
            @RequestParam(defaultValue = "1") long page,
            @RequestParam(defaultValue = "10") long size,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String company,
            @RequestParam(required = false) String contractType,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String expiryBucket) {
        return Result.success(employeeContractService.ledger(
                page, size, keyword, company, contractType, status, expiryBucket));
    }

    /** 合同到期预警汇总（P0）：已过期/30/60/90 天分桶数量 + 最近到期明细 */
    @GetMapping("/expiry-summary")
    @RequirePermission(menu = "contract-ledger", anyOf = {"employee-management"})
    @Operation(summary = "合同到期预警汇总")
    public Result<ContractExpirySummaryVO> expirySummary(@RequestParam(defaultValue = "90") int days) {
        return Result.success(employeeContractService.expirySummary(days));
    }
}
