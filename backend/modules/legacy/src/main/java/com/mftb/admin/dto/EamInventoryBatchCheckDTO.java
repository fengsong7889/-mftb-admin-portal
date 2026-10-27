package com.mftb.admin.dto;

import lombok.Data;

import java.util.List;

/** 批量核对 DTO：仅对显式勾选、尚无已保存核对结果的资产执行「实物完好+位置/持有人与账面一致」 */
@Data
public class EamInventoryBatchCheckDTO {

    /** 勾选的明细 ID（最多 100） */
    private List<Long> itemIds;

    /** 幂等键 */
    private String requestKey;
}
