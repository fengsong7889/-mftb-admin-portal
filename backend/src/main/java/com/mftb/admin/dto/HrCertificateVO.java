package com.mftb.admin.dto;

import com.mftb.admin.entity.HrCertificateRequest;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/** 证明开具申请视图（列表与详情共用） */
@Data
public class HrCertificateVO {

    private Long id;
    private String reqNo;
    private Long userId;
    private String empName;
    private String empNo;
    private String deptName;
    private String certType;
    private String purpose;
    private String recipient;
    private String language;
    private Integer copies;
    private LocalDate expectDate;
    private String remark;
    private String status;
    private String flowNo;
    /** 办理结果（审批通过后写入领取指引） */
    private String resultRemark;
    private String createdBy;
    private String updatedBy;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public static HrCertificateVO from(HrCertificateRequest e) {
        HrCertificateVO vo = new HrCertificateVO();
        vo.setId(e.getId());
        vo.setReqNo(e.getReqNo());
        vo.setUserId(e.getUserId());
        vo.setEmpName(e.getEmpName());
        vo.setEmpNo(e.getEmpNo());
        vo.setDeptName(e.getDeptName());
        vo.setCertType(e.getCertType());
        vo.setPurpose(e.getPurpose());
        vo.setRecipient(e.getRecipient());
        vo.setLanguage(e.getLanguage());
        vo.setCopies(e.getCopies());
        vo.setExpectDate(e.getExpectDate());
        vo.setRemark(e.getRemark());
        vo.setStatus(e.getStatus());
        vo.setFlowNo(e.getFlowNo());
        vo.setResultRemark(e.getResultRemark());
        vo.setCreatedBy(e.getCreatedBy());
        vo.setUpdatedBy(e.getUpdatedBy());
        vo.setCreatedAt(e.getCreatedAt());
        vo.setUpdatedAt(e.getUpdatedAt());
        return vo;
    }
}
