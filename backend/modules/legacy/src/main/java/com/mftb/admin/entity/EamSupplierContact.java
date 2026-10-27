package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 供应商联系人实体（一个供应商可配置多个联系人）
 */
@Data
@TableName("biz_eam_supplier_contact")
public class EamSupplierContact {

    @TableId
    private Long id;

    /** 关联供应商ID */
    private Long supplierId;

    /** 联系人姓名 */
    private String contactName;

    /** 联系电话 */
    private String contactPhone;

    /** 状态: enabled/disabled */
    private String status;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}
