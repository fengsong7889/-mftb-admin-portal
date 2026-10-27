package com.mftb.admin.dto;

import lombok.Data;

import java.util.List;

/**
 * 分页结果
 */
@Data
public class PageResult<T> {

    /** 分页上限，防止恶意请求导擎大量数据 */
    private static final long MAX_PAGE_SIZE = 200;

    private List<T> records;
    private Long total;

    public PageResult(List<T> records, Long total) {
        this.records = records;
        this.total = total;
    }

    /** 规范化分页参数: page >= 1, size 限制在 [1, MAX_PAGE_SIZE] */
    public static long normalizePage(long page) {
        return Math.max(1, page);
    }

    public static long normalizeSize(long size) {
        if (size <= 0) return 10;
        return Math.min(size, MAX_PAGE_SIZE);
    }
}
