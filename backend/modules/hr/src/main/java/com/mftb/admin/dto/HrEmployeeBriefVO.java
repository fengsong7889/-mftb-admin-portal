package com.mftb.admin.dto;

import lombok.Data;

/**
 * 员工概要 VO（HR 入转调离单据发起时选择员工后的回填信息）
 */
@Data
public class HrEmployeeBriefVO {

    /** sys_user.id */
    private Long userId;

    private String empId;

    private String name;

    private Long departmentId;

    /** 部门名称快照 */
    private String department;

    private Long positionId;

    /** 职位名称 */
    private String position;

    /** 职级序列(M/T/P) */
    private String sequence;

    /** 职级(如P2) */
    private String jobLevel;

    /** 职等(R1-R5) */
    private String rank;

    /** 任职公司（取最新职务记录 company） */
    private String company;

    /** 直属上级（取最新职务记录 directSuperior） */
    private String directSuperior;

    /** 在职状态: active/resigned（取最新职务记录 operation 派生） */
    private String employmentStatus;
}
