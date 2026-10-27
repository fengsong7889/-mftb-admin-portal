package com.mftb.admin.dto;

import lombok.Data;

/** 库存调拨单查询参数 */
@Data
public class EamConsumableTransferQuery {
    private Integer page;
    private Integer size;
    private String itemCode;
    private String itemName;
    private String transferNo;
    private String startTime;
    private String endTime;
}
