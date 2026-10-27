package com.mftb.admin.dto;

import lombok.Data;
import java.math.BigDecimal;

/** 按耗材维度的统计行 */
@Data
public class EamConsumableItemStatVO {
    private Long itemId;
    private String itemCode;
    private String itemName;
    private String spec;
    private String unit;
    /** 入库数量 */
    private Integer inboundQty = 0;
    /** 入库金额 */
    private BigDecimal inboundAmount = BigDecimal.ZERO;
    /** 消耗数量（领用出库） */
    private Integer consumeQty = 0;
    /** 消耗金额（实际成本） */
    private BigDecimal consumeAmount = BigDecimal.ZERO;
    /** 当前库存数量（实时） */
    private Integer stockQty = 0;
    /** 当前库存金额（实时） */
    private BigDecimal stockAmount = BigDecimal.ZERO;
}
