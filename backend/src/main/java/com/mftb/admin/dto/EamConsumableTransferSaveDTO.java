package com.mftb.admin.dto;

import lombok.Data;

/** 库存调拨保存参数 */
@Data
public class EamConsumableTransferSaveDTO {
    /** 耗材ID */
    private Long itemId;
    /** 调出仓库ID */
    private Long fromLocationId;
    /** 调入仓库ID */
    private Long toLocationId;
    /** 调拨数量 */
    private Integer qty;
}
