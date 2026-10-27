package com.mftb.admin.dto;

import lombok.Data;

import java.time.LocalDateTime;

/** 查閱留痕按文檔聚合的原始行（DocViewLogMapper 聚合查詢的載體） */
@Data
public class DocViewStatRow {

    private Long nodeId;

    /** 期間內閱讀次數 */
    private Long viewCount;

    /** 期間內閱讀人數（去重；user_id 為空的行不計入） */
    private Long readerCount;

    /** 期間內平均停留秒（duration_sec 為空的記錄按 SQL AVG 語義自動忽略） */
    private Double avgDurationSec;

    /** 期間內最近一次閱讀時間 */
    private LocalDateTime lastViewedAt;
}
