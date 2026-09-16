package com.mftb.admin.dto;

import lombok.Data;

/**
 * 领用登记请求 DTO
 */
@Data
public class EamClaimSaveDTO {
    /** 资产 ID */
    private Long assetId;
    /** 领用人 ID（sys_user.id） */
    private Long employeeId;
    /** 领用日期 yyyy-MM-dd */
    private String claimDate;
    /** 领用用途/原因 */
    private String claimReason;
    /** 备注 */
    private String remark;
    /** 是否代办：standard / proxy */
    private String mode;
    /** 代办原因（mode=proxy 必填） */
    private String proxyReason;
}
