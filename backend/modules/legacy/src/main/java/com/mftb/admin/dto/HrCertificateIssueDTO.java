package com.mftb.admin.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.time.LocalDate;

/** 证明开具登记请求（人事在台账上填写实际出具的编号与领取方式） */
@Data
public class HrCertificateIssueDTO {

    @NotBlank(message="\u8bf7\u586b\u5199\u5b9e\u9645\u51fa\u5177\u7684\u8bc1\u660e\u7f16\u53f7")
    @Size(max = 64, message="\u8bc1\u660e\u7f16\u53f7\u4e0d\u80fd\u8d85\u8fc7 64 \u5b57")
    private String certNo;

    @NotNull(message="\u8bf7\u586b\u5199\u5f00\u5177\u65e5\u671f")
    private LocalDate issueDate;

    /** 领取方式：SELF/DELIVERY/ELECTRONIC */
    @NotBlank(message="\u8bf7\u9009\u62e9\u9886\u53d6\u65b9\u5f0f")
    private String pickupType;

    @Size(max = 300, message="\u5907\u6ce8\u4e0d\u80fd\u8d85\u8fc7 300 \u5b57")
    private String remark;
}
