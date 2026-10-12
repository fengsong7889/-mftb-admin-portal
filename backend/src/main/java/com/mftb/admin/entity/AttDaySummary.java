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
 * 考勤日报（按 日期 × 考勤组 的计算结论）。
 * <p>
 * 是计算结果不是原始数据：不提供人工改数入口，修正一律回到异常处理发起流程后重算。
 * 唯一键 {@code (work_date, group_id)} 让重算走 UPSERT；已冻结月份不参与重算，
 * 否则会出现"薪酬引用值与页面值不一致"。
 */
@Data
@TableName("att_day_summary")
public class AttDaySummary {

    @TableId(type = IdType.AUTO)
    private Long id;

    private LocalDate workDate;

    private Long groupId;

    /** 考勤组名称快照 */
    private String groupName;

    private Long deptId;

    private String deptName;

    /** 應出勤人数（排班 ∪ 成员，扣除休息与未排班） */
    private Integer shouldCount;

    private Integer actualCount;

    private Integer lateCount;

    private Integer earlyCount;

    private Integer missingCount;

    private Integer absentCount;

    /** 請假人次（读 hr_leave_request 审批通过结论） */
    private Integer leaveCount;

    private BigDecimal overtimeHours;

    /** 出勤率% = 实出勤 / 应出勤 */
    private BigDecimal attendRate;

    /** 本次汇总生成时间（重算的审计凭据） */
    private LocalDateTime calculatedAt;

    private String createdBy;

    private String updatedBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}
