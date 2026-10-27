package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 资产报废记录实体
 */
@Data
@TableName("biz_eam_scrap")
public class EamScrap {

    @TableId
    private Long id;

    /** 资产 ID */
    private Long assetId;

    /** 报废编号（如 BF202609210001） */
    private String scrapNo;

    /** 资产编号（快照） */
    private String assetNo;

    /** 资产名称（快照） */
    private String assetName;

    /** 资产分类（快照） */
    private String assetType;

    /** 品牌（快照） */
    private String brand;

    /** 所属品牌/公司品牌 ID（快照） */
    private Integer companyBrand;

    /** 报废日期 */
    private LocalDate scrapDate;

    /** 申请人 */
    private String applyBy;

    /** 申请人工号 */
    private String empId;

    /** 报废原因 */
    private String reason;

    /** 残值（MOP） */
    private BigDecimal residualValue;

    /** 处置方式：sale/donate/recycle/destroy */
    private String disposeType;

    /** 鉴定意见 */
    private String appraisal;

    /** 备注 */
    private String remark;

    /** 关联归还记录 ID */
    private Long returnId;

    /** 关联遗失单 ID（遗失核销时关联） */
    private Long lossId;

    /** 原持有人 ID 快照（登记报废前资产当前使用人，用于责任追溯） */
    private Long originalHolderId;

    /** 原持有人姓名快照 */
    private String originalHolderName;

    /** 来源领用 ID 快照（报废前活跃领用） */
    private Long sourceClaimId;

    /** 来源借用 ID 快照（报废前活跃借用） */
    private Long sourceBorrowId;

    /** 幂等请求键（直接登记防重） */
    private String requestKey;

    /** 状态：pending/approved/rejected/cancelled */
    private String status;

    /** 创建人 */
    private String createdBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    /** 最后更新人 */
    private String updatedBy;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}
