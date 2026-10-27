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

    /**
     * 新增员工合同，要求合同编号/类型/开始日期非空。
     * <p>
     * 服务端会强制把传入的 id 置 null，并将 userId 改写为方法第一个参数，
     * 所以调用方无法靠传 id 或 body.userId 越权写入他人合同。
     */
    EmpContract create(Long userId, EmpContract contract);

    /**
     * 修改员工合同。先校该 id 确实属于 userId（requireOwned），
     * 然后逐字段拷贝白名单列，<b>不是全量覆盖</b>：未列入的字段保持库中原值。
     */
    EmpContract update(Long userId, Long id, EmpContract contract);

    /** 删除员工合同；同样先过 requireOwned 归属校验，不可跨人删除 */
    void delete(Long userId, Long id);
}
