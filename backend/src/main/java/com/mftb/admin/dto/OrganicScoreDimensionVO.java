package com.mftb.admin.dto;

import lombok.Data;

/**
 * 自然流量评分维度权重 VO
 */
@Data
public class OrganicScoreDimensionVO {

    private Long id;

    /** 维度: 1=商业 2=店铺 4=平台 */
    private Integer dimension;

    /** 权重百分比 */
    private Integer weight;

    /** 排序号 */
    private Integer sortOrder;
}
