package com.mftb.admin.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

/**
 * 维度权重更新请求
 */
@Data
public class OrganicScoreDimensionRequest {

    /** 维度: 1=商業 2=店鋪 4=平台 */
    @NotNull(message = "维度不能为空")
    private Integer dimension;

    /** 权重百分比（0~100） */
    @NotNull(message = "权重不能为空")
    private Integer weight;
}
