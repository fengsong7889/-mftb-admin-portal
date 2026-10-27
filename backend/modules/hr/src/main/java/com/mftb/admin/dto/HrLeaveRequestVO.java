package com.mftb.admin.dto;

import com.mftb.admin.entity.HrLeaveRequest;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/** 请假申请视图（列表与详情共用） */
@Data
public class HrLeaveRequestVO {

    private Long id;
    private String reqNo;
    private Long userId;
    private String empName;
    private String empNo;
    private String deptName;
    private Integer year;
    private String leaveType;
    private LocalDate startDate;
    private LocalDate endDate;
    private BigDecimal days;
    private String reason;
    private String status;
    private String flowNo;
    private String remark;
    private String createdBy;
    private String updatedBy;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    /** 该假别剩余可用天数（表单提示用；未授予额度时为 null） */
    private BigDecimal remainingDays;

    public static HrLeaveRequestVO from(HrLeaveRequest e) {
        HrLeaveRequestVO vo = new HrLeaveRequestVO();
        vo.setId(e.getId());
        vo.setReqNo(e.getReqNo());
        vo.setUserId(e.getUserId());
        vo.setEmpName(e.getEmpName());
        vo.setEmpNo(e.getEmpNo());
        vo.setDeptName(e.getDeptName());
        vo.setYear(e.getYear());
        vo.setLeaveType(e.getLeaveType());
        vo.setStartDate(e.getStartDate());
        vo.setEndDate(e.getEndDate());
        vo.setDays(e.getDays());
        vo.setReason(e.getReason());
        vo.setStatus(e.getStatus());
        vo.setFlowNo(e.getFlowNo());
        vo.setRemark(e.getRemark());
        vo.setCreatedBy(e.getCreatedBy());
        vo.setUpdatedBy(e.getUpdatedBy());
        vo.setCreatedAt(e.getCreatedAt());
        vo.setUpdatedAt(e.getUpdatedAt());
        return vo;
    }
}
