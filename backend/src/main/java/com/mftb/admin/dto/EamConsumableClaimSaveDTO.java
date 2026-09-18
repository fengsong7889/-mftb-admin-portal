package com.mftb.admin.dto;

import lombok.Data;

import java.util.List;

/**
 * 耗材领用申请保存参数
 */
@Data
public class EamConsumableClaimSaveDTO {
    /** 领用事由 */
    private String reason;
    /** 备注 */
    private String remark;
    /** 领用明细 */
    private List<Line> items;

    @Data
    public static class Line {
        /** 耗材 ID */
        private Long itemId;
        /** 领用数量 */
        private Integer qty;
        /** 出库仓库 ID */
        private Long locationId;
    }
}
