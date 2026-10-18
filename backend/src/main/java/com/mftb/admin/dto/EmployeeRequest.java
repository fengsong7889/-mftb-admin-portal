package com.mftb.admin.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
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

    @NotBlank(message = "姓名不能為空")
    private String name;

    /** 员工工号 (由后端按编号生成规则 employee_no 自增生成, 前端传入将被忽略) */
    private String empId;

    /** 所在部门ID */
    private Long departmentId;

    /** 职位ID (关联 sys_position, 职级序列/职级随职位带出) */
    private Long positionId;

    /** 职等 (R1~R5) */
    private String rank;

    /** 任职公司 (新增时自动写入初始「入职」职务记录) */
    private String company;

    /**
     * 已废弃入参：服务层<b>不读取也不回写</b>本字段，保留仅为兼容滚动发布期间的旧前端包。
     * <p>{@code sys_user.role='admin'} 是内置系统超管硬直通标记，只能由系统账号
     * {@code BuiltinAccounts.ADMIN_USERNAME} 持有（见迁移 {@code core:builtin-admin-account-v1}）。
     * 若接受前端传入，持有 employee-management 权限的人就能把自己提成超管。
     * 员工权限一律走 {@link #functionRoleIds}（已禁止绑超管角色）与部门授权。
     */
    @Deprecated
    @Pattern(regexp = "^(admin|guest)$", message = "角色只允許 admin 或 guest")
    private String role;

    /** 绑定的功能角色ID */
    private List<Long> functionRoleIds;
}
