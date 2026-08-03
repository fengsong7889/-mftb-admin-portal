package com.mftb.admin.service;

import com.mftb.admin.entity.FinApproval;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 审批通过后的写入链路（批次 / 明细 / 欠款单 / 账户余额）
 * 业务口径与前端 approvalStore.writeApprovedRecords 保持一致
 */
public interface FinWriteChainService {

    /** 财务主管节点通过后，在同一事务内写入全部业务数据 */
    void writeApprovedRecords(FinApproval approval, LocalDateTime tradeTime);

    /**
     * 广告消费写入: 按充值批次 FIFO 拆分明细（变动类别=广告类型，如無敵星星），
     * 实收按所扣批次实收比例等比例扣减，并同步账户余额
     *
     * @param amount 消费金额（正数，内部取负写入）
     * @return 首条明细ID（供订单 flowNo 关联）
     */
    String writeAdConsume(String groupCode, String groupName, String brand,
                          String storeCode, String storeName, String channel,
                          BigDecimal amount, String changeType, String bd,
                          String remark, String flowNo, LocalDateTime tradeTime);

    /**
     * 广告退款写入: 找回原消费明细按消费占比回退原批次，
     * 实收按对应批次实收比例等比例回补，并同步账户余额（规则: 有实收就按比例变动）
     *
     * @param amount  退款金额（正数，内部取正写入）
     * @param orderNo 原订单号（据此定位原消费明细）
     * @return 首条明细ID
     */
    String writeAdRefund(String groupCode, String groupName, String brand,
                         String storeCode, String storeName, String channel,
                         BigDecimal amount, String changeType, String bd,
                         String remark, String orderNo, LocalDateTime tradeTime);
}
