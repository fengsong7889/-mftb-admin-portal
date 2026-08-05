package com.mftb.admin.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * 人气商家库存查询结果（皮肤 x 日期 格子, 不限库存, 已购买格子标记 purchased）
 */
@Data
public class AdHotInventoryVO {

    /** 关联算法ID */
    private Long algoId;

    /** 预售天数 */
    private Integer presaleDays;

    /** 多格梯度折扣 JSON 字符串（前端展示折扣规则） */
    private String discountTiers;

    /** 退款开关: 1=允许退款 2=不允许 */
    private Integer refundEnabled;

    /** 格子列表 */
    private List<Cell> cells = new ArrayList<>();

    /** 单个格子（皮肤 x 日期） */
    @Data
    public static class Cell {
        /** 投放日期 */
        private LocalDate bizDate;
        /** 皮肤名称 */
        private String skinName;
        /** 皮肤日单价 */
        private BigDecimal price;
        /** 格子状态: available=可购买 purchased=本商家已购买（不能重复购买） */
        private String status;
    }
}
