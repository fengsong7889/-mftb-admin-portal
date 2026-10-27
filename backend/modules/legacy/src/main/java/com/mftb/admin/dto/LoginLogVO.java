package com.mftb.admin.dto;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 登录日志视图对象
 */
@Data
public class LoginLogVO {

    private Long id;

    /** 员工工号 */
    private String empId;

    /** 员工姓名 */
    private String employeeName;

    /** 部门ID */
    private Long departmentId;

    /** 部门全路径 */
    private String departmentName;

    /** 登录时间 */
    private LocalDateTime loginTime;

    /** 退出时间 */
    private LocalDateTime logoutTime;

    /** 在线时长(秒) */
    private Long duration;

    /** 退出原因: manual / timeout / null(在线中) */
    private String logoutReason;
}
