package com.mftb.admin.dto;

import lombok.Data;
import java.math.BigDecimal;

/** 按部门维度的消耗统计行 */
@Data
public class EamConsumableDeptStatVO {
    private Long departmentId;
    private String department;
    /** 消耗数量 */
    private Integer consumeQty = 0;
    /** 消耗金额（实际成本） */
    private BigDecimal consumeAmount = BigDecimal.ZERO;
    /** 领用单数 */
    private Integer claimCount = 0;
}
