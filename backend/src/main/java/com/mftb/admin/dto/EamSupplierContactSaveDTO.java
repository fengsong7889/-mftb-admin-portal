package com.mftb.admin.dto;

import lombok.Data;

/**
 * 供应商联系人保存请求（新增/修改通用）
 */
@Data
public class EamSupplierContactSaveDTO {

    /** 关联供应商 ID（创建联系人时必填） */
    private Long supplierId;

    /** 联系人姓名 */
    private String contactName;

    /** 联系电话 */
    private String contactPhone;

    /** 状态: enabled/disabled（可选，默认 enabled） */
    private String status;
}
