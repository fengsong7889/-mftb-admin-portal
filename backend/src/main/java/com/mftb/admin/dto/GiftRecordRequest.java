package com.mftb.admin.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.List;

/**
 * 赠送申请请求
 */
@Data
public class GiftRecordRequest {

    @NotNull(message = "集团不能为空")
    private Long groupId;

    @NotNull(message = "门店不能为空")
    private Long storeId;

    @NotBlank(message = "品牌不能为空")
    private String brand;

    @NotBlank(message = "广告类型不能为空")
    private String adType;

    @NotNull(message = "赠送天数不能为空")
    private Integer giftDays;

    @NotNull(message = "有效期不能为空")
    private Integer validDays;

    @NotBlank(message = "赠送原因不能为空")
    private String reason;

    /** 凭证URL列表 */
    private List<String> credentials;
}
