package com.mftb.admin.dto;

import lombok.Data;

import java.util.List;

/**
 * 充消对账查询结果（日报明细 + 周期汇总）
 */
@Data
public class FinReconcileVO {

    private List<FinReconcileRowVO> records;
    private long total;
    private FinReconcileSummaryVO summary;
}
