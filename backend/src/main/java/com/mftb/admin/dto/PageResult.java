package com.mftb.admin.dto;

import lombok.Data;

import java.util.List;

/**
 * 分页结果
 */
@Data
public class PageResult<T> {

    private List<T> records;
    private Long total;

    public PageResult(List<T> records, Long total) {
        this.records = records;
        this.total = total;
    }
}
