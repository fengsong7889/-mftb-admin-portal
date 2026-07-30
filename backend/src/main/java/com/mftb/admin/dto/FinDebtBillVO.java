package com.mftb.admin.dto;

import com.mftb.admin.entity.FinDebtBill;
import com.mftb.admin.util.DateTimeUtils;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

/**
 * 欠款单视图对象（字段命名与前端欠款对账表格 dataIndex 一致）
 */
@Data
public class FinDebtBillVO {

    private Long id;
    private String billNo;

    /** 集团ID（对应 biz_fin_debt_bill.group_code） */
    private String groupId;

    private String groupName;
    private String brand;

    /** 门店ID（对应 biz_fin_debt_bill.store_code） */
    private String storeId;

    private String storeName;
    private String channel;
    private String bd;

    /** 账单来源: recharge=充值营业额扣款 merge=合并欠款转入 */
    private String source;

    private String loanDate;
    private String batchNo;
    private String flowNo;
    private BigDecimal debtTotal;
    private BigDecimal paidAmount;
    private BigDecimal remainAmount;

    /** 账单状态: unsettled / settled / transferred */
    private String status;

    /** 还款明细（详情接口返回，列表接口为空） */
    private List<FinDebtRepaymentVO> repayments;

    public static FinDebtBillVO from(FinDebtBill bill) {
        FinDebtBillVO vo = new FinDebtBillVO();
        vo.setId(bill.getId());
        vo.setBillNo(bill.getBillNo());
        vo.setGroupId(bill.getGroupCode());
        vo.setGroupName(bill.getGroupName());
        vo.setBrand(bill.getBrand());
        vo.setStoreId(bill.getStoreCode());
        vo.setStoreName(bill.getStoreName());
        vo.setChannel(bill.getChannel());
        vo.setBd(bill.getBd());
        vo.setSource(bill.getSource());
        vo.setLoanDate(DateTimeUtils.format(bill.getLoanDate()));
        vo.setBatchNo(bill.getBatchNo());
        vo.setFlowNo(bill.getFlowNo());
        vo.setDebtTotal(bill.getDebtTotal());
        vo.setPaidAmount(bill.getPaidAmount());
        vo.setRemainAmount(bill.getRemainAmount());
        vo.setStatus(bill.getStatus());
        return vo;
    }
}
