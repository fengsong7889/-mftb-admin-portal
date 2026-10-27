package com.mftb.admin.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/**
 * 秒杀模块 DTO 集合（登记/统计/汇总/总览/导入）
 */
public final class FlashSaleDTOs {

    private FlashSaleDTOs() {
    }

    /** 阶梯（价+库存+补贴） */
    @Data
    public static class Tier {
        private Integer tierNo;
        private BigDecimal tierPrice;
        private Integer tierStock;
        /** 阶梯补贴（统计来源可为 null） */
        private BigDecimal tierSubsidy;
    }

    /* ─────────────── 登记 ─────────────── */

    /** 登记导入行 */
    @Data
    public static class RegisterRow {
        private Integer seqNo;
        private String subsidyType;
        /** 门店名称（多个逗号/分号分隔，引用门店管理校验） */
        private String storeNames;
        private String productId;
        private String productName;
        private String productType;
        private String maxPurchase;
        private String priceType;
        private BigDecimal originalPrice;
        private BigDecimal groupPrice;
        private BigDecimal flashSalePrice;
        /** 秒杀库存（单一价格） */
        private Integer flashSaleStock;
        private Integer currentSales;
        private List<Tier> tiers;
    }

    @Data
    public static class RegisterImportRequest {
        private Integer periodNo;
        private List<RegisterRow> rows;
    }

    /** 登记列表视图 */
    @Data
    public static class RegisterVO {
        private Long id;
        private Integer periodNo;
        private Integer seqNo;
        private String subsidyType;
        private String storeCodes;
        private String storeNames;
        private String bdNames;
        private String productId;
        private String productName;
        private String productType;
        private String maxPurchase;
        private String priceType;
        private BigDecimal originalPrice;
        private BigDecimal groupPrice;
        private BigDecimal flashSalePrice;
        /** 秒杀库存（单一价格） */
        private Integer flashSaleStock;
        private Integer currentSales;
        /** 近3期销量黑榜 */
        private Boolean blacklist;
        private List<Tier> tiers;
    }

    /* ─────────────── 统计 ─────────────── */

    /** 统计导入行 */
    @Data
    public static class StatsRow {
        private String productId;
        private String productName;
        private String storeNames;
        private String priceType;
        /** 秒杀价（单一价格） */
        private BigDecimal flashSalePrice;
        private Integer orderUsers;
        private BigDecimal totalPrice;
        private Integer totalOrders;
        private Integer totalSales;
        private BigDecimal actualAmount;
        private BigDecimal orderUsersChange;
        private BigDecimal totalPriceChange;
        private BigDecimal totalOrdersChange;
        private BigDecimal totalSalesChange;
        private BigDecimal actualAmountChange;
        private String subsidyType;
        private BigDecimal discountRate;
        private String lastPeriodSubsidy;
        private String bdName;
        private List<Tier> tiers;
    }

    @Data
    public static class StatsImportRequest {
        private Integer periodNo;
        private List<StatsRow> rows;
    }

    /** 统计列表视图 */
    @Data
    public static class StatsVO {
        private Long id;
        private Integer periodNo;
        private String productId;
        private String productName;
        private String storeNames;
        private String priceType;
        /** 秒杀价（单一价格） */
        private BigDecimal flashSalePrice;
        private Integer orderUsers;
        private BigDecimal totalPrice;
        private Integer totalOrders;
        private Integer totalSales;
        private BigDecimal actualAmount;
        private BigDecimal orderUsersChange;
        private BigDecimal totalPriceChange;
        private BigDecimal totalOrdersChange;
        private BigDecimal totalSalesChange;
        private BigDecimal actualAmountChange;
        private String subsidyType;
        private BigDecimal discountRate;
        private String lastPeriodSubsidy;
        private String bdName;
        private List<Tier> tiers;
    }

    /* ─────────────── 汇总/总览 ─────────────── */

    /** 汇总导入行（statDate 为 null 表示整期合计行） */
    @Data
    public static class SummaryRow {
        private LocalDate statDate;
        private BigDecimal totalPayable;
        private BigDecimal totalActual;
        private Integer totalOrders;
        private Integer totalSales;
        private Integer totalProducts;
        private Integer soldProducts;
        private Integer buyers;
        private Integer repurchaseBuyers;
        private BigDecimal repurchaseRate;
        private BigDecimal avgOrderValue;
    }

    @Data
    public static class SummaryImportRequest {
        private Integer periodNo;
        private List<SummaryRow> rows;
    }

    /** 总览每日行（含系统计算的环比；totals=true 为合计行） */
    @Data
    public static class SummaryDayVO {
        private LocalDate statDate;
        private Boolean totals;
        private BigDecimal totalPayable;
        private BigDecimal totalActual;
        private Integer totalOrders;
        private Integer totalSales;
        private Integer totalProducts;
        private Integer soldProducts;
        /** 动销率（系统计算） */
        private BigDecimal soldRate;
        private Integer buyers;
        private Integer repurchaseBuyers;
        private BigDecimal repurchaseRate;
        private BigDecimal avgOrderValue;
        private BigDecimal payableChange;
        private BigDecimal actualChange;
        private BigDecimal ordersChange;
        private BigDecimal salesChange;
        private BigDecimal buyersChange;
    }

    /** 总览视图 */
    @Data
    public static class OverviewVO {
        private Integer periodNo;
        private SummaryDayVO totals;
        private List<SummaryDayVO> daily;
    }

    /* ─────────────── 导入结果 ─────────────── */

    @Data
    public static class ImportError {
        private int rowIndex;
        private String reason;

        public ImportError() {
        }

        public ImportError(int rowIndex, String reason) {
            this.rowIndex = rowIndex;
            this.reason = reason;
        }
    }

    @Data
    public static class ImportResultVO {
        private int successCount;
        private List<ImportError> errors;

        public ImportResultVO() {
        }

        public ImportResultVO(int successCount, List<ImportError> errors) {
            this.successCount = successCount;
            this.errors = errors;
        }
    }
}
