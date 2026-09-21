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

    /** 资产编号（快照） */
    private String assetNo;

    /** 资产名称（快照） */
    private String assetName;

    /** 资产分类（快照） */
    private String assetType;

    /** 品牌（快照） */
    private String brand;

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
