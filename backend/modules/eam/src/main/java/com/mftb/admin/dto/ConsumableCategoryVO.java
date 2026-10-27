package com.mftb.admin.dto;

import lombok.Data;

/**
 * 耗材分类 VO
 */
@Data
public class ConsumableCategoryVO {
    private Long id;
    private String code;
    private String name;
    private Long parentId;
    private String parentName;
    private Integer sortOrder;
    private String status;
    private String remark;
    private String createdBy;
    private String updatedBy;
    private String updatedAt;
}
