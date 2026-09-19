package com.mftb.admin.dto;

import lombok.Getter;
import lombok.Setter;
import org.springframework.format.annotation.DateTimeFormat;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 交易明细列表查询条件（明细查询菜单搜索区）
 */
@Getter
@Setter
public class FinDetailQuery extends FinPageQuery {

    /** 集团ID（模糊匹配） */
    private String groupId;

    /** 集团名称（模糊匹配） */
    private String groupName;

    /** 所属品牌 */
    private String brand;

    /** 门店ID（模糊匹配） */
    private String storeId;

    /** 门店名称（模糊匹配） */
    private String storeName;

    /** 业务频道 */
    private String channel;

    /** 交易类型: 充值 / 扣款 / 消费 / 转入 / 转出 */
    private String tradeType;

    /** 变动类别 */
    private String changeType;

    /** 批次号（模糊匹配） */
    private String batchNo;

    /** 流程编号（模糊匹配） */
    private String flowNo;

    /** 明细ID（模糊匹配） */
    private String detailId;

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
