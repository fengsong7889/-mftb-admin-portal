package com.mftb.admin.dto;

import lombok.Data;

import java.util.List;

/**
 * 批量補錄受理信息請求（存量導入需求）。
 *
 * <p>場景：存量導入直接落了已准入狀態（如評審通過），但沒有走「接受需求」，
 * 因此 {@code promised_prd_date} 為空、也沒有產品經理 PRD 任務。
 * 本接口只補「受理事實 + 產品任務」，<b>不改需求狀態</b>：
 * 導入時已生成 approved PRD，把狀態退回受理前會造成「狀態說沒 PRD、庫裡有定稿 PRD」的矛盾。
 *
 * <p>僅對受理後、排期前的 PRD 階段（accepted/prd_designing/reviewing/review_passed）
 * 且尚無未取消 prd 任務的需求生效；其餘狀態逐條跳過，不靜默改寫。
 */
@Data
public class RdmBatchBackfillAcceptDTO {

    /** 目標需求 ID 列表（上限 500，去重後逐條處理） */
    private List<Long> ids;

    /** 承諾出 PRD 日期（YYYY-MM-DD，必填）：產品任務的計劃完成日 */
    private String promisedPrdDate;

    /**
     * 補齊/改派的產品經理 sys_user.id（選填）。
     * <p>留空時沿用需求當前受理人；當前也為空的行會被跳過（任務負責人不能為空，
     * 否則任務視圖與負載裡看不到人）。
     */
    private Long pmUserId;

    /** 補錄說明（寫入每條需求的狀態流水） */
    private String remark;
}
