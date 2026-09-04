package com.mftb.admin.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * LLM 用量上报请求（由开发环境 LLM 代理在转发成功后回传）
 * 注意：不包含 username —— 账号一律取自 JWT，防止客户端冒用他人身份记账
 */
@Data
public class LlmUsageRecordRequest {

    /** 引擎模式: auto/primary/off-peak */
    @NotBlank
    private String mode;

    /** 路由通道: primary / off-peak */
    @NotBlank
    private String channel;

    /** 实际调用的模型（响应回传的真实模型，回落时为接管模型） */
    @NotBlank
    private String model;

    /** 输入 tokens */
    @Min(0)
    private int promptTokens;

    /** 输出 tokens */
    @Min(0)
    private int completionTokens;

    /** 命中缓存的输入 tokens（可选，按缓存单价计费） */
    @Min(0)
    private int cachedTokens;
}
