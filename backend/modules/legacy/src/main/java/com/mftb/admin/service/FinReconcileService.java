package com.mftb.admin.service;

import com.mftb.admin.dto.FinReconcileQuery;
import com.mftb.admin.dto.FinReconcileVO;

/**
 * 充消对账服务（按集团按日实时聚合交易明细，不落对账表）
 */
public interface FinReconcileService {

    /** 充消对账日报（分页 + 周期总账汇总） */
    FinReconcileVO writeoff(FinReconcileQuery query);
}
