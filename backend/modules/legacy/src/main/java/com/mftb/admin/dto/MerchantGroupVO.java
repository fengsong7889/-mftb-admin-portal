package com.mftb.admin.dto;

import com.mftb.admin.entity.BizMerchantGroup;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 商户集团视图对象
 */
@Data
public class MerchantGroupVO {

    private Long id;
    private String groupCode;
    private String groupName;
    private String loginAccount;
    /** 门店数量 */
    private Long storeCount;
    private String updatedBy;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public static MerchantGroupVO from(BizMerchantGroup group, Long storeCount) {
        MerchantGroupVO vo = new MerchantGroupVO();
        vo.setId(group.getId());
        vo.setGroupCode(group.getGroupCode());
        vo.setGroupName(group.getGroupName());
        vo.setLoginAccount(group.getLoginAccount());
        vo.setStoreCount(storeCount != null ? storeCount : 0L);
        vo.setUpdatedBy(group.getUpdatedBy());
        vo.setCreatedAt(group.getCreatedAt());
        vo.setUpdatedAt(group.getUpdatedAt());
        return vo;
    }
}
