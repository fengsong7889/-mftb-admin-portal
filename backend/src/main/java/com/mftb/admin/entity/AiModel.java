package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * AI 模型实体
 *
 * 字段扩展说明（2026-09 整改）：
 * - version: 模型版本号（如 DeepSeek-V4-Flash-0731）
 * - api_compat: API 兼容格式（openai/anthropic/gemini），决定代理网关如何路由请求
 * - modalities: 多模态支持（text/image/audio/video），逗号分隔
 * - vision_support/function_calling/json_mode/streaming/thinking_mode: 能力开关
 * - cached_input_price: 缓存命中输入价（部分模型支持）
 * - currency: 计费币种
 * - concurrency_limit: 并发限制（TPM 总量）
 * - updated_by: 最后更新人
 */
@Data
@TableName("ai_model")
public class AiModel {

    @TableId
    private Long id;

    /** 供应商 ID（外键） */
    private Long providerId;

    /** 模型标识 */
    private String modelKey;

    /** 模型名称 */
    private String name;

    /** 模型版本号（如 DeepSeek-V4-Flash-0731） */
    private String version;

    /** 模型描述 */
    private String description;

    /** API 兼容格式：openai / anthropic / gemini */
    private String apiCompat;

    /** 支持模态：text,image,audio,video（逗号分隔） */
    private String modalities;

    /** 是否支持图像理解 */
    private Integer visionSupport;

    /** 是否支持工具调用（Function Calling / Tool Use） */
    private Integer functionCalling;

    /** 是否支持 JSON 模式结构化输出 */
    private Integer jsonMode;

    /** 是否支持流式响应（SSE） */
    private Integer streaming;

    /** 是否支持思考模式（深度思考 / Reasoning） */
    private Integer thinkingMode;

    /** 模型类型：chat/completion/embedding/token_count */
    private String type;

    /** 部署类型：cloud=公有云 private=私有化部署（數據不出域策略僅可選私有化模型） */
    private String deployType;

    /** 上下文窗口大小（tokens） */
    private Integer contextWindow;

    /** 最大输出 tokens */
    private Integer maxOutputTokens;

    /** 输入价格（每百万 tokens） */
    private BigDecimal inputPrice;

    /** 输出价格（每百万 tokens） */
    private BigDecimal outputPrice;

    /** 缓存命中输入价（每百万 tokens，部分模型支持） */
    private BigDecimal cachedInputPrice;

    /** 计费币种：CNY / USD */
    private String currency;

    /** 并发限制（TPM 总量） */
    private Integer concurrencyLimit;

    /** 状态：1=启用 0=停用 */
    private Integer status;

    /** 排序 */
    private Integer sortOrder;

    /** 最后更新人 */
    private String updatedBy;

    /** 逻辑删除：0=未删除 1=已删除 */
    @TableLogic
    private Integer deleted;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
