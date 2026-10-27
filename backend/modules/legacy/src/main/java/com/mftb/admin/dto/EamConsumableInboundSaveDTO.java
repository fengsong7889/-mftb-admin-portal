package com.mftb.admin.dto;

import lombok.Data;
import java.time.LocalDate;
import java.util.List;

/** 入库单保存参数（独立入库单 CRUD） */
@Data
public class EamConsumableInboundSaveDTO {
    /** 入库类型：in_purchase/in_manual/in_init */
    private String inboundType;
    /** 所属品牌ID */
    private Long companyBrand;
    /** 购买公司ID */
    private Long purchaseCompanyId;
    /** 供应商ID */
    private Long supplierId;
    /** 供应商名称 */
    private String supplierName;
    /** 采购订单ID */
    private Long poId;
    /** 入库日期 */
    private LocalDate bizDate;
    /** 备注 */
    private String remark;
    /** 入库明细 */
    private List<Item> items;

    @Data
    public static class Item {
        /** 耗材ID */
        private Long itemId;
        /** 入库仓库ID */
        private Long locationId;
        /** 入库数量 */
        private Integer qty;
        /** 实际入库单价 */
        private java.math.BigDecimal unitPrice;
    }
}
