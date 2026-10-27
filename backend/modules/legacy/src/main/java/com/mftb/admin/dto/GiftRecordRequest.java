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

    @NotNull(message = "集團不能為空")
    private Long groupId;

    @NotNull(message = "門店不能為空")
    private Long storeId;

    @NotBlank(message = "品牌不能為空")
    private String brand;

    @NotBlank(message = "廣告類型不能為空")
    private String adType;

    @NotNull(message = "贈送天數不能為空")
    private Integer giftDays;

    @NotNull(message = "有效期不能為空")
    private Integer validDays;

    @NotBlank(message = "贈送原因不能為空")
    private String reason;

    /** 凭证URL列表 */
    private List<String> credentials;

    /** 审批流程编号（赠送审批通过后写入，可选） */
    private String approvalNo;
}
