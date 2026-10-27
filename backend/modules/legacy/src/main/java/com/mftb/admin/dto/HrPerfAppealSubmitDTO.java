package com.mftb.admin.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

/** 绩效申诉提交请求（仅员工自助入口使用，申诉人一律取登录人） */
@Data
public class HrPerfAppealSubmitDTO {

    @NotBlank(message="\u8bf7\u586b\u5199\u7533\u8bc9\u7406\u7531")
    @Size(max = 500, message="\u7533\u8bc9\u7406\u7531\u4e0d\u80fd\u8d85\u8fc7 500 \u5b57")
    private String reason;

    @Size(max = 500, message="\u671f\u671b\u5904\u7406\u4e0d\u80fd\u8d85\u8fc7 500 \u5b57")
    private String expectation;
}
