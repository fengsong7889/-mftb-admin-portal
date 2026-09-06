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
        private List<Long> requestedModels;
        private String usageDescription;
        private List<String> usageScenarios;
        private String usageFrequency;
        private String status;
        private Long workflowInstanceId;
        /* 審批結果 */
        private List<Long> approvedModels;
        private String approvedQuotaType;
        private BigDecimal approvedQuotaValue;
        private String approvedQuotaPeriod;
        private String approvedOverLimitAction;
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
        private List<Long> requestedModels;
        @NotBlank(message = "用途說明不能為空")
        private String usageDescription;
        private List<String> usageScenarios;
        private String usageFrequency;
    }

    /* ══════════ 審批操作 ══════════ */

    @Data
    public static class ApproveRequest implements Serializable {
        private List<Long> approvedModels;
        private String approvedQuotaType;
        private BigDecimal approvedQuotaValue;
        private String approvedQuotaPeriod;
        private String approvedOverLimitAction;
        private String approveRemark;
    }

    /* ══════════ 查詢 ══════════ */

    @Data
    public static class QueryRequest implements Serializable {
        private String status;
        private String requestType;
        private String applicantName;
    }
}
