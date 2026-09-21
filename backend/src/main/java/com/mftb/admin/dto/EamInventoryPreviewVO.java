package com.mftb.admin.dto;

import lombok.Data;

import java.util.List;
import java.util.Map;

/** 盘点范围预览结果 */
@Data
public class EamInventoryPreviewVO {

    /** 应盘总数 */
    private Integer total;

    /** 状态分布 status -> count */
    private Map<String, Long> statusCounts;

    /** 范围指纹（创建时回传校验） */
    private String scopeHash;

    /** 范围摘要（展开后的名称集合等，供确认框展示） */
    private Map<String, Object> scopeSummary;

    /** 样例资产（前若干条） */
    private List<EamInventoryItemVO> sample;
}
