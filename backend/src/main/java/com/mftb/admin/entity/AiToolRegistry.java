package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * AI 工具注册实体
 */
@Data
@TableName("ai_tool_registry")
public class AiToolRegistry {

    @TableId
    private Long id;

    /** 工具标识 */
    private String toolKey;

    /** 工具名称 */
    private String name;

    /** 工具描述 */
    private String description;

    /** 分类：general/tool/data/other */
    private String category;

    /** 版本号 */
    private String version;

    /** 作者/提供方 */
    private String author;

    /** 图标 */
    private String icon;

    /** API 端点 */
    private String apiEndpoint;

    /** 配置 Schema JSON */
    private String configSchema;

    /** 是否启用：1=是 0=否 */
    private Integer isEnabled;

    /** 排序 */
    private Integer sortOrder;

    /** 状态：1=启用 0=停用 */
    private Integer status;

    /** 逻辑删除 */
    @TableLogic
    private Integer deleted;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
