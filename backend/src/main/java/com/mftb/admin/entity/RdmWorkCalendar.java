package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * RDM 工作日历实体（阶段 5：按人按日的可用工时）。
 * <p>只记例外，不记全量：默认规则是「周一至周五 8 小时」，本表存在的一行表示这天不同，
 * 让每个人的请假与周末支援都能进排程，而不用为全员维护一整年日历。
 */
@Data
@TableName("rdm_work_calendar")
public class RdmWorkCalendar {

    /** 休假日（当天可用工时按 0 计） */
    public static final String TYPE_LEAVE = "leave";
    /** 加班日（周末也可用） */
    public static final String TYPE_OVERTIME = "overtime";
    /** 自定义容量（只覆盖 availableHours） */
    public static final String TYPE_CUSTOM = "custom";

    /** 默认每日可用工时（人时） */
    public static final BigDecimal DEFAULT_DAY_HOURS = new BigDecimal("8");

    @TableId
    private Long id;

    /** 人员 */
    private Long userId;

    /** 日期（同人同日唯一） */
    private LocalDate day;

    /** leave/overtime/custom */
    private String dayType = TYPE_LEAVE;

    /** 当日可用工时；leave 视为 0，null 表示按类型默认 */
    private BigDecimal availableHours;

    /** 原因（年假/婚假/周末支援上线等） */
    private String reason;

    private String createdBy;

    private String updatedBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}
