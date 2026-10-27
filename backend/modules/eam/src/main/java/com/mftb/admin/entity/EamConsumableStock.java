package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 耗材库存实体（耗材 × 仓库 维度，数量型）
 */
@Data
@TableName("biz_eam_consumable_stock")
public class EamConsumableStock {

    @TableId
    private Long id;

    /** 耗材 ID */
    private Long itemId;

    /** 仓库 ID（biz_eam_location） */
    private Long locationId;

    /** 仓库名称快照 */
    private String locationName;

    /** 当前库存数量 */
    private Integer qty;

    /** 审批中占用数量（领用单 pending 时锁定） */
    private Integer lockedQty;

    /** 所属品牌 ID 快照（= 档案 company_brand） */
    private Long companyBrand;

    /** 购买公司 ID 快照 */
    private Long purchaseCompanyId;

    /** 购买公司名称快照 */
    private String purchaseCompany;

    /** 移动加权平均单位成本 */
    private BigDecimal avgCost;

    /** 库存账面成本金额 */
    private BigDecimal totalCost;

    /** 库存最后操作人 */
    private String updatedBy;

    /** 所有库存更新均走条件 SQL 原子扣减，version 由数据库端递增留痕。 */
    @TableField(update = "%s+1", updateStrategy = FieldStrategy.ALWAYS)
    private Long version;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
