package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 績效改判留痕（只增不改的流水，一次动作一行）。
 * <p>
 * 存姓名/部门快照而非只存 user_id：留痕的用途是事后追责，若只存 ID，
 * 员工调岗改名后这条记录就指不回当时的事实。before_* 允许为空（首次改判前本就没有值）。
 * 参考 SQL: backend/sql/202_hr_perf_report.sql
 */
@Data
@TableName("hr_perf_calibration_log")
public class HrPerfCalibrationLog {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 被改判的考核单 */
    private Long assessmentId;

    /** 所属计划（冗余便于按计划筛留痕） */
    private Long planId;

    /** 被考核人 */
    private Long userId;

    /** 工号快照 */
    private String empNo;

    /** 姓名快照 */
    private String empName;

    /** 部门快照 */
    private String deptName;

    /** 动作：CALIBRATE/APPEAL_REVISE/DIST_WAIVER */
    private String action;

    /** 改判前得分 */
    private BigDecimal beforeScore;

    /** 改判前等级 */
    private String beforeGrade;

    /** 改判后得分 */
    private BigDecimal afterScore;

    /** 改判后等级 */
    private String afterGrade;

    /** 理由（改判与例外放行都必填） */
    private String reason;

    /** 关联申诉单（action=APPEAL_REVISE 时回填） */
    private Long refAppealId;

    /** 操作人 ID：姓名可重名，追责要靠 ID */
    private Long operatorUserId;

    /** 操作人姓名快照 */
    private String operatorName;

    private String createdBy;

    private String updatedBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}
