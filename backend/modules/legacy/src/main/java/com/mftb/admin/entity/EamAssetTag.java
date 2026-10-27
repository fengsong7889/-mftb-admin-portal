package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 资产标签模板实体
 * <p>
 * 业务人员自定义标签样式（配色 + 展示字段），用于资产批量贴标。
 * display_fields 存储逗号分隔的资产字段 key 列表（如 "assetNo,assetType,brand"），
 * 前端负责解析为数组并渲染。
 */
@Data
@TableName("biz_eam_asset_tag")
public class EamAssetTag {

    @TableId
    private Long id;

    /** 标签名称 */
    private String name;

    /** 标签描述 */
    private String description;

    /** 标签背景色（如 #1890FF） */
    private String bgColor;

    /** 标签文字颜色（如 #FFFFFF） */
    private String textColor;

    /** 展示字段配置（逗号分隔的资产字段 key 列表，如 "assetNo,assetType,brand"） */
    private String displayFields;

    /** 状态: enabled/disabled */
    private String status;

    /** 排序（升序） */
    private Integer sort;

    /** 最后更新人 */
    private String updatedBy;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableLogic
    private Integer deleted;
}
