package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 模板指标（考核单实例化时复制为明细打分项）。
 * <p>
 * 参考 SQL: backend/sql/201_hr_performance.sql
 */
@Data
@TableName("hr_perf_indicator")
public class HrPerfIndicator {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 所属模板 */
    private Long templateId;

    /** 指标名称 */
    private String name;

    /** 指标类型（字典 PERF_INDICATOR_TYPE） */
    private String indicatorType;

    /** 权重 */
    private BigDecimal weight;

    /** 目标值/衡量标准 */
    private String targetDesc;

    /** 评分口径 */
    private String scoringDesc;

    /** 排序 */
    private Integer sortOrder;

    private String createdBy;

    private String updatedBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}
