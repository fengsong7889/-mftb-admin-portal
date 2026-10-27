package com.mftb.admin.dto;

import lombok.Data;

import java.util.List;

/**
 * 资产标签模板新增/更新请求（更新时字段为 null 表示不修改）
 * <p>
 * 不含 id、status、boundCount 字段 —— id 由路径参数传入、
 * status 只能通过 toggle 接口切换、boundCount 由绑定关系实时聚合。
 */
@Data
public class EamAssetTagSaveDTO {

    /** 标签名称 */
    private String name;

    /** 标签描述 */
    private String description;

    /** 标签背景色（如 #1890FF） */
    private String bgColor;

    /** 标签文字颜色（如 #FFFFFF） */
    private String textColor;

    /** 展示字段配置（资产字段 key 列表） */
    private List<String> displayFields;

    /** 排序 */
    private Integer sort;
}
