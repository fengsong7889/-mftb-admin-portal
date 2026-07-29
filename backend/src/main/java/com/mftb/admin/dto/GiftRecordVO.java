package com.mftb.admin.dto;

import com.mftb.admin.entity.BizGiftRecord;
import com.mftb.admin.util.JsonUtils;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 赠送记录视图对象
 */
@Data
public class GiftRecordVO {

    private Long id;
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
    private Integer totalDays;
    private Integer validDays;
    private Integer usedDays;
    private Integer remainingDays;
    private LocalDate giftDate;
    private LocalDate expireDate;
    private Integer status;
    private String reason;
    private List<String> credentials;
    private String approvalNo;
    private String applicant;
    private LocalDateTime applyTime;
    private Integer approvalStatus;
    private LocalDateTime createdAt;

    public static GiftRecordVO from(BizGiftRecord record) {
        GiftRecordVO vo = new GiftRecordVO();
        vo.setId(record.getId());
        vo.setGiftId(record.getGiftId());
        vo.setGroupId(record.getGroupId());
        vo.setGroupName(record.getGroupName());
        vo.setStoreId(record.getStoreId());
        vo.setStoreName(record.getStoreName());
        vo.setBrand(record.getBrand());
        vo.setAdType(record.getAdType());
        vo.setTotalDays(record.getTotalDays());
        vo.setValidDays(record.getValidDays());
        vo.setUsedDays(record.getUsedDays());
        vo.setRemainingDays(record.getRemainingDays());
        vo.setGiftDate(record.getGiftDate());
        vo.setExpireDate(record.getExpireDate());
        vo.setStatus(record.getStatus());
        vo.setReason(record.getReason());
        vo.setCredentials(JsonUtils.parseStringList(record.getCredentials()));
        vo.setApprovalNo(record.getApprovalNo());
        vo.setApplicant(record.getApplicant());
        vo.setApplyTime(record.getApplyTime());
        vo.setApprovalStatus(record.getApprovalStatus());
        vo.setCreatedAt(record.getCreatedAt());
        return vo;
    }
}
