package com.mftb.admin.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.time.LocalDate;

/** 证明开具申请新增/编辑请求（申请人一律取登录人，不接受外部传入的 userId） */
@Data
public class HrCertificateSaveDTO {

    @NotBlank(message="\u8bc1\u660e\u7c7b\u578b\u4e0d\u80fd\u4e3a\u7a7a")
    private String certType;

    @NotBlank(message="\u8bc1\u660e\u7528\u9014\u4e0d\u80fd\u4e3a\u7a7a")
    @Size(max = 200, message="\u7528\u9014\u4e0d\u80fd\u8d85\u8fc7 200 \u5b57")
    private String purpose;

    @Size(max = 200, message="\u8bc1\u660e\u62ac\u5934\u4e0d\u80fd\u8d85\u8fc7 200 \u5b57")
    private String recipient;

    /** 证明语种：ZH/EN/BOTH，留空按中文 */
    private String language;

    @NotNull(message="\u8bf7\u586b\u5199\u6240\u9700\u4efd\u6570")
    @Min(value = 1, message="\u4efd\u6570\u81f3\u5c11\u4e3a 1")
    @Max(value = 20, message="\u4efd\u6570\u6700\u591a 20 \u4efd\uff0c\u8d85\u51fa\u8bf7\u62c6\u5206\u7533\u8bf7")
    private Integer copies;

    /** 期望取得日期，不早于今天 */
    private LocalDate expectDate;

    @Size(max = 500, message="\u8865\u5145\u8bf4\u660e\u4e0d\u80fd\u8d85\u8fc7 500 \u5b57")
    private String remark;
}
