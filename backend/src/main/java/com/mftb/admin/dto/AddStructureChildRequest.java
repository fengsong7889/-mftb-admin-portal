package com.mftb.admin.dto;

import lombok.Data;

/**
 * 添加結構子需求請求體（Batch 2 / Phase 2）。
 * <p>把 {@code childReqId} 掛到聚合需求 {@code parentReqId} 之下；環檢測、單父約束、
 * 父需為 aggregate 類型等校驗一律在服務端強制，前端傳入的 id 只作定位、不作信任邊界。
 */
@Data
public class AddStructureChildRequest {

    /** 結構父需求ID（必填，必須是 aggregate 聚合需求） */
    private Long parentReqId;

    /** 子需求ID（必填，不能已有結構父） */
    private Long childReqId;
}
