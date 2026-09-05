package com.mftb.admin.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

/**
 * 智能中心「我的」視圖 DTO：我的額度維度與用量、我的授權模型
 */
public class AiMyCenterDTO {

    /* ══════════ 我的用量（額度維度 + 實際用量） ══════════ */

    @Data
    public static class MyQuotaUsageVO {
        private String username;
        private String name;
        private String empId;
        /** 當前賬號生效的額度維度（員工/部門/職位/角色） */
        private List<QuotaDimensionVO> dimensions = new ArrayList<>();
        /** 整體用量概覽（今日/本月） */
        private UsageSummaryVO usage = new UsageSummaryVO();
        /** 最近使用記錄（最新 8 條） */
        private List<RecentRecordVO> recentRecords = new ArrayList<>();
    }

    /**
     * 單個額度維度：一條「來源 + 周期 + 類型」的限額規則及其本期已用。
     * 已用量按 biz_llm_usage 明細實時聚合（與能耗統計同源），不依賴配置表冗余字段。
     */
    @Data
    public static class QuotaDimensionVO {
        /** 維度來源：employee=員工 department=部門 position=職位 role=角色 */
        private String source;
        /** 來源名稱（員工專屬 / 部門名 / 策略名 / 角色名） */
        private String sourceName;
        /** 限定模型 ID；null = 全部模型 */
        private Long modelId;
        /** 限定模型標識；null = 全部模型 */
        private String modelKey;
        private String modelName;
        /** 限額周期：daily/monthly */
        private String period;
        /** 限額類型：token/cost/request */
        private String quotaType;
        /** 限額值（token 數 / 金額 / 次數） */
        private BigDecimal quotaValue;
        /** 計價幣種（cost 類型使用，其餘為空） */
        private String currency;
        /** 本期已用（按 quotaType 口径聚合） */
        private BigDecimal usedValue;
        /** 軟限額提醒閾值(%) */
        private Integer softThreshold;
        /** 本期重置日（yyyy-MM-dd）：daily=明日，monthly=下一個周期起始日 */
        private String resetDate;
    }

    @Data
    public static class UsageSummaryVO {
        private long todayTokens;
        private long monthTokens;
        private long todayRequests;
        private long monthRequests;
        private List<CostEntry> todayCosts = new ArrayList<>();
        private List<CostEntry> monthCosts = new ArrayList<>();
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class CostEntry {
        private String currency;
        private BigDecimal cost;
    }

    @Data
    public static class RecentRecordVO {
        private Long id;
        private String time;
        private String model;
        private String mode;
        private String channel;
        private long promptTokens;
        private long completionTokens;
        private BigDecimal cost;
        private String currency;
    }

    /* ══════════ 我的授權模型 ══════════ */

    @Data
    public static class MyModelVO {
        private Long modelId;
        private String modelKey;
        private String modelName;
        /** 供應商名稱（無供應商時為空） */
        private String providerName;
        /** 部署類型：cloud/private */
        private String deployType;
        /** 授權來源：dept/position/role/employee */
        private List<String> sources = new ArrayList<>();
    }
}
