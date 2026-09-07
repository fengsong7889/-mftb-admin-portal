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
        /** 維度來源：employee=員工 department=部門 position=職位 role=角色 grant=審批授予（個人獨立額度，優先生效） */
        private String source;
        /** 來源名稱（員工專屬 / 部門名 / 策略名 / 角色名 / 審批授予） */
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

    /* ══════════ 配额校验（调用前闸门） ══════════ */

    /**
     * 单次模型调用的配额校验结果：网关/前端在发起请求前调用，消费各维度的
     * over_limit_action（reject/approve/downgrade）与 downgrade_model_id，形成配额闭环。
     * 命中多个维度时取最严格动作（reject &gt; approve &gt; downgrade）。
     */
    @Data
    public static class QuotaCheckVO {
        /** 目标模型 ID */
        private Long modelId;
        /** 目标模型标识 */
        private String modelKey;
        /** 是否放行（true=可调用） */
        private boolean allowed;
        /** 是否已超额（命中硬限额） */
        private boolean overLimit;
        /** 是否触发软限额提醒（接近但未超额） */
        private boolean softWarning;
        /** 生效动作：allow/reject/approve/downgrade */
        private String action;
        /** 是否需要人工审批（action=approve） */
        private boolean requiresApproval;
        /** 降级目标模型（action=downgrade 时有值） */
        private Long downgradeModelId;
        private String downgradeModelKey;
        private String downgradeModelName;
        /** 命中（使用率最高）维度的信息 */
        private String hitSource;
        private String hitSourceName;
        private String hitQuotaType;
        private String hitPeriod;
        private BigDecimal hitQuotaValue;
        private BigDecimal hitUsedValue;
        /** 命中维度使用百分比（可能 &gt;100） */
        private Integer hitUsagePercent;
        /** 人类可读提示 */
        private String message;
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

        /* ── 模型能力字段（前端展示能力标签 & 输入方式提示） ── */

        /** 支持模態：text,image,audio,video（逗號分隔） */
        private String modalities;
        /** 視覺理解（圖像識別） */
        private Boolean visionSupport;
        /** 工具調用（Function Calling） */
        private Boolean functionCalling;
        /** JSON 結構化輸出 */
        private Boolean jsonMode;
        /** 流式響應 */
        private Boolean streaming;
        /** 深度思考模式 */
        private Boolean thinkingMode;
        /** 最大上下文窗口（tokens） */
        private Integer contextWindow;
    }
}
