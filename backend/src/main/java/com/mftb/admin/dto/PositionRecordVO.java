package com.mftb.admin.dto;

import com.mftb.admin.entity.EmpPositionRecord;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 职务记录视图对象
 */
@Data
public class PositionRecordVO {

    private Long id;
    private Long userId;

    // 变动信息
    private LocalDate effectiveDate;
    private Integer effectiveSeq;
    private String operation;
    private String reason;

    // 任职信息
    private String serviceDept;
    private String sequenceType;
    private String positionLevel;
    private String rankCode;
    private String company;
    private String employeeCategory;
    private String workSystem;
    private String positionName;
    private String directSuperior;
    private String mentor;

    // 工作信息
    private String workCountry;
    private String workCity;
    private String officeAddress;
    private String contractLocation;

    private String createdBy;
    private String updatedBy;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public static PositionRecordVO from(EmpPositionRecord entity) {
        PositionRecordVO vo = new PositionRecordVO();
        vo.setId(entity.getId());
        vo.setUserId(entity.getUserId());
        vo.setEffectiveDate(entity.getEffectiveDate());
        vo.setEffectiveSeq(entity.getEffectiveSeq());
        vo.setOperation(entity.getOperation());
        vo.setReason(entity.getReason());
        vo.setServiceDept(entity.getServiceDept());
        vo.setSequenceType(entity.getSequenceType());
        vo.setPositionLevel(entity.getPositionLevel());
        vo.setRankCode(entity.getRankCode());
        vo.setCompany(entity.getCompany());
        vo.setEmployeeCategory(entity.getEmployeeCategory());
        vo.setWorkSystem(entity.getWorkSystem());
        vo.setPositionName(entity.getPositionName());
        vo.setDirectSuperior(entity.getDirectSuperior());
        vo.setMentor(entity.getMentor());
        vo.setWorkCountry(entity.getWorkCountry());
        vo.setWorkCity(entity.getWorkCity());
        vo.setOfficeAddress(entity.getOfficeAddress());
        vo.setContractLocation(entity.getContractLocation());
        vo.setCreatedBy(entity.getCreatedBy());
        vo.setUpdatedBy(entity.getUpdatedBy());
        vo.setCreatedAt(entity.getCreatedAt());
        vo.setUpdatedAt(entity.getUpdatedAt());
        return vo;
    }
}
