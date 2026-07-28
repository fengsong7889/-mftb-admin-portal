package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 用户实体
 */
@Data
@TableName("sys_user")
public class SysUser {

    @TableId
    private Long id;

    /** 登录账号 */
    private String username;

    /** 密码(BCrypt加密) */
    private String password;

    /** 姓名 */
    private String name;

    /** 员工工号 */
    private String empId;

    /** 头像 */
    private String avatar;

    /** 角色: admin/guest */
    private String role;

    /** 绑定的功能角色ID JSON数组, 如 [1,3] */
    private String functionRoles;

    /** 所在部门ID (关联 sys_department) */
    private Long departmentId;

    /** 所在部门名称快照 */
    private String department;

    /** 职位ID (关联 sys_position) */
    private Long positionId;

    /** 职位名称快照 */
    private String position;

    /** 职级快照 (如 M3 / T5 / P2, 随职位带出) */
    private String jobLevel;

    /** 状态: 1=启用 0=停用 */
    private Integer status;

    /** 逻辑删除 */
    @TableLogic
    private Integer deleted;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
