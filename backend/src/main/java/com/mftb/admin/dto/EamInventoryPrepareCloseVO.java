package com.mftb.admin.dto;

import lombok.Data;

/** 结束预检查结果 */
@Data
public class EamInventoryPrepareCloseVO {

    /** 任务修订号（正式结束回传） */
    private Integer taskRevision;

    /** 台账比对指纹（正式结束回传，二次校验） */
    private String prepareHash;

    /** 未完成核对数 */
    private Integer notCheckedCount;

    /** 期间变更待复核数 */
    private Integer recheckCount;

    /** 已存在实质核对记录数 */
    private Integer checkedCount;

    /** 是否允许完整完成（未完成数为 0） */
    private Boolean canComplete;

    /** 是否允许部分完成（有实质核对且仍有未完成） */
    private Boolean canPartial;

    /** 结构化统计 */
    private EamInventoryStatsVO stats;
}
