package com.mftb.admin.dto;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 供应商联系人 VO（前端展示用）
 */
@Data
public class EamSupplierContactVO {

    private Long id;

    /** 关联供应商ID */
    private Long supplierId;

    /** 联系人姓名 */
    private String contactName;

    /** 联系电话 */
    private String contactPhone;

    /** 状态: enabled/disabled */
    private String status;

    private String createdAt;
    private String updatedAt;
}
