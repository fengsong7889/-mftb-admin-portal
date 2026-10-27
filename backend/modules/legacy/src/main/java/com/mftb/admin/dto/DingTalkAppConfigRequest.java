package com.mftb.admin.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

/** 企业内部应用配置请求；密钥只写入，不序列化或生成含密钥的 toString。 */
@Getter
@Setter
public class DingTalkAppConfigRequest {
    @NotBlank(message = "AppKey 不能為空")
    @Size(max = 100, message = "AppKey 不能超過 100 字元")
    @Pattern(regexp = "[A-Za-z0-9_-]+", message = "AppKey 格式不正確")
    private String appKey;

    @Size(max = 256, message = "AppSecret 不能超過 256 字元")
    @JsonProperty(access = JsonProperty.Access.WRITE_ONLY)
    @Schema(accessMode = Schema.AccessMode.WRITE_ONLY, description = "留空保留原密鑰；首次配置或更換 AppKey 時必填")
    private String appSecret;

    @NotBlank(message = "AgentId 不能為空")
    @Pattern(regexp = "[1-9][0-9]{0,18}", message = "AgentId 必須為正整數")
    private String agentId;

    @NotBlank(message = "前端站點地址不能為空")
    @Size(max = 500, message = "前端站點地址不能超過 500 字元")
    private String baseUrl;
}
