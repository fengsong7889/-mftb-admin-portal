package com.mftb.admin.dto;

import lombok.Data;

/**
 * 仓库/存放位置新增/更新请求（按省-市-区-详细地址维度）
 */
@Data
public class EamLocationSaveDTO {

    /** 位置编码（人工填写，全局唯一） */
    private String code;

    /** 位置名称 */
    private String name;

    /** 上级位置ID，0 表示顶级 */
    private Long parentId;

    /** 排序号 */
    private Integer sort;

    /** 省份 */
    private String province;

    /** 城市 */
    private String city;

    /** 区县 */
    private String district;

    /** 详细地址（街道、门牌号等） */
    private String address;

    /** 备注 */
    private String remark;
}
