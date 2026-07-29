package com.mftb.admin.dto;

import lombok.Getter;
import lombok.Setter;
import org.springframework.format.annotation.DateTimeFormat;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 分页 + 审计字段（最后更新人 / 最后更新时间 / 创建时间）通用查询条件
 */
@Getter
@Setter
public abstract class AuditPageQuery {

    /** 页码，从 1 开始 */
    private long page = 1;

    /** 每页条数 */
    private long size = 10;

    /** 最后更新人（模糊匹配） */
    private String updatedBy;

    /** 最后更新时间-开始日期 */
    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
    private LocalDate updatedFrom;

    /** 最后更新时间-结束日期 */
    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
    private LocalDate updatedTo;

    /** 创建时间-开始日期 */
    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
    private LocalDate createdFrom;

    /** 创建时间-结束日期 */
    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
    private LocalDate createdTo;

    /** 最后更新时间下界（开始日期当天 00:00:00） */
    public LocalDateTime updatedFromTime() {
        return startOf(updatedFrom);
    }

    /** 最后更新时间上界（结束日期次日 00:00:00，按开区间比较以包含结束日全天） */
    public LocalDateTime updatedToTime() {
        return endExclusive(updatedTo);
    }

    /** 创建时间下界（开始日期当天 00:00:00） */
    public LocalDateTime createdFromTime() {
        return startOf(createdFrom);
    }

    /** 创建时间上界（结束日期次日 00:00:00，按开区间比较以包含结束日全天） */
    public LocalDateTime createdToTime() {
        return endExclusive(createdTo);
    }

    private static LocalDateTime startOf(LocalDate date) {
        return date == null ? null : date.atStartOfDay();
    }

    private static LocalDateTime endExclusive(LocalDate date) {
        return date == null ? null : date.plusDays(1).atStartOfDay();
    }
}
