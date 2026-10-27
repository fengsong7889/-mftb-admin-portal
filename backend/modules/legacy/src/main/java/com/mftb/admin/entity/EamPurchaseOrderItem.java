package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;

/**
 * 采购订单明细实体
 */
@Data
@TableName("biz_eam_purchase_order_item")
public class EamPurchaseOrderItem {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 所属订单 ID */
    private Long orderId;

    /** 所属供应商分组 ID */
    private String groupId;

    /** 资产型号 ID */
    private Long modelId;

    /** 资产名称 */
    private String modelName;

    /** 分类 ID */
    private Long categoryId;

    /** 分类名称 */
    private String categoryName;

    /** 分类编码 */
    private String categoryCode;

    /** 品牌 ID */
    private Long brandId;

    /** 品牌名称 */
    private String brandName;

    /** 参数信息 JSON */
    private String params;

    /** purchase/lease */
    private String purchaseType;

    /** 数量 */
    private Integer qty;

    /** 参考单价 */
    private BigDecimal price;

    /** 成交单价 */
    private BigDecimal confirmedPrice;

    /** 已验收数量 */
    private Integer receivedQty;

    /** 累计退货数量（终态，PR-2） */
    private Integer returnedQty;

    /** 累计换货在途数量（PR-2） */
    private Integer exchangedQty;

    /** 排序 */
    private Integer sortOrder;
}
