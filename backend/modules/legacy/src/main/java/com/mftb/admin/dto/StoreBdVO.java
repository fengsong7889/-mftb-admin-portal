package com.mftb.admin.dto;

import lombok.Data;

/**
 * 门店绑定BD视图对象（含员工部门/职位/职级信息）
 */
@Data
public class StoreBdVO {

    /** 绑定记录ID (biz_store_bd.id) */
    private Long id;

    /** BD员工工号 */
    private String bdEmpId;

    /** BD员工姓名 */
    private String bdName;

    /** 所在部门 */
    private String department;

    /** 职位 */
    private String position;

    /** 职级 (如 M3 / T5 / P2) */
    private String jobLevel;
}
