package com.mftb.admin.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.time.LocalDate;
import java.util.List;

/**
 * 金字招牌下单请求（从推广金账户扣款）
 */
@Data
public class AdSignboardOrderRequest {

    /** 定价配置ID（biz_ad_pricing_signboard.id） */
    @NotNull(message = "定价配置不能为空")
    private Long algoId;

    /** 购买集团ID（关联推广金账户） */
    @NotBlank(message = "购买集团不能为空")
    private String groupCode;

    /** 购买门店ID */
    private String storeCode;

    /** 归属BD */
    private String bdEmpId;

    /** 备注 */
    private String remark;

    /** 赠送天数抵扣（来自赠送管理发放的余额） */
    private Integer giftDays;

    /** 选购的格子列表（标签 x 日期） */
    @NotEmpty(message = "请至少选择一个格子")
    private List<CellSelection> cells;

    /** 格子选择 */
    @Data
    public static class CellSelection {
        /** 投放日期 */
        private LocalDate bizDate;
        /** 标签类型（hot/popular/sales/rating/repurchase/favorites/customers） */
        private String labelType;
        /** 场景（all_macau/district/null，对比类标签必传，统计类不传） */
        private String scenario;
    }
}
