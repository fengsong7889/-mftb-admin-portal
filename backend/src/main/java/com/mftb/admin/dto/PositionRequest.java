package com.mftb.admin.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * 职位新增/编辑请求
 */
@Data
public class PositionRequest {

    @NotBlank(message = "职位名称不能为空")
    private String name;

    /** 职级序列: M=管理 T=技术 P=专业 */
    @NotBlank(message = "职级序列不能为空")
    private String sequence;

    /** 职级 (如 M3 / T5 / P2) */
    @NotBlank(message = "职级不能为空")
    private String jobLevel;
}
