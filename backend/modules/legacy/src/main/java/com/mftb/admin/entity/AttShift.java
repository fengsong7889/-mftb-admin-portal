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
import java.time.LocalTime;

/**
 * 考勤班次（时间基准）。
 * <p>
 * 弹性班次允许 on/off 为空（{@code flexFlag=1}）；跨天夜班必须显式标记 {@code crossDay}，
 * 否则打卡流水的 work_date 会被算错一天——汇总一律按 work_date 聚合，不靠 punch_at 的日期推导。
 * <p>
 * 注意：表上的 {@code active_code} 是软删感知生成列，只读，不进实体。
 */
@Data
@TableName("att_shift")
public class AttShift {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 班次编码（SH+2~3 位，人工录入，唯一） */
    private String shiftCode;

    /** 班次名称，如「門店早班 08:00-17:00」 */
    private String shiftName;

    /** 上班时间；弹性班次可为空 */
    private LocalTime onTime;

    /** 下班时间；弹性班次可为空 */
    private LocalTime offTime;

    /** 下班是否跨天：1=跨天（夜班） */
    private Integer crossDay;

    /** 标准工时（小时），加班与缺勤折算基准 */
    private BigDecimal workHours;

    /** 休息开始时刻，用于从在勤时长扣除非工时 */
    private LocalTime restStart;

    /** 休息结束时刻 */
    private LocalTime restEnd;

    /** 是否弹性班次：1=弹性 */
    private Integer flexFlag;

    /** 状态：enabled / disabled */
    private String status;

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
