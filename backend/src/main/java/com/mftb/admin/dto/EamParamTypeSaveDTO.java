package com.mftb.admin.dto;

import lombok.Data;

/**
 * 参数类型新增/更新请求（更新时字段为 null 表示不修改）
 */
@Data
public class EamParamTypeSaveDTO {

    /** 所属分类编码（仅新增使用） */
    private String categoryCode;

    /** 参数编码（仅新增使用） */
    private String code;

    /** 参数名称 */
    private String name;

    /** 单位 */
    private String unit;

    /** 值类型: select/input */
    private String valueType;

    /** 状态: enabled/disabled */
    private String status;

    /** 排序号 */
    private Integer sort;
}
