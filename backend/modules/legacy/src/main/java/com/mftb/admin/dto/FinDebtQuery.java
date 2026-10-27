package com.mftb.admin.dto;

import lombok.Getter;
import lombok.Setter;
import org.springframework.format.annotation.DateTimeFormat;

import java.time.LocalDate;

/**
 * 欠款单列表查询条件（欠款对账菜单搜索区）
 */
@Getter
@Setter
public class FinDebtQuery extends FinPageQuery {

    /** 集团ID（模糊匹配） */
    private String groupId;

    /** 集团名称（模糊匹配） */
    private String groupName;

    /** 门店名称（模糊匹配） */
    private String storeName;

    /** 所属品牌 */
    private String brand;

    /** 账单编号（模糊匹配） */
    private String billNo;

    /** 关联批次号（模糊匹配） */
    private String batchNo;

    /** 流程编号（模糊匹配） */
    private String flowNo;

    /** 账单状态: unsettled / settled / transferred */
    private String status;

    /** 账单来源: recharge / merge */
    private String source;

    /** 业务频道 */
    private String channel;

    /** 借款日期-开始 */
    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
    private LocalDate loanFrom;

    /** 借款日期-结束 */
    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
    private LocalDate loanTo;
}
