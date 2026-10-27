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
 * HR 假期额度台账（员工 × 年度 × 假别）。
 * <p>
 * 剩余额度 = totalDays + carriedDays - usedDays - 在途请假占用；
 * usedDays 只由请假审批通过回调累加，不接受前端直接写入。
 */
@Data
@TableName("hr_leave_balance")
public class HrLeaveBalance {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 关联 sys_user.id */
    private Long userId;

    /** 员工工号快照 */
    private String empNo;

    /** 额度过期年度（自然年） */
    private Integer year;

    /** 假期类型（HR 字典 LEAVE_TYPE 的 code） */
    private String leaveType;

    /** 年度授予天数 */
    private BigDecimal totalDays;

    /** 上年结转天数 */
    private BigDecimal carriedDays;

    /** 已使用天数（审批通过的请假累计） */
    private BigDecimal usedDays;

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
