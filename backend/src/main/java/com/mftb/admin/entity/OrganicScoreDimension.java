package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 自然流量评分维度权重配置实体
 */
@Data
@TableName("biz_organic_score_dimension")
public class OrganicScoreDimension {

    @TableId
    private Long id;

    /** 维度: 1=商業 2=店鋪 4=平台 */
    private Integer dimension;

    /** 权重百分比（0~100） */
    private Integer weight;

    /** 排序号 */
    private Integer sortOrder;

    /** 最后更新人 */
    private String updatedBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
