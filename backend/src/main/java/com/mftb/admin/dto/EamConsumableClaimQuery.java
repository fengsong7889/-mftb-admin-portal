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
    /** 状态：pending/approved/rejected/issued/cancelled */
    private String status;
    /** 申请人 ID（"我的领用"视图由服务层强制回填） */
    private Long applicantId;
    /** 仅查本人（true 时服务层用当前登录人覆盖 applicantId） */
    private Boolean mine;
}
