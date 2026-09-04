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
    /** 購買時段（明細去重聚合, 如 breakfast/lunch） */
    private List<String> mealSlots;
    /** 按(商圈,日期)分組的購買時段（無敵星星） */
    private List<DateSlotGroup> dateSlots;
    /** 購買日期列表（盤活復蘇按天售賣，明細 biz_date 去重排序） */
    private List<String> purchaseDays;
    /** 購買皮膚列表（人氣商家明細 skin_name 去重排序） */
    private List<String> skinNames;
    /** 皮膚等級列表（人氣商家：根據 skin_name 查定價配置 tier 去重排序） */
    private List<String> skinTiers;
    /** 按標籤分組的購買日期（金字招牌：每個標籤對應的日期列表） */
    private List<LabelDateGroup> labelDates;
    /** 業務頻道（投流廣告: 1=美食外賣 2=超市百貨 3=團購到店，自定價配置回填） */
    private Integer bizChannel;
    /** 購買方式（投流廣告: tier=預設檔位, custom=自定義曝光） */
    private String trafficMode;
    /** 流量包名稱（投流廣告: 套餐名稱或自定義曝光次數） */
    private String trafficPackageName;
    /** 購買曝光次數（投流廣告） */
    private Long trafficImpressions;
    /** 投流時段（投流廣告: business=營業時間, allday=全天） */
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

    /** 按(商圈,日期)分組的時段 */
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

    /** 按標籤分組的日期（金字招牌） */
    @Data
    public static class LabelDateGroup {
        private String label;
        /** 場景: all_macau=全澳對比, district=商圈對比, null=統計類 */
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
