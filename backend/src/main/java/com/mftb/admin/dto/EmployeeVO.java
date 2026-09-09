package com.mftb.admin.dto;

import com.mftb.admin.entity.SysUser;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 员工视图对象 (不含密码)
 */
@Data
public class EmployeeVO {

    private Long id;
    private String username;
    private String name;
    private String empId;
    private String role;
    private Long departmentId;
    private String department;
    private Long positionId;
    /** 职位名称(中文) */
    private String position;
    /** 职位名称(英文) */
    private String positionEn;
    /** 职级序列 (M/T/P, 随职位带出) */
    private String sequence;
    /** 职级 (随职位带出) */
    private String jobLevel;
    /** 职等 (R1~R5) */
    private String rank;
    private Integer status;

    /** 在职状态（由职务数据派生：active=在职, resigned=离职） */
    private String employmentStatus;

    // ── 个人信息 ──
    private String nationality;
    private String ethnicity;
    private LocalDate birthDate;
    private String maritalStatus;
    private String politicalStatus;
    private String religion;

    // ── 证件信息 ──
    private String idType;
    private String idNumber;
    private String idAddress;
    private String householdType;
    private String householdLocation;
    private String nativePlace;

    // ── 通讯信息 ──
    private String addressCountry;
    private String addressCity;
    private String addressDetail;

    private List<Long> functionRoleIds;
    private LocalDateTime createdAt;
    /** 最后更新人 */
    private String updatedBy;
    /** 最后更新时间 */
    private LocalDateTime updatedAt;

    public static EmployeeVO from(SysUser user, List<Long> functionRoleIds) {
        EmployeeVO vo = new EmployeeVO();
        vo.setId(user.getId());
        vo.setUsername(user.getUsername());
        vo.setName(user.getName());
        vo.setEmpId(user.getEmpId());
        vo.setRole(user.getRole());
        vo.setDepartmentId(user.getDepartmentId());
        vo.setDepartment(user.getDepartment());
        vo.setPositionId(user.getPositionId());
        vo.setPosition(user.getPosition());
        vo.setPositionEn(user.getPositionEn());
        vo.setSequence(user.getSequence());
        vo.setJobLevel(user.getJobLevel());
        vo.setRank(user.getRank());
        vo.setStatus(user.getStatus());
        // 个人信息
        vo.setNationality(user.getNationality());
        vo.setEthnicity(user.getEthnicity());
        vo.setBirthDate(user.getBirthDate());
        vo.setMaritalStatus(user.getMaritalStatus());
        vo.setPoliticalStatus(user.getPoliticalStatus());
        vo.setReligion(user.getReligion());
        // 证件信息
        vo.setIdType(user.getIdType());
        vo.setIdNumber(user.getIdNumber());
        vo.setIdAddress(user.getIdAddress());
        vo.setHouseholdType(user.getHouseholdType());
        vo.setHouseholdLocation(user.getHouseholdLocation());
        vo.setNativePlace(user.getNativePlace());
        // 通讯信息
        vo.setAddressCountry(user.getAddressCountry());
        vo.setAddressCity(user.getAddressCity());
        vo.setAddressDetail(user.getAddressDetail());
        vo.setFunctionRoleIds(functionRoleIds);
        vo.setCreatedAt(user.getCreatedAt());
        vo.setUpdatedBy(user.getUpdatedBy());
        vo.setUpdatedAt(user.getUpdatedAt());
        return vo;
    }
}
