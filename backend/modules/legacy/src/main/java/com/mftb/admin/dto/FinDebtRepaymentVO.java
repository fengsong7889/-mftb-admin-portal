package com.mftb.admin.dto;

import com.mftb.admin.entity.FinDebtRepayment;
import com.mftb.admin.util.DateTimeUtils;
import lombok.Data;

import java.math.BigDecimal;

/**
 * 还款明细视图对象（字段命名与前端还款信息表格一致）
 */
@Data
public class FinDebtRepaymentVO {

    private Long id;
    private String billNo;

    /** 还款日期 */
    private String date;

    /** 还款渠道: 推广金扣款 / 营业额扣款 / 对公转账 / 转移结算 */
    private String channel;

    private BigDecimal amount;
    private String remark;
    private String operator;
    private String operateTime;

    /** 是否可删除（转移结算等系统生成记录为 false） */
    private Boolean canDelete;

    public static FinDebtRepaymentVO from(FinDebtRepayment repayment) {
        FinDebtRepaymentVO vo = new FinDebtRepaymentVO();
        vo.setId(repayment.getId());
        vo.setBillNo(repayment.getBillNo());
        vo.setDate(DateTimeUtils.format(repayment.getRepayDate()));
        vo.setChannel(repayment.getChannel());
        vo.setAmount(repayment.getAmount());
        vo.setRemark(repayment.getRemark());
        vo.setOperator(repayment.getOperator());
        vo.setOperateTime(DateTimeUtils.format(repayment.getOperateTime()));
        vo.setCanDelete(repayment.getCanDelete() == null || repayment.getCanDelete() == 1);
        return vo;
    }
}
