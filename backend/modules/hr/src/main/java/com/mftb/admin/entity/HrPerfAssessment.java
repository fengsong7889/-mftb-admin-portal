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
 * 每人一张考核单，承载四阶段评分与最终结果。
 * <p>
 * 参考 SQL: backend/sql/201_hr_performance.sql
 */
@Data
@TableName("hr_perf_assessment")
public class HrPerfAssessment {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 考核单编号（PH+YYYYMMDD+4位） */
    private String reqNo;

    /** 所属计划 */
    private Long planId;

    /** 被考核人 sys_user.id */
    private Long userId;

    /** 工号快照 */
    private String empNo;

    /** 姓名快照 */
    private String empName;

    /** 部门 ID 快照 */
    private Long deptId;

    /** 部门名称快照 */
    private String deptName;

    /** 序列快照 */
    private String sequenceType;

    /** 职位快照 */
    private String positionName;

    /** 职级快照 */
    private String positionLevel;

    /** 评估人 sys_user.id（权威，姓名仅快照） */
    private Long evaluatorUserId;

    /** 评估人姓名快照 */
    private String evaluatorName;

    /** 状态：见 HrPerfConstants 考核单状态机 */
    private String status;

    /** 自评加权分 */
    private BigDecimal selfScore;

    /** 自评评语 */
    private String selfComment;

    /** 自评提交时间 */
    private LocalDateTime selfAt;

    /** 上级加权分 */
    private BigDecimal supervisorScore;

    /** 上级评语 */
    private String supervisorComment;

    /** 上级提交时间 */
    private LocalDateTime supervisorAt;

    /** 校准后得分 */
    private BigDecimal calibratedScore;

    /** 校准后等级 */
    private String calibratedGrade;

    /** 校准备案人 */
    private String calibratedBy;

    /** 改判理由 */
    private String calibratedReason;

    /** 最终得分 */
    private BigDecimal finalScore;

    /** 最终等级 */
    private String finalGrade;

    /** 结果确认时间 */
    private LocalDateTime confirmedAt;

    /** 结果应用说明（本期仅记录） */
    private String appliedNote;

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
