package com.mftb.admin.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * 分词请求
 */
@Data
public class SegmentRequest {

    /** 待分词文本 */
    @NotBlank(message = "文本不能为空")
    private String text;
}
