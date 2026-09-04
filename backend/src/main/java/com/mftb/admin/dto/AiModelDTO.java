package com.mftb.admin.dto;

import lombok.Data;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.io.Serializable;
import java.math.BigDecimal;

/**
 * AI 模型 DTO 聚合（查询/保存/响应）
 *
 * 2026-09 整改：
 * - 增加能力维度（vision/functionCalling/jsonMode/streaming/thinkingMode）与多模态字段
 * - 增加计费扩展（cachedInputPrice/currency）与限流（concurrencyLimit）
 */
public class AiModelDTO {

    /**
     * AI 模型查询请求
     */
    @Data
    public static class ModelQueryRequest implements Serializable {
        private static final long serialVersionUID = 1L;

        private String modelKey;
        private String name;
        private String type;
        private Integer status;
        /** 模态过滤：text/image/audio/video（可选） */
        private String modality;
    }

    /**
     * AI 模型新增/编辑请求
     */
    @Data
    public static class ModelSaveRequest implements Serializable {
        private static final long serialVersionUID = 1L;

        @NotBlank(message = "模型标识不能为空")
        private String modelKey;

        @NotBlank(message = "模型名称不能为空")
        private String name;

        private Long providerId;

        private String version;

        private String description;

        private String apiCompat;

        private String modalities;

        private Integer visionSupport;

        private Integer functionCalling;

        private Integer jsonMode;

        private Integer streaming;

        private Integer thinkingMode;

        private String type;

        /** 部署类型：cloud=公有云 private=私有化部署 */
        private String deployType;

        private Integer contextWindow;

        private Integer maxOutputTokens;

        private Double inputPrice;

        private Double outputPrice;

        private Double cachedInputPrice;

        private String currency;

        private Integer concurrencyLimit;

        private Integer status;

        private Integer sortOrder;

        private String updatedBy;
    }

    /**
     * AI 模型响应对象
     */
    @Data
    public static class ModelVO implements Serializable {
        private static final long serialVersionUID = 1L;

        private Long id;
        private Long providerId;
        private String providerName; // 关联供应商名称
        private String modelKey;
        private String name;
        private String version;
        private String description;
        private String apiCompat;
        private String modalities;
        private Integer visionSupport;
        private Integer functionCalling;
        private Integer jsonMode;
        private Integer streaming;
        private Integer thinkingMode;
        private String type;
        private String deployType;
        private Integer contextWindow;
        private Integer maxOutputTokens;
        private Double inputPrice;
        private Double outputPrice;
        private Double cachedInputPrice;
        private String currency;
        private Integer concurrencyLimit;
        private Integer status;
        private Integer sortOrder;
        private String updatedBy;
        private String createdAt;
        private String updatedAt;
    }
}
