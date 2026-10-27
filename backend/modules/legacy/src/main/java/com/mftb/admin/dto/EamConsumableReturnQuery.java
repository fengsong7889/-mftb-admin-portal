package com.mftb.admin.dto;

import lombok.Data;

/** 退料单查询参数 */
@Data
public class EamConsumableReturnQuery {
    private Integer page;
    private Integer size;
    private String itemCode;
    private String itemName;
    private String returnNo;
    private String applicantName;
    private String startTime;
    private String endTime;
}
