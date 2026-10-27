package com.mftb.admin.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

/** 考核模板保存请求：等级方案与指标清单随模板一起提交（整体替换语义） */
@Data
public class HrPerfTemplateSaveDTO {

    @NotBlank(message="\u8bf7\u586b\u5199\u6a21\u677f\u540d\u79f0")
    @Size(max = 64, message="\u6a21\u677f\u540d\u79f0\u4e0d\u80fd\u8d85\u8fc7 64 \u5b57")
    private String name;

    /** 适用周期类型，留空表示通用 */
    private String applyCycleType;

    @NotNull(message="\u8bf7\u586b\u5199\u6743\u91cd\u5408\u8ba1")
    private Integer weightSum;

    private Integer status;

    @Size(max = 500, message="\u5907\u6ce8\u4e0d\u80fd\u8d85\u8fc7 500 \u5b57")
    private String remark;

    @NotEmpty(message="\u81f3\u5c11\u9700\u8981\u4e00\u4e2a\u7b49\u7ea7")
    @Valid
    private List<GradeRule> grades;

    @NotEmpty(message="\u81f3\u5c11\u9700\u8981\u4e00\u4e2a\u8003\u6838\u6307\u6807")
    @Valid
    private List<IndicatorItem> indicators;

    /** 等级规则：code 取字典 PERF_GRADE，minScore 为该等级分值下限 */
    @Data
    public static class GradeRule {
        @NotBlank(message="\u7b49\u7ea7\u7f16\u7801\u4e0d\u80fd\u4e3a\u7a7a")
        private String code;
        @NotNull(message="\u8bf7\u586b\u5199\u7b49\u7ea7\u5206\u503c\u4e0b\u9650")
        private Integer minScore;
        /** 建议占比（百分数，可空表示不做强制分布） */
        private Integer ratio;
    }

    /** 指标项 */
    @Data
    public static class IndicatorItem {
        private Long id;
        @NotBlank(message="\u6307\u6807\u540d\u79f0\u4e0d\u80fd\u4e3a\u7a7a")
        @Size(max = 128, message="\u6307\u6807\u540d\u79f0\u4e0d\u80fd\u8d85\u8fc7 128 \u5b57")
        private String name;
        private String indicatorType;
        @NotNull(message="\u8bf7\u586b\u5199\u6307\u6807\u6743\u91cd")
        private BigDecimal weight;
        @Size(max = 500, message="\u76ee\u6807\u63cf\u8ff0\u4e0d\u80fd\u8d85\u8fc7 500 \u5b57")
        private String targetDesc;
        @Size(max = 500, message="\u8bc4\u5206\u53e3\u5f84\u4e0d\u80fd\u8d85\u8fc7 500 \u5b57")
        private String scoringDesc;
    }
}
