package com.mftb.admin.dto;

import lombok.Data;

import java.util.List;

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
    /**
     * 多状态过滤（如「異常終止」页签：cancelled/transferred/loss_closed/scrap_closed/repair_closed）。
     * <p>逗号分隔绑定（Spring 默认 String→Collection 转换）；与 status 互不覆盖，同时传时为交集。
     */
    private List<String> statuses;
    /** 待签过滤 */
    private Boolean pendingSignature;
    /** 员工 ID（个人视图） */
    private Long employeeId;
}
