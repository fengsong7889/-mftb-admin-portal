package com.mftb.admin.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.time.LocalDate;

/** 考核周期新增/编辑请求（编码唯一，发布后不得改周期类型） */
@Data
public class HrPerfCycleSaveDTO {

    @NotBlank(message="\u8bf7\u586b\u5199\u5468\u671f\u7f16\u7801")
    @Size(max = 32, message="\u5468\u671f\u7f16\u7801\u4e0d\u80fd\u8d85\u8fc7 32 \u5b57")
    private String code;

    @NotBlank(message="\u8bf7\u586b\u5199\u5468\u671f\u540d\u79f0")
    @Size(max = 64, message="\u5468\u671f\u540d\u79f0\u4e0d\u80fd\u8d85\u8fc7 64 \u5b57")
    private String name;

    @NotBlank(message="\u8bf7\u9009\u62e9\u5468\u671f\u7c7b\u578b")
    private String cycleType;

    @NotNull(message="\u8bf7\u9009\u62e9\u8003\u6838\u671f\u5f00\u59cb\u65e5\u671f")
    private LocalDate periodStart;

    @NotNull(message="\u8bf7\u9009\u62e9\u8003\u6838\u671f\u7ed3\u675f\u65e5\u671f")
    private LocalDate periodEnd;

    @Size(max = 500, message="\u5907\u6ce8\u4e0d\u80fd\u8d85\u8fc7 500 \u5b57")
    private String remark;
}
