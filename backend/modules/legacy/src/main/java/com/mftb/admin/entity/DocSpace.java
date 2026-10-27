package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/** 文檔空間實體（知識域：需求/人事/行政/制度/培訓） */
@Data
@TableName("doc_space")
public class DocSpace {

    @TableId
    private Long id;

    /** 空間名稱 */
    private String name;

    /** 空間圖標（emoji） */
    private String icon;

    /** 排序（小在前） */
    @TableField("sort_order")
    private Integer sortOrder;

    /** 空間說明 */
    private String description;

    private String createdBy;

    private String updatedBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}
