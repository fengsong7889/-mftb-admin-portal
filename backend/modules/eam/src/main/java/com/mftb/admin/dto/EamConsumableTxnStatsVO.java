package com.mftb.admin.dto;

import lombok.Data;

/**
 * 耗材出入库流水统计视图对象（按查询条件聚合，供独立菜单页指标卡）
 */
@Data
public class EamConsumableTxnStatsVO {
    /** 流水总笔数 */
    private Long total;
    /** 入库笔数（in_*） */
    private Long inCount;
    /** 出库笔数（out_*） */
    private Long outCount;
    /** 净变动数量（入库正 + 出库负 之和） */
    private Integer netQty;
}
