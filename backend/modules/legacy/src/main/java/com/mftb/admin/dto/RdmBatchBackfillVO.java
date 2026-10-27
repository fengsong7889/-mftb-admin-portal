package com.mftb.admin.dto;

import lombok.Data;

/**
 * 批量補錄受理信息結果。
 *
 * <p>跳過原因必須分開返回：全部靜默成功會讓「108 條裡有 6 條沒補上」被誤判成已完成。
 */
@Data
public class RdmBatchBackfillVO {

    /** 實際補錄成功條數（已寫承諾日期 + 產品任務 + 流水） */
    private int updated;

    /** 因缺少可用的產品經理跳過的條數（未分配、已離職/停用；需先批量分配或指定產品經理後重試） */
    private int skippedNoPm;

    /** 因狀態不適用跳過的條數（非 PRD 階段 / V3 分批交付 / 需求不存在） */
    private int skippedStatus;
}
