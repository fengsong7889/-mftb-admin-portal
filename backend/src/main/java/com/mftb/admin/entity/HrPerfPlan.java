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
 * 一次考核发起：圈定范围、四阶段时间窗、整批审批流程。
 * <p>
 * 参考 SQL: backend/sql/201_hr_performance.sql
 */
@Data
@TableName("hr_perf_plan")
public class HrPerfPlan {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 计划编号（PP+YYYYMMDD+4位） */
    private String reqNo;

    /** 所属周期 */
    private Long cycleId;

    /** 使用模板 */
    private Long templateId;

    /** 计划名称 */
    private String name;

    /** 范围条件 JSON：部门/职级/在职状态 */
    private String scopeJson;

    /** 自评开始 */
    private LocalDate selfStart;

    /** 自评截止 */
    private LocalDate selfEnd;

    /** 上级评开始 */
    private LocalDate supStart;

    /** 上级评截止 */
    private LocalDate supEnd;

    /** 校准截止 */
    private LocalDate calibEnd;

    /** 状态：draft/running/confirm_pending/confirmed */
    private String status;

    /** 整批确认关联的 OA 流程编号 */
    private String flowNo;

    /** 计划说明 */
    private String summary;

    private String createdBy;

    private String updatedBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}
