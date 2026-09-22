package com.mftb.admin.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

/**
 * 耗材看板视图对象
 */
@Data
public class EamConsumableDashboardVO {
    /** 启用中的耗材品类数 */
    private Integer itemKinds;
    /** 库存总数量 */
    private Integer totalStockQty;
    /** 库存总金额（按移动加权平均实际成本汇总） */
    private BigDecimal totalStockValue;
    /** 本月消耗金额（领用出库实际成本） */
    private BigDecimal monthConsumeAmount;
    /** 低库存预警品类数 */
    private Integer alertCount;
    /** 待审批领用单数 */
    private Integer pendingApproveCount;
    /** 本月领用单数 */
    private Integer monthClaimCount;

    /** 预警耗材清单（可用库存 < 安全库存，按缺口倒序） */
    private List<EamConsumableItemVO> alertItems;
    /** 最近出入库流水（Top 10） */
    private List<EamConsumableTxnVO> recentTxns;
}
