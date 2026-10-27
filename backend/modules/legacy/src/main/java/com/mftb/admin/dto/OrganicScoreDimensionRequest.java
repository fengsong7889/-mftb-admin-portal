package com.mftb.admin.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

/**
 * 维度权重更新请求
 */
@Data
public class OrganicScoreDimensionRequest {

    /** 维度: 1=商业 2=店铺 4=平台 */
    @NotNull(message = "維度不能為空")
    private Integer dimension;

    /** 权重百分比（0~100） */
    @NotNull(message = "權重不能為空")
    private Integer weight;
}
