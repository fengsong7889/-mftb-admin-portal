package com.mftb.admin.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * AI 助手使用统计汇总（实时聚合，不落汇总表）
 * 金额按币种分组返回（百炼 CNY、DeepSeek USD），前端分币种展示
 */
@Data
public class LlmUsageSummaryVO {

    /** 查询范围内的总请求数 */
    private long totalRequests;

    /** 查询范围内的输入 tokens 合计 */
    private long totalPromptTokens;

    /** 查询范围内的输出 tokens 合计 */
    private long totalCompletionTokens;

    /** 总费用（按币种分组） */
    private List<CostEntry> costByCurrency = new ArrayList<>();

    /** 按模型聚合 */
    private List<ModelRow> byModel = new ArrayList<>();

    /** 按用户聚合 */
    private List<UserRow> byUser = new ArrayList<>();

    /** 单一币种的费用 */
    @Data
    public static class CostEntry {
        private String currency;
        private BigDecimal cost;

        public CostEntry(String currency, BigDecimal cost) {
            this.currency = currency;
            this.cost = cost;
        }
    }

    /** 按模型聚合行 */
    @Data
    public static class ModelRow {
        private String model;
        private long requests;
        private long promptTokens;
        private long completionTokens;
        /** 该模型费用（同一模型只会有一个币种） */
        private List<CostEntry> costs = new ArrayList<>();
    }

    /** 按用户聚合行 */
    @Data
    public static class UserRow {
        private String username;
        /** 员工姓名（来自 sys_user，供前端展示「姓名（工号）」） */
        private String name;
        /** 工号 */
        private String empId;
        private long requests;
        private long promptTokens;
        private long completionTokens;
        /** 该用户费用（可能同时消耗 CNY 与 USD 两个供应商） */
        private List<CostEntry> costs = new ArrayList<>();
        /** 最近一次使用时间 */
        private LocalDateTime lastUsedAt;
    }
}
