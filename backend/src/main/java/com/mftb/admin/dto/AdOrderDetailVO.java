package com.mftb.admin.dto;

import com.mftb.admin.entity.AdOrderItemHot;
import com.mftb.admin.entity.AdOrderItemNewStore;
import com.mftb.admin.entity.AdOrderItemRevive;
import com.mftb.admin.entity.AdOrderItemSignboard;
import com.mftb.admin.entity.AdOrderItemStar;
import com.mftb.admin.entity.AdOrderItemTraffic;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * 广告订单详情 VO（含无敌星星明细）
 */
@Data
@EqualsAndHashCode(callSuper = true)
public class AdOrderDetailVO extends AdOrderVO {

    /** 订单明细（格子列表） */
    private List<Item> items = new ArrayList<>();

    public static AdOrderDetailVO from(AdOrderVO order) {
        AdOrderDetailVO vo = new AdOrderDetailVO();
        vo.setId(order.getId());
        vo.setOrderNo(order.getOrderNo());
        vo.setAlgoType(order.getAlgoType());
        vo.setAlgoId(order.getAlgoId());
        vo.setAlgoName(order.getAlgoName());
        vo.setAlgoCode(order.getAlgoCode());
        vo.setBrand(order.getBrand());
        vo.setChannel(order.getChannel());
        vo.setGroupCode(order.getGroupCode());
        vo.setGroupName(order.getGroupName());
        vo.setStoreCode(order.getStoreCode());
        vo.setStoreName(order.getStoreName());
        vo.setBdEmpId(order.getBdEmpId());
        vo.setOperatorType(order.getOperatorType());
        vo.setOperatorId(order.getOperatorId());
        vo.setOperatorName(order.getOperatorName());
        vo.setStoreAddress(order.getStoreAddress());
        vo.setRegions(order.getRegions());
        vo.setMealSlots(order.getMealSlots());
        vo.setDateSlots(order.getDateSlots());
        vo.setPurchaseDays(order.getPurchaseDays());
        vo.setSkinNames(order.getSkinNames());
        vo.setBizChannel(order.getBizChannel());
        vo.setTrafficMode(order.getTrafficMode());
        vo.setTrafficPackageName(order.getTrafficPackageName());
        vo.setTrafficImpressions(order.getTrafficImpressions());
        vo.setDeliverySlot(order.getDeliverySlot());
        vo.setItemCount(order.getItemCount());
        vo.setOriginalAmount(order.getOriginalAmount());
        vo.setDiscountAmount(order.getDiscountAmount());
        vo.setActualAmount(order.getActualAmount());
        vo.setRefundAmount(order.getRefundAmount());
        vo.setGiftDays(order.getGiftDays());
        vo.setGiftAmount(order.getGiftAmount());
        vo.setRefundEnabled(order.getRefundEnabled());
        vo.setStatus(order.getStatus());
        vo.setOrderTime(order.getOrderTime());
        vo.setPayTime(order.getPayTime());
        vo.setFlowNo(order.getFlowNo());
        vo.setRemark(order.getRemark());
        vo.setCreatedAt(order.getCreatedAt());
        return vo;
    }

    /** 订单明细行（商圈 x 日期 x 餐段） */
    @Data
    public static class Item {
        private Long id;
        private LocalDate bizDate;
        private Integer region;
        private String mealSlot;
        /** 皮肤名称（人气商家明细） */
        private String skinName;
        /** 场景（金字招牌：all_macau/district/null） */
        private String scenario;
        /** 流量包名称（投流广告） */
        private String packageName;
        /** 购买曝光次数（投流广告） */
        private Long impressions;
        /** 已消耗曝光次数（投流广告，APP回写） */
        private Long consumedImpressions;
        /** 实际单价（投流广告: 实付÷曝光） */
        private BigDecimal unitPrice;
        /** 投流时段（投流广告: business/allday） */
        private String deliverySlot;
        private BigDecimal originalPrice;
        private BigDecimal salePrice;
        private BigDecimal refundPrice;
        /** 投放状态: 1=待投放 2=已投放 3=已退款 */
        private Integer deliveryStatus;

        public static Item from(AdOrderItemStar entity) {
            Item item = new Item();
            item.setId(entity.getId());
            item.setBizDate(entity.getBizDate());
            item.setRegion(entity.getRegion());
            item.setMealSlot(entity.getMealSlot());
            item.setOriginalPrice(entity.getOriginalPrice());
            item.setSalePrice(entity.getSalePrice());
            item.setRefundPrice(entity.getRefundPrice());
            item.setDeliveryStatus(entity.getDeliveryStatus());
            return item;
        }

        /** 盘活复苏明细（无餐段维度） */
        public static Item from(AdOrderItemRevive entity) {
            Item item = new Item();
            item.setId(entity.getId());
            item.setBizDate(entity.getBizDate());
            item.setRegion(entity.getRegion());
            item.setMealSlot(null);
            item.setOriginalPrice(entity.getOriginalPrice());
            item.setSalePrice(entity.getSalePrice());
            item.setRefundPrice(entity.getRefundPrice());
            item.setDeliveryStatus(entity.getDeliveryStatus());
            return item;
        }

        /** 新店广告明细（无商圈/餐段/定价维度） */
        public static Item from(AdOrderItemNewStore entity) {
            Item item = new Item();
            item.setId(entity.getId());
            item.setBizDate(entity.getBizDate());
            item.setRegion(null);
            item.setMealSlot(null);
            item.setOriginalPrice(BigDecimal.ZERO);
            item.setSalePrice(BigDecimal.ZERO);
            item.setRefundPrice(BigDecimal.ZERO);
            item.setDeliveryStatus(entity.getDeliveryStatus());
            return item;
        }

        /** 人气商家明细（皮肤 x 日期，无商圈/餐段维度） */
        public static Item from(AdOrderItemHot entity) {
            Item item = new Item();
            item.setId(entity.getId());
            item.setBizDate(entity.getBizDate());
            item.setRegion(null);
            item.setMealSlot(null);
            item.setSkinName(entity.getSkinName());
            item.setOriginalPrice(entity.getOriginalPrice());
            item.setSalePrice(entity.getSalePrice());
            item.setRefundPrice(entity.getRefundPrice());
            item.setDeliveryStatus(entity.getDeliveryStatus());
            return item;
        }

        /** 金字招牌明细（标签 x 日期，无商圈/餐段维度） */
        public static Item from(AdOrderItemSignboard entity) {
            Item item = new Item();
            item.setId(entity.getId());
            item.setBizDate(entity.getBizDate());
            item.setRegion(null);
            item.setMealSlot(null);
            item.setSkinName(entity.getLabelType()); // 复用 skinName 字段展示标签类型
            item.setScenario(entity.getScenario());
            item.setOriginalPrice(entity.getOriginalPrice());
            item.setSalePrice(entity.getSalePrice());
            item.setRefundPrice(entity.getRefundPrice());
            item.setDeliveryStatus(entity.getDeliveryStatus());
            return item;
        }

        /** 投流广告明细（预付流量包，无日期/商圈/餐段维度） */
        public static Item from(AdOrderItemTraffic entity) {
            Item item = new Item();
            item.setId(entity.getId());
            item.setBizDate(null);
            item.setRegion(null);
            item.setMealSlot(null);
            item.setPackageName(entity.getPackageName());
            item.setImpressions(entity.getImpressions() == null ? null : entity.getImpressions().longValue());
            item.setConsumedImpressions(entity.getConsumedImpressions() == null
                    ? null : entity.getConsumedImpressions().longValue());
            item.setUnitPrice(entity.getUnitPrice());
            item.setDeliverySlot(entity.getDeliverySlot());
            item.setOriginalPrice(entity.getOriginalPrice());
            item.setSalePrice(entity.getSalePrice());
            item.setRefundPrice(entity.getRefundPrice());
            item.setDeliveryStatus(entity.getDeliveryStatus());
            return item;
        }
    }
}
