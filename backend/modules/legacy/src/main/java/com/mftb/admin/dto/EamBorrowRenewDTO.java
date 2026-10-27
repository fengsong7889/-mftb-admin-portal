package com.mftb.admin.dto;

import lombok.Data;

/**
 * 借用续借请求 DTO
 */
@Data
public class EamBorrowRenewDTO {
    /** 新到期日期 yyyy-MM-dd */
    private String newDueDate;
}
