package com.mftb.admin.dto;

import lombok.Data;

/** 库存调整单查询参数 */
@Data
public class EamConsumableAdjustQuery {
    private Integer page;
    private Integer size;
    private String itemCode;
    private String itemName;
    private String adjustNo;
    private String direction;
    private String startTime;
    private String endTime;
}
