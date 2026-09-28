package com.mftb.admin.dto;

import lombok.Data;

/**
 * 借用统计 VO（“我的资产”借用页签数据源）
 */
@Data
public class EamBorrowStatsVO {
    /** 借用中 */
    private Long activeCount;
    /** 已逾期 */
    private Long overdueCount;
    /** 已归还 */
    private Long returnedCount;
    /** 全部借用记录 */
    private Long totalCount;
}
