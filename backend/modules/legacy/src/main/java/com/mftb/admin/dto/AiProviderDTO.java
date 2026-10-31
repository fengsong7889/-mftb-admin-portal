package com.mftb.admin.dto;

import lombok.Data;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.io.Serializable;

/**
 * AI 供应商 DTO 聚合（查询/保存/响应）
 */
public class AiProviderDTO {

    /**
     * API Key 可用状态（与前端 AI_API_KEY_STATUS 常量一一对应）。
     * <p>必须是服务端实算的三态：旧口径只用「脱敏串是否为空」表达，导致密钥轮换后
     * 「配过但解不开」被显示成「未配置」，管理员误判为没保存成功。
     */
    public static final int API_KEY_UNSET = 0;
    public static final int API_KEY_OK = 1;
    public static final int API_KEY_STALE = 2;

    /**
     * AI 供应商查询请求
     */
    @Data
    public static class ProviderQueryRequest implements Serializable {
        private static final long serialVersionUID = 1L;

        private String providerKey;
        private String name;
        private Integer status;
    }

    /**
     * AI 供应商新增/编辑请求
     */
    @Data
    public static class ProviderSaveRequest implements Serializable {
        private static final long serialVersionUID = 1L;

        @NotBlank(message = "供應商標識不能為空")
        private String providerKey;

        @NotBlank(message = "供應商名稱不能為空")
        private String name;

        private String description;

        private String apiUrlBase;

        private String apiKey;

        private Integer status;

        private Integer isDefault;

        private String configJson;

        private Integer sortOrder;
    }

    /**
     * AI 供应商响应对象
     */
    @Data
    public static class ProviderVO implements Serializable {
        private static final long serialVersionUID = 1L;

        private Long id;
        private String providerKey;
        private String name;
        private String description;
        private String apiUrlBase;
        private String apiKeyMasked; // 脱敏后的 API Key
        private Integer apiKeyStatus; // 0=未配置 1=已配置 2=密钥已失效（解不开，需重填）
        private Integer status;
        private Integer isDefault;
        private String configJson;
        private Integer sortOrder;
        private String createdAt;
        private String updatedAt;
    }
}
