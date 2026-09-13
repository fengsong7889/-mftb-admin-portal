package com.mftb.admin.dto;

import lombok.Data;

/**
 * 资产分类新增/更新请求
 * <p>
 * 更新时字段为 null 表示不修改（前端表单未提交的字段），非 null（含空串）则覆盖
 */
@Data
public class EamCategorySaveDTO {

    /** 分类编码（更新时为 null 表示不修改） */
    private String code;

    /** 分类名称 */
    private String name;

    /** 上级分类ID，0 表示顶级 */
    private Long parentId;

    /** 状态: enabled/disabled */
    private String status;

    /** 参数模板(JSON字符串) */
    private String paramTemplate;

    /** 排序号 */
    private Integer sort;

    /** 备注 */
    private String remark;
}
