package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;

/**
 * 採購訂單明細實體
 */
@Data
@TableName("biz_eam_purchase_order_item")
public class EamPurchaseOrderItem {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 所屬訂單 ID */
    private Long orderId;

    /** 所屬供應商分組 ID */
    private String groupId;

    /** 資產型號 ID */
    private Long modelId;

    /** 資產名稱 */
    private String modelName;

    /** 分類 ID */
    private Long categoryId;

    /** 分類名稱 */
    private String categoryName;

    /** 分類編碼 */
    private String categoryCode;

    /** 品牌 ID */
    private Long brandId;

    /** 品牌名稱 */
    private String brandName;

    /** 參數信息 JSON */
    private String params;

    /** purchase/lease */
    private String purchaseType;

    /** 數量 */
    private Integer qty;

    /** 參考單價 */
    private BigDecimal price;

    /** 成交單價 */
    private BigDecimal confirmedPrice;

    /** 已驗收數量 */
    private Integer receivedQty;

    /** 排序 */
    private Integer sortOrder;
}
