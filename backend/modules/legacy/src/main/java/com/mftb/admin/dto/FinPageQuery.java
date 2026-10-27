package com.mftb.admin.dto;

import lombok.Getter;
import lombok.Setter;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 财务模块分页查询基类
 */
@Getter
@Setter
public abstract class FinPageQuery {

    /** 页码，从 1 开始 */
    private long page = 1;

    /** 每页条数 */
    private long size = 10;

    /** 日期下界（当天 00:00:00） */
    protected static LocalDateTime startOf(LocalDate date) {
        return date == null ? null : date.atStartOfDay();
    }

    /** 日期上界（次日 00:00:00，按开区间比较以包含结束日全天） */
    protected static LocalDateTime endExclusive(LocalDate date) {
        return date == null ? null : date.plusDays(1).atStartOfDay();
    }
}
