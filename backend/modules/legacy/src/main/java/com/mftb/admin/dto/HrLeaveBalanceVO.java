package com.mftb.admin.dto;

import com.mftb.admin.entity.HrLeaveBalance;
import lombok.Data;

import java.math.BigDecimal;

/**
 * 假期额度视图：在台账字段上补充员工快照与计算列。
 * <p>
 * occupiedDays = 在途请假（草稿/审批中/待办理）占用天数；
 * remainingDays = 授予 + 结转 - 已用 - 占用（可为负，表示超额）。
 */
@Data
public class HrLeaveBalanceVO {

    private Long id;
    private Long userId;
    private String empNo;
    private String empName;
    private String department;
    private Integer year;
    private String leaveType;
    private BigDecimal totalDays;
    private BigDecimal carriedDays;
    private BigDecimal usedDays;
    private BigDecimal occupiedDays;
    private BigDecimal remainingDays;
    /** 是否已建立额度记录（false 表示未授予额度） */
    private Boolean granted;
    private String remark;
    private String updatedBy;
    private String updatedAt;

    public static HrLeaveBalanceVO of(HrLeaveBalance b, String empName, String department) {
        HrLeaveBalanceVO vo = new HrLeaveBalanceVO();
        vo.empName = empName;
        vo.department = department;
        vo.granted = b != null;
        vo.totalDays = BigDecimal.ZERO;
        vo.carriedDays = BigDecimal.ZERO;
        vo.usedDays = BigDecimal.ZERO;
        if (b != null) {
            vo.id = b.getId();
            vo.userId = b.getUserId();
            vo.empNo = b.getEmpNo();
            vo.year = b.getYear();
            vo.leaveType = b.getLeaveType();
            vo.totalDays = nz(b.getTotalDays());
            vo.carriedDays = nz(b.getCarriedDays());
            vo.usedDays = nz(b.getUsedDays());
            vo.remark = b.getRemark();
            vo.updatedBy = b.getUpdatedBy();
            vo.updatedAt = b.getUpdatedAt() == null ? null : b.getUpdatedAt().toString();
        }
        return vo;
    }

    private static BigDecimal nz(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v;
    }
}
