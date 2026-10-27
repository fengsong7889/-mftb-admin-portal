package com.mftb.admin.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

/**
 * 欠款对账查询结果（列表 + 品牌待还统计）
 */
@Data
public class FinDebtPageVO {

    private List<FinDebtBillVO> records;
    private long total;

    /** 闪蜂 / mFood 品牌待还统计（仅统计未结清账单的剩余待还） */
    private BrandStats brandStats = new BrandStats();

    @Data
    public static class BrandStats {
        private Stat shanfeng = new Stat();
        private Stat mfood = new Stat();
    }

    @Data
    public static class Stat {
        /** 待还金额合计 */
        private BigDecimal amount = BigDecimal.ZERO;
        /** 待还账单笔数 */
        private long count;
    }
}
