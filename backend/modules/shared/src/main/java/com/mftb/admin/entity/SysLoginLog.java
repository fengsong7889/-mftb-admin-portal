package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 员工登录日志实体
 */
@Data
@TableName("sys_login_log")
public class SysLoginLog {

    @TableId
    private Long id;

    /** 用户ID (关联 sys_user.id) */
    private Long userId;

    /** 登录账号 */
    private String username;

    /** 员工工号 */
    private String empId;

    /** 员工姓名 */
    private String employeeName;

    /** 部门ID */
    private Long departmentId;

    /** 部门全路径快照 */
    private String departmentName;

    /** 登录时间 */
    private LocalDateTime loginTime;

    /** 退出时间 (NULL=在线中) */
    private LocalDateTime logoutTime;

    /** 退出原因: manual=主动退出, timeout=系统超时退出 */
    private String logoutReason;

    /** 登录IP地址 */
    private String ipAddress;

    /** 浏览器 User-Agent */
    private String userAgent;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
}
