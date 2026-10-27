package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 排班（员工 × 日期 × 班次）。
 * <p>
 * {@code shiftId} 为 null 表示当日休息——必须显式落一行而不是"没有记录"，
 * 否则无法区分"排了休息"与"漏排班"，后者要产生「未排班」异常提醒。
 * <p>
 * 唯一键 {@code uk_schedule_active_user_date} 保证一人一天一条结论；保存走 UPSERT。
 */
@Data
@TableName("att_schedule")
public class AttSchedule {

    /** 来源：手工排班 */
    public static final int SOURCE_MANUAL = 1;
    /** 来源：批量复制上一周期 */
    public static final int SOURCE_COPY = 2;
    /** 来源：导入 */
    public static final int SOURCE_IMPORT = 3;

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long groupId;

    private Long userId;

    private String empNo;

    private String empName;

    private LocalDate workDate;

    /** 班次；null = 当日休息 */
    private Long shiftId;

    /** 1=手工排班 2=批量複製 3=導入 */
    private Integer source;

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
