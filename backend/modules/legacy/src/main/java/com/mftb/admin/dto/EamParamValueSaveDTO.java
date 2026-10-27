package com.mftb.admin.dto;

import lombok.Data;

/**
 * 参数值新增/更新请求（更新时字段为 null 表示不修改）
 */
@Data
public class EamParamValueSaveDTO {

    /** 所属参数类型编码（仅新增使用） */
    private String paramTypeCode;

    /** 所属分类编码（仅新增使用） */
    private String categoryCode;

    /** 参数值 */
    private String value;

    /** 排序号 */
    private Integer sort;

    /** 状态: enabled/disabled */
    private String status;
}
