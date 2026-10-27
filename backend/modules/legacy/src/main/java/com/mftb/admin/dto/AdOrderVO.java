package com.mftb.admin.dto;

import com.mftb.admin.entity.AdOrder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 广告订单列表行 VO
 */
@Data
public class AdOrderVO {

    private Long id;
    private String orderNo;
    private Integer algoType;
    private Long algoId;
    private String algoName;
    private String algoCode;
    private String brand;
    private Integer channel;
    private String groupCode;
    private String groupName;
    private String storeCode;
    private String storeName;
    private String bdEmpId;
    private Integer operatorType;
    private String operatorId;
    private String operatorName;
    /** 门店地址（来自 biz_store.address，门店自身地址） */
    private String storeAddress;
    /** 购买商圈（明细去重聚合） */
    private List<Integer> regions;
    /** 购买时段（明细去重聚合, 如 breakfast/lunch） */
    private List<String> mealSlots;
    /** 按(商圈,日期)分组的购买时段（无敌星星） */
    private List<DateSlotGroup> dateSlots;
    /** 购买日期列表（盘活复苏按天售卖，明细 biz_date 去重排序） */
    private List<String> purchaseDays;
    /** 购买皮肤列表（人气商家明细 skin_name 去重排序） */
    private List<String> skinNames;
    /** 皮肤等级列表（人气商家：根据 skin_name 查定价配置 tier 去重排序） */
    private List<String> skinTiers;
    /** 按标签分组的购买日期（金字招牌：每个标签对应的日期列表） */
    private List<LabelDateGroup> labelDates;
    /** 业务频道（投流广告: 1=美食外卖 2=超市百货 3=团购到店，自定价配置回填） */
    private Integer bizChannel;
    /** 购买方式（投流广告: tier=预设档位, custom=自定义曝光） */
    private String trafficMode;
    /** 流量包名称（投流广告: 套餐名称或自定义曝光次数） */
    private String trafficPackageName;
    /** 购买曝光次数（投流广告） */
    private Long trafficImpressions;
    /** 投流时段（投流广告: business=营业时间, allday=全天） */
    private String deliverySlot;
    private Integer itemCount;
    private BigDecimal originalAmount;
    private BigDecimal discountAmount;
    private BigDecimal actualAmount;
    private BigDecimal refundAmount;
    /** 赠送天数抵扣快照 */
    private Integer giftDays;
    /** 赠送抵扣金额快照 */
    private BigDecimal giftAmount;
    /** 退款开关快照: 1=允许退款 2=不允许 */
    private Integer refundEnabled;
    private Integer status;
    private LocalDateTime orderTime;
    private LocalDateTime payTime;
    private String flowNo;
    private String remark;
    private LocalDateTime createdAt;

    /** 按(商圈,日期)分组的时段 */
    @Data
    public static class DateSlotGroup {
        private Integer region;
        private String date;
        private List<String> slots;

        public DateSlotGroup() {}
        public DateSlotGroup(Integer region, String date, List<String> slots) {
            this.region = region;
            this.date = date;
            this.slots = slots;
        }
    }

    /** 按标签分组的日期（金字招牌） */
    @Data
    public static class LabelDateGroup {
        private String label;
        /** 场景: all_macau=全澳对比, district=商圈对比, null=统计类 */
        private String scenario;
        private List<String> dates;

        public LabelDateGroup() {}
        public LabelDateGroup(String label, String scenario, List<String> dates) {
            this.label = label;
            this.scenario = scenario;
            this.dates = dates;
        }
    }

    public static AdOrderVO from(AdOrder entity) {
        AdOrderVO vo = new AdOrderVO();
        vo.setId(entity.getId());
        vo.setOrderNo(entity.getOrderNo());
        vo.setAlgoType(entity.getAlgoType());
        vo.setAlgoId(entity.getAlgoId());
        vo.setAlgoName(entity.getAlgoName());
        vo.setAlgoCode(entity.getAlgoCode());
        vo.setBrand(entity.getBrand());
        vo.setChannel(entity.getChannel());
        vo.setGroupCode(entity.getGroupCode());
        vo.setGroupName(entity.getGroupName());
        vo.setStoreCode(entity.getStoreCode());
        vo.setStoreName(entity.getStoreName());
        vo.setBdEmpId(entity.getBdEmpId());
        vo.setOperatorType(entity.getOperatorType());
        vo.setOperatorId(entity.getOperatorId());
        vo.setOperatorName(entity.getOperatorName());
        vo.setItemCount(entity.getItemCount());
        vo.setOriginalAmount(entity.getOriginalAmount());
        vo.setDiscountAmount(entity.getDiscountAmount());
        vo.setActualAmount(entity.getActualAmount());
        vo.setRefundAmount(entity.getRefundAmount());
        vo.setGiftDays(entity.getGiftDays());
        vo.setGiftAmount(entity.getGiftAmount());
        vo.setRefundEnabled(entity.getRefundEnabled());
        vo.setStatus(entity.getStatus());
        vo.setOrderTime(entity.getOrderTime());
        vo.setPayTime(entity.getPayTime());
        vo.setFlowNo(entity.getFlowNo());
        vo.setRemark(entity.getRemark());
        vo.setCreatedAt(entity.getCreatedAt());
        return vo;
    }
}
