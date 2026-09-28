package com.mftb.admin.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

/** 评分提交请求（自评与上级评共用；总分由服务端按权重计算，不接受前端总分） */
@Data
public class HrPerfScoreSubmitDTO {

    @Size(max = 1000, message="\u8bc4\u8bed\u4e0d\u80fd\u8d85\u8fc7 1000 \u5b57")
    private String comment;

    /** 目标状态：true 表示提交进入下一阶段，false 表示仅暂存明细 */
    private Boolean submit;

    @NotEmpty(message="\u8bf7\u81f3\u5c11\u586b\u5199\u4e00\u9879\u6307\u6807\u8bc4\u5206")
    @Valid
    private List<ItemScore> items;

    /** 单指标打分 */
    @Data
    public static class ItemScore {
        @NotNull(message="\u6253\u5206\u660e\u7ec6 id \u7f3a\u5931")
        private Long itemId;
        @Size(max = 500, message="\u5b8c\u6210\u60c5\u51b5\u4e0d\u80fd\u8d85\u8fc7 500 \u5b57")
        private String targetValue;
        @NotNull(message="\u6bcf\u9879\u6307\u6807\u90fd\u5fc5\u987b\u6253\u5206")
        private BigDecimal score;
        @Size(max = 500, message="\u5907\u6ce8\u4e0d\u80fd\u8d85\u8fc7 500 \u5b57")
        private String remark;
    }
}
