package com.mftb.admin.dto;

import lombok.Data;

/**
 * 跨交付項任務依賴請求體（Batch 2 / Phase 2）。
 * <p>表達「後續交付項在某節點被前置交付項阻斷」：{@code blockPoint} 取 start（開工）/
 * test（提測）/ release（上線）。同一交付項內的兩個任務不是跨交付項依賴，服務端會回落到需求內依賴；
 * 跨交付項成環在服務端以交付項為節點做 DAG 檢測後拒絕。
 */
@Data
public class CrossDependencyRequest {

    /** 前置任務ID（必填） */
    private Long predTaskId;

    /** 後續任務ID（必填） */
    private Long succTaskId;

    /** 依賴類型（缺省 FS，與需求內依賴口徑一致） */
    private String depType;

    /** 阻斷點：start / test / release（缺省 start） */
    private String blockPoint;
}
