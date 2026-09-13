package com.mftb.admin.dto;

import lombok.Data;

/**
 * 仓库/存放位置新增/更新请求（更新时字段为 null 表示不修改）
 */
@Data
public class EamLocationSaveDTO {

    /** 位置编码（__auto__ 或空表示自动生成） */
    private String code;

    /** 位置名称 */
    private String name;

    /** 上级位置ID，0 表示顶级 */
    private Long parentId;

    /** 位置类型: warehouse/floor/room */
    private String type;

    /** 排序号 */
    private Integer sort;

    /** 详细地址 */
    private String address;

    /** 备注 */
    private String remark;
}
