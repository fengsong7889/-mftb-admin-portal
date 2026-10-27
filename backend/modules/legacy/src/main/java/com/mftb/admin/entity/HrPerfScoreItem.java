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

    /**
     * 系统建议分：由 RDM 產研协同绩效建议推送写入，HR 校准前仅作参考值。
     * <p>此前只有裸 SQL 在写这三列、实体没有对应字段，导致考核单界面无法核对
     * 「RDM 推了多少 / 撤回后是否真清空」（阶段 6 端到端实测）。
     */
    private BigDecimal suggestedScore;

    /** 建议值来源（如 RDM） */
    private String suggestedSource;

    /** 建议值写入时间 */
    private LocalDateTime suggestedAt;

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
