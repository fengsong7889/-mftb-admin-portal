package com.mftb.admin.dto;

import lombok.AllArgsConstructor;
import lombok.Data;

/** 盘点任务创建结果 */
@Data
@AllArgsConstructor
public class EamInventoryCreatedVO {
    private Long id;
    private String taskNo;
}
