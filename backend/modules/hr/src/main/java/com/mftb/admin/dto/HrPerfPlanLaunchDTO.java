package com.mftb.admin.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.time.LocalDate;
import java.util.List;

/** 考核计划发起请求：圈定部门/职级范围并给出四阶段时间窗 */
@Data
public class HrPerfPlanLaunchDTO {

    @NotNull(message="\u8bf7\u9009\u62e9\u8003\u6838\u5468\u671f")
    private Long cycleId;

    @NotNull(message="\u8bf7\u9009\u62e9\u8003\u6838\u6a21\u677f")
    private Long templateId;

    @NotBlank(message="\u8bf7\u586b\u5199\u8ba1\u5212\u540d\u79f0")
    @Size(max = 64, message="\u8ba1\u5212\u540d\u79f0\u4e0d\u80fd\u8d85\u8fc7 64 \u5b57")
    private String name;

    @NotEmpty(message="\u8bf7\u81f3\u5c11\u9009\u62e9\u4e00\u4e2a\u90e8\u95e8")
    private List<Long> deptIds;

    /** 职级过滤，空表示不限 */
    private List<String> positionLevels;

    @NotNull(message="\u8bf7\u586b\u5199\u81ea\u8bc4\u5f00\u59cb\u65e5\u671f")
    private LocalDate selfStart;
    @NotNull(message="\u8bf7\u586b\u5199\u81ea\u8bc4\u622a\u6b62\u65e5\u671f")
    private LocalDate selfEnd;
    @NotNull(message="\u8bf7\u586b\u5199\u4e0a\u7ea7\u8bc4\u5f00\u59cb\u65e5\u671f")
    private LocalDate supStart;
    @NotNull(message="\u8bf7\u586b\u5199\u4e0a\u7ea7\u8bc4\u622a\u6b62\u65e5\u671f")
    private LocalDate supEnd;
    @NotNull(message="\u8bf7\u586b\u5199\u6821\u51c6\u622a\u6b62\u65e5\u671f")
    private LocalDate calibEnd;

    @Size(max = 500, message="\u8ba1\u5212\u8bf4\u660e\u4e0d\u80fd\u8d85\u8fc7 500 \u5b57")
    private String summary;
}
