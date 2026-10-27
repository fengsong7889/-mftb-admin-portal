package com.mftb.admin.dto;

import lombok.Data;

/**
 * 借用登记请求 DTO
 */
@Data
public class EamBorrowSaveDTO {
    /** 资产 ID */
    private Long assetId;
    /** 借用人 ID（sys_user.id） */
    private Long holderId;
    /** 借用部门 */
    private String department;
    /** 借出日期 yyyy-MM-dd */
    private String startDate;
    /** 到期日期 yyyy-MM-dd */
    private String dueDate;
    /** 借用用途 */
    private String purpose;
}
