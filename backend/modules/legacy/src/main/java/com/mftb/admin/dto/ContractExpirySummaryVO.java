package com.mftb.admin.dto;

import lombok.Data;

import java.util.List;

/**
 * 合同到期预警汇总 (P0 人事缺口)
 * <p>
 * 口径：只统计endDate有值且状态非「已终止」的合同；
 * expired = 到期日早于今天（到期未处理，需续签或解除）；
 * due30/due60/due90 = 到期日落在 [今天, 今天+N] 区间内，为「N 天内」累计口径
 * （即 due60 包含 due30 的合同）；expired 与 dueX 互斥。
 */
@Data
public class ContractExpirySummaryVO {

    /** 预警窗口天数（前端 Tab 用，默认 90） */
    private int days;

    /** 合同总数（台账「全部」页签计数，不受状态/分桶过滤影响） */
    private long total;

    /** 已过期未处理数量 */
    private long expired;

    /** 30 天内到期数量 */
    private long due30;

    /** 60 天内到期数量 */
    private long due60;

    /** 90 天内到期数量 */
    private long due90;

    /** 无固定期限（endDate 为空）的合同数量，不计入到期预警 */
    private long noEndDate;

    /** 最近到期的若干条明细（按到期日升序，供预警面板直接展示） */
    private List<ContractLedgerVO> soonest;
}
