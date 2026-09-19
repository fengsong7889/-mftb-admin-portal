package com.mftb.admin.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/**
 * 采购订单保存请求（直接录入 / 执行信息更新共用）
 */
@Data
public class EamPurchaseSaveDTO {

    /** 关联采购申请 ID（直接录入时可为空） */
    private Long reqId;

    /** 供应商 */
    private String supplier;

    /** 订单金额 */
    private BigDecimal amount;

    /** 交货日期 */
    private String deliveryDate;

    /** 采购人 */
    private String purchaser;

    /** 服务部门 */
    private String department;

    /** 所属品牌：1=闪蜂, 2=mFood */
    private Integer brand;

    /** 执行状态 */
    private String execStatus;

    /** 备注 */
    private String remark;

    /** 快递单号 */
    private String trackingNo;

    /** 供应商分组（含明细） */
    private List<SupplierGroup> supplierGroups;

    /**
     * 供应商分组
     */
    @Data
    public static class SupplierGroup {

        /** 分组 ID */
        private String id;

        /** 分组供应商 */
        private String supplier;

        /** 供应商 ID（下拉选择时传入，用于回显） */
        private Long supplierId;

        /** 联系人 */
        private String contact;

        /** 联系人电话 */
        private String contactPhone;

        /** 下单日期 */
        private String orderDate;

        /** 快递单号 */
        private String trackingNo;

        /** 收货方式：self_pickup / supplier_delivery / express */
        private String deliveryMethod;

        /** 预计收货日期 */
        private String expectedReceiveDate;

        /** 分组明细 */
        private List<SupplierItem> items;
    }

    /**
     * 采购明细
     */
    @Data
    public static class SupplierItem {

        /** 前端行 key（回显后行内编辑按 key 匹配，必须透传） */
        private String key;

        /** 型号 ID */
        private Long modelId;

        /** 型号名称 */
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

        /** 采购类型 */
        private String purchaseType;

        /** 参数信息 */
        private Map<String, String> params;

        /** 数量 */
        private Integer qty;

        /** 已验收入库数量 */
        private Integer receivedQty;

        /** 单价 */
        private BigDecimal price;

        /** 成交单价 */
        private BigDecimal confirmedPrice;
    }
}
