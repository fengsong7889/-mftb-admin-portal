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
 * 考勤节假日日历。
 * <p>
 * 节假日直接改变「应出勤」基数与加班倍率，所以一天只允许一条结论（唯一键 {@code uk_holiday_active_date}）。
 * 停用不是删除：停用后该日回归正常工时判定，但已冻结月份不回溯重算。
 */
@Data
@TableName("att_holiday")
public class AttHoliday {

    /** 类型：法定节假日 */
    public static final int TYPE_LEGAL = 1;
    /** 类型：调休上班（周末但要上班） */
    public static final int TYPE_SWAP_WORKDAY = 2;
    /** 类型：公司假期 */
    public static final int TYPE_COMPANY = 3;

    @TableId(type = IdType.AUTO)
    private Long id;

    private LocalDate holidayDate;

    private String holidayName;

    /** 1=法定節假日 2=調休上班 3=公司假期 */
    private Integer holidayType;

    /** 所属年度（冗余列，按年批量查询与年度导入去重） */
    @TableField("year_no")
    private Integer yearNo;

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
