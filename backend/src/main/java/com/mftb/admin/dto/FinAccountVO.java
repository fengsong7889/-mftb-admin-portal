package com.mftb.admin.dto;

import com.mftb.admin.entity.FinAccount;
import com.mftb.admin.util.DateTimeUtils;
import lombok.Data;

import java.math.BigDecimal;

/**
 * 推广金账户视图对象（字段命名与前端账户余额表格 dataIndex 一致）
 */
@Data
public class FinAccountVO {

    private Long id;

    /** 集团ID（对应 biz_fin_account.group_code） */
    private String groupId;

    private String groupName;
    private String brand;
    private BigDecimal virtualBalance;
    private BigDecimal actualBalance;

    /** 账户状态: normal / frozen / mergeFrozen / cancelled */
    private String status;

    private String updatedBy;
    private String updatedAt;

    public static FinAccountVO from(FinAccount account) {
        FinAccountVO vo = new FinAccountVO();
        vo.setId(account.getId());
        vo.setGroupId(account.getGroupCode());
        vo.setGroupName(account.getGroupName());
        vo.setBrand(account.getBrand());
        vo.setVirtualBalance(account.getVirtualBalance());
        vo.setActualBalance(account.getActualBalance());
        vo.setStatus(account.getStatus());
        vo.setUpdatedBy(account.getUpdatedBy());
        vo.setUpdatedAt(DateTimeUtils.format(account.getUpdatedAt()));
        return vo;
    }
}
