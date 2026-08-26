package com.mftb.admin.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * 金字招牌库存查询结果（标签 x 日期 格子）
 */
@Data
public class AdSignboardInventoryVO {

    /** 定价配置ID */
    private Long algoId;

    /** 预售天数 */
    private Integer presaleDays;

    /** 退款开关: 1=允许退款 2=不允许 */
    private Integer refundEnabled;

    /** 取消扣费梯度 JSON 字符串 */
    private String cancelFeeTiers;

    /** 标签计价明细（含日单价 + 梯度折扣） */
    private List<LabelPrice> labels = new ArrayList<>();

    /** 格子列表 */
    private List<Cell> cells = new ArrayList<>();

    /** 标签计价信息 */
    @Data
    public static class LabelPrice {
        /** 标签类型 */
        private String labelType;
        /** 场景（all_macau/district/null） */
        private String scenario;
        /** 是否启用 */
        private Boolean enabled;
        /** 标签日单价（MOP/天） */
        private BigDecimal pricePerDay;
        /** 梯度折扣 JSON [{"minDays":3,"discount":95}] */
        private String discountTiers;
        /** 商家是否满足该场景的资格条件 */
        private Boolean qualified;
        /** 资格条件描述（用于前端弹窗展示） */
        private String conditionDesc;
        /** 本门店实际情况（排名/数值，用于前端弹窗展示） */
        private String actualDesc;
    }

    /** 单个格子（标签 x 场景 x 日期） */
    @Data
    public static class Cell {
        /** 投放日期 */
        private LocalDate bizDate;
        /** 标签类型 */
        private String labelType;
        /** 场景（all_macau/district/null） */
        private String scenario;
        /** 标签日单价 */
        private BigDecimal pricePerDay;
        /** 格子状态: available=可购买 purchased=本商家已购买 */
        private String status;
    }
}
