package com.mftb.admin.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

/**
 * 員工AI權額管理 DTO：列表聚合、詳情、保存請求、調整日誌
 */
public class AiEmpPermissionDTO {

    /* ══════════ 列表頁單行 ══════════ */

    @Data
    public static class SummaryVO {
        private Long employeeId;
        private String employeeName;
        private String empId;
        private String department;
        private Long deptId;
        private String position;
        private String jobLevel;
        /** 啟用模型數 */
        private int modelCount;
        /** 授權模型列表（列表頁展示） */
        private List<ModelBrief> models = new ArrayList<>();
        /** 聚合額度（含已用/總額） */
        private List<QuotaBrief> quotas = new ArrayList<>();
        /** 最近操作人 */
        private String lastUpdatedBy;
        /** 最近操作時間 */
        private String lastUpdatedAt;
    }

    /* ══════════ 模型簡要（列表用） ══════════ */

    @Data
    public static class ModelBrief {
        private Long modelId;
        private String modelName;
        /** 來源：department/position/role/employee/approval */
        private String source;
    }

    /* ══════════ 額度簡要（列表用） ══════════ */

    @Data
    public static class QuotaBrief {
        private String source;
        private String sourceDesc;
        /** token/request/cost */
        private String quotaType;
        /** daily/monthly */
        private String quotaPeriod;
        private BigDecimal quotaValue;
        private BigDecimal usedValue;
        private int status;
    }

    /* ══════════ 詳情頁 ══════════ */

    @Data
    public static class DetailVO {
        /** 基本信息（與列表同構） */
        private SummaryVO basic;
        /** 模型權限明細（含能力開關） */
        private List<ModelPermissionVO> models = new ArrayList<>();
        /** 額度明細 */
        private List<QuotaGrantVO> quotas = new ArrayList<>();
    }

    @Data
    public static class ModelPermissionVO {
        private Long modelId;
        private String modelName;
        private String source;
        private String sourceDesc;
        /** 能力開關 */
        private int visionSupport;
        private int functionCalling;
        private int jsonMode;
        private int streaming;
        private int thinkingMode;
        /** 狀態：1=啟用 0=禁用 */
        private int status;
        private String grantedAt;
    }

    @Data
    public static class QuotaGrantVO {
        private Long id;
        private String source;
        private String sourceDesc;
        private String quotaType;
        private String quotaPeriod;
        private BigDecimal quotaValue;
        private BigDecimal usedValue;
        /** permanent/temporary */
        private String effectiveType;
        private String effectiveAt;
        private String expireAt;
        private String overLimitAction;
        private int status;
    }

    /* ══════════ 保存請求 ══════════ */

    @Data
    public static class SaveReq {
        private Long employeeId;
        /** 能力開關變更 */
        private List<ModelCapToggle> modelToggles = new ArrayList<>();
        /** 額度值變更 */
        private List<QuotaAdjust> quotaAdjusts = new ArrayList<>();
        private String reason;
    }

    @Data
    public static class ModelCapToggle {
        private Long modelId;
        /** visionSupport/functionCalling/jsonMode/streaming/thinkingMode */
        private String field;
        /** 0 or 1 */
        private int value;
    }

    @Data
    public static class QuotaAdjust {
        /** 對應額度記錄ID */
        private Long quotaId;
        /** 額度來源（department/position/role/approval） */
        private String source;
        private String sourceDesc;
        private String quotaType;
        private String quotaPeriod;
        private BigDecimal oldValue;
        private BigDecimal newValue;
    }

    /* ══════════ 調整日誌 VO ══════════ */

    @Data
    public static class AdjustLogVO {
        private String time;
        private String source;
        private String sourceDesc;
        private String quotaType;
        private String quotaPeriod;
        private BigDecimal oldValue;
        private BigDecimal newValue;
        private String operator;
        private String reason;
    }
}
