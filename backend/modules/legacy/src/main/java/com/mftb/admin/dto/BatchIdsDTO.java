package com.mftb.admin.dto;

import lombok.Data;

import java.util.List;

/**
 * 批量 ID 操作请求体（批量删除等）
 */
@Data
public class BatchIdsDTO {

    /** 目标记录 ID 列表 */
    private List<Long> ids;
}
