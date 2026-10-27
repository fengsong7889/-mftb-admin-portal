package com.mftb.admin.dto;

import lombok.Data;

/** 盘点操作日志视图对象 */
@Data
public class EamInventoryEventVO {
    private Long id;
    private Long itemId;
    private String action;
    private String reason;
    private String beforeJson;
    private String afterJson;
    private Long operatorId;
    private String operatorName;
    private String operatorEmpNo;
    private String createdAt;
}
