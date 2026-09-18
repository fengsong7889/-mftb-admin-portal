package com.mftb.admin.dto;

import lombok.Data;

/**
 * 耗材分类保存参数
 */
@Data
public class ConsumableCategorySaveDTO {
    private String code;
    private String name;
    private Long parentId;
    private Integer sortOrder;
    private String status;
    private String remark;
}
