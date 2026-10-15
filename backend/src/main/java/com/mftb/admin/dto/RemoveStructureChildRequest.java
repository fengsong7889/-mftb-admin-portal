package com.mftb.admin.dto;

import lombok.Data;

/**
 * 移除結構子需求請求體（Batch 2 / Phase 2）。
 * <p>只解除確實掛在 {@code parentReqId} 下的 {@code childReqId}；服務端校驗歸屬，
 * 避免誤改他人結構。
 */
@Data
public class RemoveStructureChildRequest {

    /** 結構父需求ID（必填） */
    private Long parentReqId;

    /** 子需求ID（必填） */
    private Long childReqId;
}
