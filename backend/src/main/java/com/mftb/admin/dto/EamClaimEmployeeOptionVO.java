package com.mftb.admin.dto;

import lombok.Data;

/**
 * 可选领用人下拉 VO（領用登記表單「領用人」選項）
 *
 * 與員工管理列表解耦：僅要求領用資產菜單權限即可調用，
 * 保證無員工管理權限的員工也能選擇本人或同事登記領用。
 */
@Data
public class EamClaimEmployeeOptionVO {
    /** 員工 ID（sys_user.id，與領用登記 employeeId 同源） */
    private Long employeeId;
    /** 員工工號 */
    private String empNo;
    /** 員工姓名 */
    private String empName;
    /** 部門 ID（供表單帶出所在部門） */
    private Long departmentId;
    /** 部門名稱 */
    private String department;
}
