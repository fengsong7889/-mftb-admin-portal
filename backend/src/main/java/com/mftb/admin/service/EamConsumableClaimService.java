package com.mftb.admin.service;

import com.mftb.admin.dto.*;

/**
 * 耗材领用服务接口（申请 → 审批 → 出库核销，无归还流程）
 */
public interface EamConsumableClaimService {

    /** 管理视图分页 */
    PageResult<EamConsumableClaimVO> page(EamConsumableClaimQuery query);

    /** 领用单详情（含明细） */
    EamConsumableClaimVO detail(long claimId);

    /** 我的领用分页（当前登录人） */
    PageResult<EamConsumableClaimVO> myClaims(EamConsumableClaimQuery query);

    /** 我的领用详情（服务层校验归属） */
    EamConsumableClaimVO myDetail(long claimId);

    /** 提交领用申请（占用库存 locked_qty） */
    long submit(EamConsumableClaimSaveDTO dto);

    /** 审批（pass=true 通过保持占用；pass=false 驳回并释放占用） */
    void approve(EamConsumableApproveDTO dto);

    /** 出库核销（approved → issued，扣减库存 + 写出库流水） */
    void issue(long claimId);

    /** 撤销（pending/approved → cancelled，释放占用） */
    void cancel(long claimId, String reason);
}
