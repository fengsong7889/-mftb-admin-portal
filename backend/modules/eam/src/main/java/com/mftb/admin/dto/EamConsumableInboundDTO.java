package com.mftb.admin.dto;

import lombok.Data;

import java.math.BigDecimal;

/**
 * 耗材入库参数（手工入库/期初建账；采购验收入库分流复用同一服务方法）
 */
@Data
public class EamConsumableInboundDTO {
    /** 耗材 ID */
    private Long itemId;
    /** 入库仓库 ID */
    private Long locationId;
    /** 入库数量（正整数） */
    private Integer qty;
    /** 入库单价（成本核算，可空取参考价） */
    private BigDecimal unitCost;
    /** 入库类型：in_purchase=采购入库 / in_manual=手工入库 */
    private String txnType;
    /** 备注 */
    private String remark;
}
