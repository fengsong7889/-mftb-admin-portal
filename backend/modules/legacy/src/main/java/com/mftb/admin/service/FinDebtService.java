package com.mftb.admin.service;

import com.mftb.admin.dto.DebtRepaymentDTO;
import com.mftb.admin.dto.FinDebtBillVO;
import com.mftb.admin.dto.FinDebtPageVO;
import com.mftb.admin.dto.FinDebtQuery;

/**
 * 欠款对账服务（欠款单查询 + 还款记录维护）
 */
public interface FinDebtService {

    /** 欠款单列表（分页 + 闪蜂/mFood 品牌待还统计） */
    FinDebtPageVO page(FinDebtQuery query);

    /** 欠款单详情（含还款明细） */
    FinDebtBillVO detail(String billNo);

    /** 新增扣款（还款记录） */
    void addRepayment(String billNo, DebtRepaymentDTO request);

    /** 删除还款记录（系统生成的转移结算记录不可删除） */
    void deleteRepayment(Long id);
}
