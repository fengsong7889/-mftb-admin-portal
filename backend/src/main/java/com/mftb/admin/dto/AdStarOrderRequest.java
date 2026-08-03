package com.mftb.admin.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.time.LocalDate;
import java.util.List;

/**
 * 无敌星星下单请求（从推广金账户扣款）
 */
@Data
public class AdStarOrderRequest {

    /** 算法ID */
    @NotNull(message = "算法不能为空")
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

    /** 选购的格子列表（组合商圈在前端拆解后传入） */
    @NotEmpty(message = "请至少选择一个格子")
    private List<CellSelection> cells;

    /** 格子选择 */
    @Data
    public static class CellSelection {
        /** 投放日期 */
        private LocalDate bizDate;
        /** 商圈 */
        private Integer region;
        /** 餐段时段: breakfast/lunch/afternoon/dinner/supper */
        private String mealSlot;
    }
}
