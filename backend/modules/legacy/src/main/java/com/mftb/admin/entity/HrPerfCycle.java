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
 * 考核周期（如 2026 年第三季度），计划发起的时间容器。
 * <p>
 * 参考 SQL: backend/sql/201_hr_performance.sql
 */
@Data
@TableName("hr_perf_cycle")
public class HrPerfCycle {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 申请单编号（PC+YYYYMMDD+4位） */
    private String reqNo;

    /** 周期编码，如 2026Q3 */
    private String code;

    /** 周期名称 */
    private String name;

    /** 周期类型：QUARTER/YEAR */
    private String cycleType;

    /** 考核期开始日期 */
    private LocalDate periodStart;

    /** 考核期结束日期 */
    private LocalDate periodEnd;

    /** 状态：draft/published/closed */
    private String status;

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
