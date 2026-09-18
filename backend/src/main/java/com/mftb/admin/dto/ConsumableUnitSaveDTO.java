package com.mftb.admin.dto;

import lombok.Data;

/**
 * 耗材计量单位保存参数
 */
@Data
public class ConsumableUnitSaveDTO {
    private String name;
    private String abbr;
    private Integer sortOrder;
    private String status;
}
