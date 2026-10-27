package com.mftb.admin.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

/**
 * 商户合并申请（字段与前端 MergeAdd 提交的 extra 一致）
 */
@Data
public class MergeApplyDTO {

    /** 注销方集团ID */
    private String sourceGroupId;
    private String sourceGroupName;

    /** 注销方品牌 */
    private String brand;

    /** 注销方虚拟余额（前端展示值，后端以账户实际余额结转） */
    private BigDecimal sourceVirtualBalance;

    /** 注销方待还欠款总额 */
    private BigDecimal sourceDebtAmount;

    /** 存续方集团ID */
    private String targetGroupId;
    private String targetGroupName;

    /** 存续方欠款偿还门店明细（生成存续方欠款单） */
    private List<StoreAmountDTO> repayStores;

    private String remark;
}
