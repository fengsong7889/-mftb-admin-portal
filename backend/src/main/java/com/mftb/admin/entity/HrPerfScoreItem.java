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
 * 指标级打分明细（自评/上级评各一行内三列，便于逐指标对比）。
 * <p>
 * 参考 SQL: backend/sql/201_hr_performance.sql
 */
@Data
@TableName("hr_perf_score_item")
public class HrPerfScoreItem {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 所属考核单 */
    private Long assessmentId;

    /** 来源指标 */
    private Long indicatorId;

    /** 指标名称快照 */
    private String indicatorName;

    /** 权重快照 */
    private BigDecimal weight;

    /** 完成情况/实际值 */
    private String targetValue;

    /** 自评分 */
    private BigDecimal selfScore;

    /** 上级评分 */
    private BigDecimal supervisorScore;

    /** 最终评分 */
    private BigDecimal finalScore;

    /** 备注 */
    private String remark;

    private String createdBy;

    private String updatedBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}
