package com.mftb.admin.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * 无敌星星库存查询结果（商圈 x 日期 x 餐段 格子）
 */
@Data
public class AdInventoryVO {

    /** 关联算法ID */
    private Long algoId;

    /** 预售天数 */
    private Integer presaleDays;

    /** 多时段梯度折扣 JSON 字符串（前端展示折扣规则） */
    private String discountTiers;

    /** 分商圈时段折扣配置 JSON 字符串（前端预览折后价） */
    private String slotDiscounts;

    /** 格子列表 */
    private List<Cell> cells = new ArrayList<>();

    /** 单个格子（商圈 x 日期 x 餐段） */
    @Data
    public static class Cell {
        /** 投放日期 */
        private LocalDate bizDate;
        /** 商圈 */
        private Integer region;
        /** 餐段时段: breakfast/lunch/afternoon/dinner/supper */
        private String mealSlot;
        /** 格子单价（商圈日单价 / 5） */
        private BigDecimal cellPrice;
        /** 格子状态: available=可购买 soldOut=已售罄 upcoming=待开售 */
        private String status;
    }
}
