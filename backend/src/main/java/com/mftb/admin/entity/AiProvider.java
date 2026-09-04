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
 * AI 供应商实体
 */
@Data
@TableName("ai_provider")
public class AiProvider {

    @TableId
    private Long id;

    /** 供应商标识 */
    private String providerKey;

    /** 供应商名称 */
    private String name;

    /** 供应商描述 */
    private String description;

    /** API 基础 URL */
    @TableField("api_base_url")
    private String apiUrlBase;

    /** API Key(加密存储) */
    private String apiKey;

    /** 状态：1=启用 0=停用 */
    private Integer status;

    /** 是否默认供应商：0=否 1=是 */
    private Integer isDefault;

    /** 配置信息 JSON */
    private String configJson;

    /** 排序 */
    private Integer sortOrder;

    /** 逻辑删除：0=未删除 1=已删除 */
    @TableLogic
    private Integer deleted;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
