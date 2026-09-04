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

        @NotBlank(message = "供应商标识不能为空")
        private String providerKey;

        @NotBlank(message = "供应商名称不能为空")
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
        private Integer status;
        private Integer isDefault;
        private String configJson;
        private Integer sortOrder;
        private String createdAt;
        private String updatedAt;
    }
}
