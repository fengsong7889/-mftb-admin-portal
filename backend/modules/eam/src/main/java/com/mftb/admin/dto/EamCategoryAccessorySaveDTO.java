package com.mftb.admin.dto;

import lombok.Data;

/**
 * 分类配件保存 DTO（单条新增/修改）
 */
@Data
public class EamCategoryAccessorySaveDTO {

    /** 配件名称 */
    private String name;

    /** 默认数量 */
    private Integer defaultQty;

    /** 状态：1=启用, 0=停用 */
    private Integer status;
}
