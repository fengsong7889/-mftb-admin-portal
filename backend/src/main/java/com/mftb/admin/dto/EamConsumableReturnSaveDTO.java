package com.mftb.admin.dto;

import lombok.Data;
import java.math.BigDecimal;

/** 退料保存参数 */
@Data
public class EamConsumableReturnSaveDTO {
    /** 原领用单ID（可选，关联领用单退料） */
    private Long claimId;
    /** 原领用明细ID（可选） */
    private Long claimItemId;
    /** 耗材ID */
    private Long itemId;
    /** 退回仓库ID */
    private Long locationId;
    /** 退料数量 */
    private Integer qty;
    /** 退回单价（为空时取原出库均价） */
    private BigDecimal unitCost;
    /** 承担部门ID */
    private Long departmentId;
    /** 退料原因 */
    private String reason;
}
