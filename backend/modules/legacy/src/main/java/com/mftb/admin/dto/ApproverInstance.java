package com.mftb.admin.dto;

import lombok.Data;

/**
 * 审批人实例（单个审批人的实际状态）
 */
@Data
public class ApproverInstance {

    /** 用户ID */
    private Long userId;

    /** 姓名(工号) */
    private String name;

    /** 审批状态: pending / approved / rejected / skipped */
    private String status;

    /** 审批时间（ISO格式字符串） */
    private String time;
}
