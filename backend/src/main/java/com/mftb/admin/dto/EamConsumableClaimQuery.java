package com.mftb.admin.dto;

import lombok.Data;

/**
 * 耗材领用单查询参数
 */
@Data
public class EamConsumableClaimQuery {
    private Integer page = 1;
    private Integer size = 10;
    /** 关键字（单号/申请人/事由） */
    private String keyword;
    /** 领用单号（模糊匹配） */
    private String claimNo;
    /** 申请人姓名（模糊匹配） */
    private String applicantName;
    /** 承担部门 ID（含子孙部门，服务层展开） */
    private Long departmentId;
    /** 状态：pending/approved/rejected/issued/cancelled */
    private String status;
    /** 申请人 ID（"我的领用"视图由服务层强制回填） */
    private Long applicantId;
    /** 仅查本人（true 时服务层用当前登录人覆盖 applicantId） */
    private Boolean mine;
}
