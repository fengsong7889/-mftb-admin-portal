package com.mftb.admin.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

import java.util.List;

/**
 * 员工新增/编辑请求
 */
@Data
public class EmployeeRequest {

    /** 登录账号 (=工号, 由后端自动生成, 前端传入将被忽略) */
    private String username;

    /** 登录密码 (仅新增时使用) */
    private String password;

    @NotBlank(message = "姓名不能为空")
    private String name;

    /** 员工工号 (由后端按 MT 前缀自增生成, 前端传入将被忽略) */
    private String empId;

    /** 所在部门ID */
    private Long departmentId;

    /** 职位ID (关联 sys_position, 职级序列/职级随职位带出) */
    private Long positionId;

    /** 职等 (R1~R5) */
    private String rank;

    /** 基础角色: admin/guest, 默认 guest */
    private String role;

    /** 绑定的功能角色ID */
    private List<Long> functionRoleIds;
}
