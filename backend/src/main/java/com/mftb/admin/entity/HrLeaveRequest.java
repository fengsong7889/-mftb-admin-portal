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
 * HR 请假申请单据。
 * <p>
 * 提交后关联 OA 流程（flow_no → biz_oa_request，流程定义复用 oa_leave），
 * 审批通过由 {@code HrLeaveService#onFlowApproved} 把天数累加到 hr_leave_balance.used_days。
 * 天数按自然日计（含首尾），提交时校验不超过可用额度。
 */
@Data
@TableName("hr_leave_request")
public class HrLeaveRequest {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 请假单编号（LQ+YYYYMMDD+4位序号） */
    private String reqNo;

    /** 请假人 sys_user.id */
    private Long userId;

    /** 请假人姓名快照 */
    private String empName;

    /** 请假人工号快照 */
    private String empNo;

    /** 部门名称快照 */
    private String deptName;

    /** 所属年度（按开始日期） */
    private Integer year;

    /** 假期类型（HR 字典 LEAVE_TYPE code） */
    private String leaveType;

    private LocalDate startDate;

    private LocalDate endDate;

    /** 请假天数（自然日，含首尾） */
    private BigDecimal days;

    private String reason;

    /** 状态: draft/pending/approved/rejected/cancelled/completed */
    private String status;

    /** 关联 OA 流程编号 */
    private String flowNo;

    /** 备注/办理结果 */
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
