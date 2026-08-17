package com.mftb.admin.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 人气商家库存查询结果（皮肤 x 日期 格子, 不限库存, 已购买格子标记 purchased）
 */
@Data
public class AdHotInventoryVO {

    /** 关联算法ID */
    private Long algoId;

    /** 预售天数 */
    private Integer presaleDays;

    /** 赠送天数每日现金价值（MOP），从定价配置穿透 */
    private Integer giftCashValue;

    /** 多格梯度折扣 JSON 字符串（前端展示折扣规则） */
    private String discountTiers;

    /** 退款开关: 1=允许退款 2=不允许 */
    private Integer refundEnabled;

    /** 格子列表 */
    private List<Cell> cells = new ArrayList<>();

    /** 皮肤销量统计: 皮肤名称 → 售出的订单数（有效订单每单记一次） */
    private Map<String, Integer> skinSoldCounts = new LinkedHashMap<>();

    /** 单个格子（皮肤 x 日期） */
    @Data
    public static class Cell {
        /** 投放日期 */
        private LocalDate bizDate;
        /** 皮肤名称 */
        private String skinName;
        /** 皮肤日单价 */
        private BigDecimal price;
        /** 边框方式: none=无边框 color=选择配色 image=上传边框图 */
        private String borderType;
        /** 边框颜色(HEX, borderType= color时生效) */
        private String borderColor;
        /** 皮肤段位: classic=经典 premium=精选 flagship=旗舰 ultimate=至尊 */
        private String tier;
        /** 菜品展示布局: grid=大图拼列 carousel=阶梯轮播（来自定价配置，单选） */
        private String dishLayout;
        /** 格子状态: available=可购买 purchased=本商家已购买（不能重复购买） */
        private String status;
    }
}
