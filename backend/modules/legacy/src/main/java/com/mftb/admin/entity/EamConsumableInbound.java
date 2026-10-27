package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 耗材入库单实体（采购/期初/手工入库统一入口）
 */
@Data
@TableName("biz_eam_consumable_inbound")
public class EamConsumableInbound {

    @TableId
    private Long id;

    /** 入库单号（HCRK+YYYYMMDD+4位） */
    private String inboundNo;

    /** 入库类型：in_purchase/in_manual/in_init */
    private String inboundType;

    /** 所属品牌ID */
    private Long companyBrand;

    /** 购买公司ID */
    private Long purchaseCompanyId;

    /** 购买公司名称快照 */
    private String purchaseCompany;

    /** 供应商ID */
    private Long supplierId;

    /** 供应商名称快照 */
    private String supplierName;

    /** 采购订单ID */
    private Long poId;

    /** 采购订单号快照 */
    private String poNo;

    /** 来源类型 */
    private String sourceType;

    /** 来源单据ID */
    private Long sourceId;

    /** 入库日期 */
    private LocalDate bizDate;

    /** 备注 */
    private String remark;

    private String createdBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    private String updatedBy;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}
