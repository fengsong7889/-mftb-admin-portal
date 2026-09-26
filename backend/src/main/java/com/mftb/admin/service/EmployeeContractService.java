package com.mftb.admin.service;

import com.mftb.admin.dto.ContractExpirySummaryVO;
import com.mftb.admin.dto.ContractLedgerVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.EmpContract;

import java.util.List;

/**
 * 员工合同台账服务 (P1-B)
 */
public interface EmployeeContractService {

    /** 某员工的合同列表（按开始日期倒序） */
    List<EmpContract> listByUserId(Long userId);

    /**
     * 跨员工合同全局台账（分页 + 员工/关键字/类型/主体/状态筛选）
     *
     * @param expiryBucket 到期分桶：all(默认) / expired(已过期未处理) / due30 / due60 / due90
     */
    PageResult<ContractLedgerVO> ledger(long page, long size, String keyword,
                                        String company, String contractType, String status,
                                        String expiryBucket);

    /** 合同到期预警汇总（P0）：各分桶数量 + 最近到期明细 */
    ContractExpirySummaryVO expirySummary(int days);

    EmpContract create(Long userId, EmpContract contract);

    EmpContract update(Long userId, Long id, EmpContract contract);

    void delete(Long userId, Long id);
}
