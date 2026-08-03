package com.mftb.admin.dto;

import com.mftb.admin.entity.AdOrder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

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
    /** 所属商圈（明细去重聚合） */
    private List<Integer> regions;
    /** 购买时段（明细去重聚合, 如 breakfast/lunch） */
    private List<String> mealSlots;
    private Integer itemCount;
    private BigDecimal originalAmount;
    private BigDecimal discountAmount;
    private BigDecimal actualAmount;
    private BigDecimal refundAmount;
    private Integer status;
    private LocalDateTime orderTime;
    private LocalDateTime payTime;
    private String flowNo;
    private String remark;
    private LocalDateTime createdAt;

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
        vo.setStatus(entity.getStatus());
        vo.setOrderTime(entity.getOrderTime());
        vo.setPayTime(entity.getPayTime());
        vo.setFlowNo(entity.getFlowNo());
        vo.setRemark(entity.getRemark());
        vo.setCreatedAt(entity.getCreatedAt());
        return vo;
    }
}
