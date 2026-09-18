package com.mftb.admin.dto;

import lombok.Data;

/**
 * 耗材出入库流水分页查询参数
 */
@Data
public class EamConsumableTxnQuery {
    private Integer page = 1;
    private Integer size = 20;
    /** 耗材编码（模糊） */
    private String itemCode;
    /** 耗材名称（模糊） */
    private String itemName;
    /** 流水类型（精确）：in_purchase/in_manual/in_adjust/out_claim/out_adjust */
    private String txnType;
    /** 操作人（模糊） */
    private String operator;
    /** 操作时间范围起（yyyy-MM-dd） */
    private String txnTimeStart;
    /** 操作时间范围止（yyyy-MM-dd） */
    private String txnTimeEnd;
}
