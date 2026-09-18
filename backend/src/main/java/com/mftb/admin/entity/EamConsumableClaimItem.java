package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.math.BigDecimal;

/**
 * 耗材领用单明细实体
 */
@Data
@TableName("biz_eam_consumable_claim_item")
public class EamConsumableClaimItem {

    @TableId
    private Long id;

    /** 领用单 ID */
    private Long claimId;

    /** 耗材 ID */
    private Long itemId;

    /** 耗材编码快照 */
    private String itemCode;

    /** 耗材名称快照 */
    private String itemName;

    /** 规格型号快照 */
    private String spec;

    /** 单位快照 */
    private String unit;

    /** 领用数量 */
    private Integer qty;

    /** 出库仓库 ID */
    private Long locationId;

    /** 出库仓库名称快照 */
    private String locationName;

    /** 出库成本单价快照（取参考价） */
    private BigDecimal unitCost;
}
