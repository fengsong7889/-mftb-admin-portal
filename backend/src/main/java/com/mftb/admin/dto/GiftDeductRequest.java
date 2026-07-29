package com.mftb.admin.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

/**
 * 扣除赠送天数请求
 */
@Data
public class GiftDeductRequest {

    @NotNull(message = "扣除天数不能为空")
    @Min(value = 1, message = "扣除天数至少为1天")
    private Integer deductDays;

    /** 扣除原因 */
    private String reason;
}
