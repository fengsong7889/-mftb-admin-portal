package com.mftb.admin.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import java.math.BigDecimal;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.time.LocalDate;
import java.util.List;

/**
 * 人气商家下单请求（从推广金账户扣款）
 */
@Data
public class AdHotOrderRequest {

    /** 算法ID */
    @NotNull(message = "算法不能為空")
    private Long algoId;

    /** 购买集团ID（关联推广金账户） */
    @NotBlank(message = "購買集團不能為空")
    private String groupCode;

    /** 购买门店ID */
    private String storeCode;

    /** 归属BD */
    private String bdEmpId;

    /** 备注 */
    private String remark;

    /** 赠送天数抵扣（来自赠送管理发放的余额） */
    @Min(value = 0, message = "贈送天數不能為負數")
    private Integer giftDays;

    /** 客户端已确认的试算金额，仅用于过期校验，不作为计价依据。 */
    @DecimalMin(value = "0", message = "確認金額不能為負數")
    @Digits(integer = 16, fraction = 2, message = "確認金額最多兩位小數")
    private BigDecimal expectedAmount;

    /** 选购的格子列表（皮肤 x 日期） */
    @NotEmpty(message = "請至少選擇一個格子")
    @Valid
    private List<@NotNull CellSelection> cells;

    /** 格子选择 */
    @Data
    public static class CellSelection {
        /** 投放日期 */
        @NotNull(message = "投放日期不能為空")
        private LocalDate bizDate;
        /** 皮肤名称 */
        @NotBlank(message = "皮膚名稱不能為空")
        private String skinName;
    }
}
