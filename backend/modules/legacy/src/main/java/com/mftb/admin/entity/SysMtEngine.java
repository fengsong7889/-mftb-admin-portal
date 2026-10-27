package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 机翻引擎配置实体
 */
@Data
@TableName("sys_mt_engine")
public class SysMtEngine {

    @TableId
    private Long id;

    /** 引擎标识: mymemory / deepl / openai */
    private String engineKey;

    /** 引擎显示名称 */
    private String engineName;

    /** API 地址 */
    private String apiUrl;

    /** API Key（加密存储） */
    private String apiKey;

    /** 每日字符额度 */
    private Integer dailyLimit;

    /** 请求超时（毫秒） */
    private Integer timeoutMs;

    /** 状态: 1=启用 0=停用 */
    private Integer status;

    /** 引擎特有配置（JSON） */
    private String configJson;

    /** 排序号 */
    private Integer sortOrder;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
