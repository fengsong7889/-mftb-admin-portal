package com.mftb.admin.dto;

import lombok.Getter;
import lombok.Setter;
import org.springframework.format.annotation.DateTimeFormat;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * OA流程事项列表查询条件
 */
@Getter
@Setter
public class OaRequestQuery {

    /** 页码，从 1 开始 */
    private long page = 1;

    /** 每页条数 */
    private long size = 10;

    /** 流程编号（模糊匹配） */
    private String flowNo;

    /** 流程类型编码 */
    private String processCode;

    /** 申请人（模糊匹配） */
    private String applicant;

    /** 流程状态: pending / approved / rejected / cancelled */
    private String flowStatus;

    /** 申请时间-开始日期 */
    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
    private LocalDate applyFrom;

    /** 申请时间-结束日期 */
    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
    private LocalDate applyTo;

    public LocalDateTime applyFromTime() {
        return applyFrom == null ? null : applyFrom.atStartOfDay();
    }

    public LocalDateTime applyToTime() {
        return applyTo == null ? null : applyTo.plusDays(1).atStartOfDay();
    }
}
