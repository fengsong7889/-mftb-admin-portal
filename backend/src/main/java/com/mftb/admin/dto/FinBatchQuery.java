package com.mftb.admin.dto;

import lombok.Getter;
import lombok.Setter;
import org.springframework.format.annotation.DateTimeFormat;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 批次列表查询条件（批次查询菜单搜索区）
 */
@Getter
@Setter
public class FinBatchQuery extends FinPageQuery {

    /** 集团ID（模糊匹配） */
    private String groupId;

    /** 集团名称（模糊匹配） */
    private String groupName;

    /** 所属品牌 */
    private String brand;

    /** 批次类型: recharge / transfer / merge */
    private String batchType;

    /** 批次号（模糊匹配） */
    private String batchNo;

    /** 流程编号（模糊匹配） */
    private String flowNo;

    /** 是否实收: 是 / 否 */
    private String isActual;

    /** 申请人（模糊匹配） */
    private String applicant;

    /** 归属BD（模糊匹配） */
    private String bd;

    /** 交易时间-开始日期 */
    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
    private LocalDate tradeFrom;

    /** 交易时间-结束日期 */
    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
    private LocalDate tradeTo;

    public LocalDateTime tradeFromTime() {
        return startOf(tradeFrom);
    }

    public LocalDateTime tradeToTime() {
        return endExclusive(tradeTo);
    }
}
