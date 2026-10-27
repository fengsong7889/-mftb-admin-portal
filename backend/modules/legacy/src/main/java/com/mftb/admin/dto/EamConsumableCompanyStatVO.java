package com.mftb.admin.dto;

import lombok.Data;
import java.math.BigDecimal;

/** 按公司（品牌+购买公司）维度的统计行 */
@Data
public class EamConsumableCompanyStatVO {
    private Long companyBrand;
    private String companyBrandName;
    private Long purchaseCompanyId;
    private String purchaseCompanyName;
    /** 入库数量（采购+手工+期初） */
    private Integer inboundQty = 0;
    /** 入库金额（采购+手工+期初） */
    private BigDecimal inboundAmount = BigDecimal.ZERO;
    /** 消耗数量（领用出库） */
    private Integer consumeQty = 0;
    /** 消耗金额（领用出库） */
    private BigDecimal consumeAmount = BigDecimal.ZERO;
    /** 退料数量 */
    private Integer returnQty = 0;
    /** 退料金额 */
    private BigDecimal returnAmount = BigDecimal.ZERO;
    /** 当前库存数量（实时） */
    private Integer stockQty = 0;
    /** 当前库存金额（实时） */
    private BigDecimal stockAmount = BigDecimal.ZERO;
}
