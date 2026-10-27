package com.mftb.admin.dto;

import lombok.Data;

import java.util.List;

/**
 * 批量變更需求提出人請求。
 *
 * <p>場景：存量導入/人員調整後，一批需求的業務歸屬人需要統一改到另一個人。
 * 提出人隻影響「誰是需求主人、誰能自助提交/撤回」，不改流程狀態，
 * 故不限制需求當前狀態（已上線也可更正歸屬），但必須有分配權或全量權。
 */
@Data
public class RdmBatchSubmitterDTO {

    /** 目標需求 ID 列表（上限 500，去重後逐條處理） */
    private List<Long> ids;

    /** 新的提出人 sys_user.id */
    private Long submitterUserId;

    /** 變更說明（寫入每條需求的狀態流水） */
    private String remark;
}
