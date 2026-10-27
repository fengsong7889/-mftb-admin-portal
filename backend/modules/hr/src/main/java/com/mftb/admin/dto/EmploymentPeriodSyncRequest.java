package com.mftb.admin.dto;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.List;

/**
 * 「按任职事实登记雇佣期间」请求。
 * <p>必须逐人点名：不提供「全量一键」的入口，因为差异报告里的可登记人数会随范围与口径变化，
 * 一个无参数的批量按钮等于让任何人（哪怕只拿到一次 edit 权）把全公司历史一次性物化。
 */
@Data
public class EmploymentPeriodSyncRequest {

    /** 要登记/修复的员工 id 列表（服务端逐个校验组织数据范围与任职锚点） */
    @NotEmpty(message = "請至少選擇一名員工")
    @Size(max = 200, message = "單次最多登記 200 名員工，請分批執行")
    private List<Long> userIds;

    /**
     * 登记理由（进审计的 reason 列）。
     * <p>不强制非空，但鼓励界面带上：批量物化历史本身就是一种口径判定，
     * 事后没人知道当时为什么这么做，审计就只能回答「做了什么」而不能回答「为什么」。
     */
    @Size(max = 200, message = "理由最長 200 字")
    private String reason;
}
