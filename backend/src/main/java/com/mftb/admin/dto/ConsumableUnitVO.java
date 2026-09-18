package com.mftb.admin.dto;

import lombok.Data;

/**
 * 耗材计量单位 VO
 */
@Data
public class ConsumableUnitVO {
    private Long id;
    private String name;
    private String abbr;
    private Integer sortOrder;
    private String status;
    private String createdBy;
    private String updatedBy;
    private String updatedAt;
}
