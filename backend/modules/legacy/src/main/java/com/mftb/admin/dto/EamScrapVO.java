package com.mftb.admin.dto;

import lombok.Data;

import java.math.BigDecimal;

/**
 * 报废记录列表/详情视图对象
 */
@Data
public class EamScrapVO {
    private Long id;
    private Long assetId;
    /** 报废编号 */
    private String scrapNo;
    /** 资产编号（快照） */
    private String assetNo;
    /** 资产名称（快照） */
    private String assetName;
    /** 资产分类（快照） */
    private String assetType;
    /** 资产品牌（快照） */
    private String brand;
    /** 所属品牌/公司品牌 ID（快照） */
    private Integer companyBrand;
    /** 报废日期 yyyy-MM-dd */
    private String scrapDate;
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
    private String createdBy;
    private String createdAt;
    /** 最后更新人 */
    private String updatedBy;
    /** 最后更新时间 */
    private String updatedAt;
}
