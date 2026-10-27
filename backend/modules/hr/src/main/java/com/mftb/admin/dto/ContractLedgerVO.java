package com.mftb.admin.dto;

import com.mftb.admin.entity.EmpContract;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 合同全局台账视图 (P1-B 跨员工查看)
 * 在合同字段基础上补充员工工号/姓名/部门快照。
 */
@Data
public class ContractLedgerVO {

    private Long id;
    private Long userId;
    /** 员工工号 */
    private String empId;
    /** 员工姓名 */
    private String employeeName;
    /** 员工部门（快照） */
    private String department;
    private String contractNo;
    private String contractType;
    private String company;
    private LocalDate startDate;
    private LocalDate endDate;
    private LocalDate signDate;
    private String status;
    private String remark;
    private String updatedBy;
    private LocalDateTime updatedAt;

    public static ContractLedgerVO from(EmpContract c, String empId, String employeeName, String department) {
        ContractLedgerVO vo = new ContractLedgerVO();
        vo.setId(c.getId());
        vo.setUserId(c.getUserId());
        vo.setEmpId(empId);
        vo.setEmployeeName(employeeName);
        vo.setDepartment(department);
        vo.setContractNo(c.getContractNo());
        vo.setContractType(c.getContractType());
        vo.setCompany(c.getCompany());
        vo.setStartDate(c.getStartDate());
        vo.setEndDate(c.getEndDate());
        vo.setSignDate(c.getSignDate());
        vo.setStatus(c.getStatus());
        vo.setRemark(c.getRemark());
        vo.setUpdatedBy(c.getUpdatedBy());
        vo.setUpdatedAt(c.getUpdatedAt());
        return vo;
    }
}
