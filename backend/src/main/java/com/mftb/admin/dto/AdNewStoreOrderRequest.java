package com.mftb.admin.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.time.LocalDate;
import java.util.List;

/**
 * 新店广告下单请求（赠送天数全额抵扣，无推广金扣款，实付为 $0）
 */
@Data
public class AdNewStoreOrderRequest {

    /** 算法ID */
    @NotNull(message = "算法不能为空")
    private Long algoId;

    /** 购买集团ID */
    @NotBlank(message = "購買集團不能為空")
    private String groupCode;

    /** 购买门店ID */
    @NotBlank(message = "門店不能為空")
    private String storeCode;

    /** 归属BD */
    private String bdEmpId;

    /** 备注 */
    private String remark;

    /** 赠送天数（= 选购日期数，全额抵扣） */
    private Integer giftDays;

    /** 选购的日期列表 */
    @NotEmpty(message = "請至少選擇一個日期")
    private List<CellSelection> cells;

    /** 日期选择 */
    @Data
    public static class CellSelection {
        /** 投放日期 */
        private LocalDate bizDate;
    }
}
