package com.mftb.admin.dto;

import lombok.Data;
import java.math.BigDecimal;

/** 库存调整保存参数 */
@Data
public class EamConsumableAdjustSaveDTO {
    /** 耗材ID */
    private Long itemId;
    /** 仓库ID */
    private Long locationId;
    /** 调整方向：in=盘盈/out=盘亏 */
    private String direction;
    /** 调整数量（正整数） */
    private Integer qty;
    /** 调整单价（盘盈时必填，用于成本入账） */
    private BigDecimal unitCost;
    /** 调整原因 */
    private String reason;
}
