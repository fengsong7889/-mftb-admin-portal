package com.mftb.admin.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.time.LocalDate;

/** 请假申请新增/编辑请求（天数与年度由后端按起止日期计算，不接受前端传入） */
@Data
public class HrLeaveRequestSaveDTO {

    @NotNull(message = "\u8acb\u9078\u64c7\u54e1\u5de5")
    private Long userId;

    @NotBlank(message = "\u5047\u671f\u985e\u578b\u4e0d\u80fd\u70ba\u7a7a")
    private String leaveType;

    @NotNull(message = "\u958b\u59cb\u65e5\u671f\u4e0d\u80fd\u70ba\u7a7a")
    private LocalDate startDate;

    @NotNull(message = "\u7d50\u675f\u65e5\u671f\u4e0d\u80fd\u70ba\u7a7a")
    private LocalDate endDate;

    private String reason;
}
