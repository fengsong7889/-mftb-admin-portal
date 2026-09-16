package com.mftb.admin.dto;

import lombok.Data;

/**
 * 领用查询参数
 */
@Data
public class EamClaimQuery {
    private Integer page = 1;
    private Integer size = 10;
    /** 关键字（编号/姓名/资产名） */
    private String keyword;
    /** 部门 ID */
    private Long departmentId;
    /** 状态过滤 */
    private String status;
    /** 待签过滤 */
    private Boolean pendingSignature;
    /** 员工 ID（个人视图） */
    private Long employeeId;
}
