package com.mftb.admin.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * 盘活复苏库存查询结果（商圈 x 日期 格子）
 */
@Data
public class AdReviveInventoryVO {

    /** 关联算法ID */
    private Long algoId;

    /** 预售天数 */
    private Integer presaleDays;

    /** 多天梯度折扣 JSON 字符串（前端展示折扣规则） */
    private String discountTiers;

    /** 退款开关: 1=允许退款 2=不允许 */
    private Integer refundEnabled;

    /** 格子列表 */
    private List<Cell> cells = new ArrayList<>();

    /** 单个格子（商圈 x 日期） */
    @Data
    public static class Cell {
        /** 投放日期 */
        private LocalDate bizDate;
        /** 商圈 */
        private Integer region;
        /** 日单价（商圈日单价） */
        private BigDecimal dailyPrice;
        /** 每天销售个数（库存） */
        private Integer salesLimit;
        /** 剩余可售个数（已扣除占用与其他商家加购锁） */
        private Integer remaining;
        /** 格子状态: available=可购买 soldOut=已售罄 unavailable=不可售 */
        private String status;
    }
}
