package com.mftb.admin.dto;

import com.mftb.admin.entity.BizStore;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 门店视图对象
 */
@Data
public class StoreVO {

    private Long id;
    private Long groupId;
    private String groupCode;
    private String groupName;
    private String storeCode;
    private String storeName;
    private String brand;
    private String bizChannel;
    private String loginAccount;
    private String updatedBy;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public static StoreVO from(BizStore store, String groupCode, String groupName) {
        StoreVO vo = new StoreVO();
        vo.setId(store.getId());
        vo.setGroupId(store.getGroupId());
        vo.setGroupCode(groupCode);
        vo.setGroupName(groupName);
        vo.setStoreCode(store.getStoreCode());
        vo.setStoreName(store.getStoreName());
        vo.setBrand(store.getBrand());
        vo.setBizChannel(store.getBizChannel());
        vo.setLoginAccount(store.getLoginAccount());
        vo.setUpdatedBy(store.getUpdatedBy());
        vo.setCreatedAt(store.getCreatedAt());
        vo.setUpdatedAt(store.getUpdatedAt());
        return vo;
    }
}
