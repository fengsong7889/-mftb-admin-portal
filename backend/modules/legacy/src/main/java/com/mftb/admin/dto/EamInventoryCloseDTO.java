package com.mftb.admin.dto;

import lombok.Data;

/** 盘点任务结束 DTO：COMPLETE 完整完成（未完成数须为 0）/ PARTIAL 部分完成（须填原因） */
@Data
public class EamInventoryCloseDTO {

    /** 结束方式：COMPLETE / PARTIAL */
    private String closeType;

    /** 结束原因（部分完成必填） */
    private String reason;

    /** 预检查返回的任务修订号，正式结束时须一致，否则要求重新预检查 */
    private Integer expectedTaskRevision;

    /** 预检查返回的台账比对指纹 */
    private String prepareHash;

    /** 幂等键 */
    private String requestKey;
}
