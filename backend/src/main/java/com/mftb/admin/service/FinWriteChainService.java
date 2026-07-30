package com.mftb.admin.service;

import com.mftb.admin.entity.FinApproval;

import java.time.LocalDateTime;

/**
 * 审批通过后的写入链路（批次 / 明细 / 欠款单 / 账户余额）
 * 业务口径与前端 approvalStore.writeApprovedRecords 保持一致
 */
public interface FinWriteChainService {

    /** 财务主管节点通过后，在同一事务内写入全部业务数据 */
    void writeApprovedRecords(FinApproval approval, LocalDateTime tradeTime);
}
