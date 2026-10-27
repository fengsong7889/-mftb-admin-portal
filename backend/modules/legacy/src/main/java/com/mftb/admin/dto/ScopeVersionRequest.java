package com.mftb.admin.dto;

import lombok.Data;

/**
 * 交付項範圍變更（新範圍版本）請求體（Batch 2 / Phase 2）。
 * <p>範圍凍結後要改口徑，必須走「新範圍版本」留痕：version+1、解凍、舊範圍下的測試/驗收證據登記失效。
 * {@code changeReason} 為必填——沒有原因的範圍變更等於偷偷改驗收口徑。
 */
@Data
public class ScopeVersionRequest {

    /** 範圍變更原因（必填） */
    private String changeReason;

    /** 新的範圍描述（可選，傳入則覆蓋） */
    private String newScopeDesc;

    /** 新的驗收標準（可選，傳入則覆蓋） */
    private String newAcceptanceCriteria;
}
