package com.mftb.admin.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;
import java.util.List;

public class AiAccessRequestDTO {

    /* ══════════ VO ══════════ */

    @Data
    public static class RequestVO implements Serializable {
        private Long id;
        private Long applicantId;
        private String applicantName;
        private Long departmentId;
        private String departmentName;
        private Long positionId;
        private String positionName;
        private String requestType;
        /** 申請場景入口: no-models/no-quota/no-both/topup/add-model/quota-exhausted/needs-approval */
        private String applyReason;
        private List<Long> requestedModels;
        private String usageDescription;
        private List<String> usageScenarios;
        private String usageFrequency;
        /** 申請憑證附件（含 base64 dataUrl，僅詳情接口返回） */
        private List<CredentialItem> credentials;
        private String status;
        private Long workflowInstanceId;
        /* 審批結果 */
        private List<Long> approvedModels;
        private List<ApprovedModelConfig> approvedModelConfigs;
        private String approvedQuotaType;
        private BigDecimal approvedQuotaValue;
        private String approvedQuotaPeriod;
        private String approvedOverLimitAction;
        /** 額度生效類型: permanent/temporary */
        private String quotaEffectiveType;
        /** 臨時額度到期時間 yyyy-MM-dd HH:mm:ss */
        private String quotaExpireAt;
        /* 審批信息 */
        private Long approverId;
        private String approverName;
        private String approveRemark;
        private String approvedAt;
        private String createdBy;
        private String updatedBy;
        private String createdAt;
        private String updatedAt;
    }

    /* ══════════ 提交申請 ══════════ */

    @Data
    public static class SubmitRequest implements Serializable {
        @NotBlank(message = "申請類型不能為空")
        private String requestType;
        /** 申請場景入口: no-models/no-quota/no-both/topup/add-model/quota-exhausted/needs-approval */
        private String applyReason;
        private List<Long> requestedModels;
        @NotBlank(message = "用途說明不能為空")
        private String usageDescription;
        private List<String> usageScenarios;
        private String usageFrequency;
        /** 申請憑證附件 */
        private List<CredentialItem> credentials;
    }

    /* ══════════ 審批操作 ══════════ */

    @Data
    public static class ApproveRequest implements Serializable {
        /** 授權模型 ID 列表（與 approvedModelConfigs 一致或其子集） */
        private List<Long> approvedModels;
        /** 授權模型能力配置（勾選的模型 + 各能力開關） */
        private List<ApprovedModelConfig> approvedModelConfigs;
        /** 限額類型: requests/tokens */
        private String approvedQuotaType;
        private BigDecimal approvedQuotaValue;
        /** 限額週期: daily/monthly */
        private String approvedQuotaPeriod;
        private String approvedOverLimitAction;
        /** 額度生效類型: permanent=永久 temporary=臨時 */
        private String quotaEffectiveType;
        /** 臨時額度到期時間 yyyy-MM-dd HH:mm:ss（quotaEffectiveType=temporary 時必填） */
        private String quotaExpireAt;
        private String approveRemark;
    }

    /* ══════════ 查詢 ══════════ */

    @Data
    public static class QueryRequest implements Serializable {
        private String status;
        private String requestType;
        private String applicantName;
    }

    /* ══════════ 通用嵌套類型 ══════════ */

    /** 憑證附件項（base64 dataUrl 直存，與頭像上傳模式一致） */
    @Data
    public static class CredentialItem implements Serializable {
        private String name;
        /** image/pdf */
        private String type;
        private Long size;
        private String dataUrl;
    }

    /** 授權模型能力配置項（審批操作區勾選結果） */
    @Data
    public static class ApprovedModelConfig implements Serializable {
        private Long modelId;
        private Integer visionSupport;
        private Integer functionCalling;
        private Integer jsonMode;
        private Integer streaming;
        private Integer thinkingMode;
    }
}
