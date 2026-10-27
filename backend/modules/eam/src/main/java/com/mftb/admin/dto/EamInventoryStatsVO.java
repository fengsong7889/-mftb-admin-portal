package com.mftb.admin.dto;

import lombok.Data;

/** 盘点结构化统计（任务级，供列表/详情/结束确认/导出共用同一口径） */
@Data
public class EamInventoryStatsVO {

    /** 应盘数（发起时固定清单数量） */
    private Integer expectedCount;

    /** 已核对数 */
    private Integer checkedCount;

    /** 实物确认数（完好+损坏） */
    private Integer confirmedCount;

    /** 未完成核对数（应盘-已核对） */
    private Integer notCheckedCount;

    /** 异常资产去重数 */
    private Integer anomalyCount;

    /** 未找到数 */
    private Integer missingCount;

    /** 实物损坏数 */
    private Integer damagedCount;

    /** 位置差异数 */
    private Integer locationDiffCount;

    /** 持有人差异数 */
    private Integer holderDiffCount;

    /** 期间业务变更待复核数 */
    private Integer recheckCount;
}
