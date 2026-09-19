package com.mftb.admin.dto;

import lombok.Data;

/** 盘点任务创建 DTO */
@Data
public class EamInventoryCreateDTO {

    /** 盘点任务名称 */
    private String taskName;

    /** 盘点人 */
    private String operator;
}
