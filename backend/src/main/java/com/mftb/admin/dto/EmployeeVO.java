package com.mftb.admin.dto;

import com.mftb.admin.entity.SysUser;
import lombok.Data;

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
    private String position;
    /** 职级 (随职位带出) */
    private String jobLevel;
    private Integer status;
    private List<Long> functionRoleIds;
    private LocalDateTime createdAt;

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
        vo.setJobLevel(user.getJobLevel());
        vo.setStatus(user.getStatus());
        vo.setFunctionRoleIds(functionRoleIds);
        vo.setCreatedAt(user.getCreatedAt());
        return vo;
    }
}
