package com.mftb.admin.dto;

import lombok.Data;

import java.util.List;

/**
 * 采购入库批次创建请求
 */
@Data
public class EamInboundCreateDTO {

    /** 采购订单ID (eam_purchase_order.id) */
    private Long poId;

    /** 入库日期(yyyy-MM-dd)，为空默认当天 */
    private String inboundDate;

    /** 备注 */
    private String remark;

    /** 入库明细 */
    private List<InboundItem> items;

    /** 入库明细行（含验收处置） */
    @Data
    public static class InboundItem {

        /** 采购订单明细 ID，避免同型号跨供应商串行 */
        private Long orderItemId;

        /** 分组验收日期，缺省使用批次日期 */
        private String inboundDate;

        /** 型号ID (eam_model.id) */
        private Long modelId;

        /** 型号名称快照 */
        private String modelName;

        /** 入库数量 */
        private Integer qty;

        /** 存放位置ID (eam_location.id) */
        private Long locationId;

        /** 存放位置名称快照 */
        private String locationName;

        /** 验收处置: pass(通过)/return(退货)/exchange(换货)/concession(让步接收) */
        private String disposition;

        /** 退货/换货原因 */
        private String rejectReason;

        /** 验收照片(JSON数组原样透传) */
        private Object photos;

        /** 配件清单(JSON数组原样透传 [{name,qty}]) */
        private Object accessories;
    }
}
