package com.mftb.admin.dto;

import com.mftb.admin.entity.BizGiftConsume;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 赠送消费流水视图对象
 */
@Data
public class GiftConsumeVO {

    private Long id;
    private Long giftRecordId;
    private String giftId;
    private Long groupId;
    /** 集团业务编号（实时关联集团表，如 JT000001） */
    private String groupCode;
    private String groupName;
    private Long storeId;
    /** 门店业务编号（实时关联门店表，如 MD00001） */
    private String storeCode;
    private String storeName;
    private String brand;
    private String adType;
    private String tradeType;
    private Integer balanceChange;
    private LocalDate changeDate;
    private String algorithmId;
    private String algorithmName;
    private String orderNo;
    private Integer remainingDays;
    private String remark;
    private LocalDateTime createdAt;

    public static GiftConsumeVO from(BizGiftConsume consume) {
        GiftConsumeVO vo = new GiftConsumeVO();
        vo.setId(consume.getId());
        vo.setGiftRecordId(consume.getGiftRecordId());
        vo.setGiftId(consume.getGiftId());
        vo.setGroupId(consume.getGroupId());
        vo.setGroupName(consume.getGroupName());
        vo.setStoreId(consume.getStoreId());
        vo.setStoreName(consume.getStoreName());
        vo.setBrand(consume.getBrand());
        vo.setAdType(consume.getAdType());
        vo.setTradeType(consume.getTradeType());
        vo.setBalanceChange(consume.getBalanceChange());
        vo.setChangeDate(consume.getChangeDate());
        vo.setAlgorithmId(consume.getAlgorithmId());
        vo.setAlgorithmName(consume.getAlgorithmName());
        vo.setOrderNo(consume.getOrderNo());
        vo.setRemainingDays(consume.getRemainingDays());
        vo.setRemark(consume.getRemark());
        vo.setCreatedAt(consume.getCreatedAt());
        return vo;
    }
}
