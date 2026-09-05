package com.mftb.admin.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

/**
 * 員工額度 DTO（職位額度 + 角色額度）
 */
public class AiEmpQuotaDTO {

    /* ══════════ 職位額度 VO ══════════ */
    @Data
    public static class PosQuotaVO {
        private Long id;
        /** 配置ID（编号生成规则 ai_emp_pos_quota） */
        private String configCode;
        private String name;
        private String description;
        private List<String> sequences;
        private List<String> jobLevels;
        private Integer totalEmployeeCount;
        private String period;
        private String quotaType;
        private BigDecimal quotaValue;
        private String currency;
        private Integer softThreshold;
        private String overLimitAction;
        private Long downgradeModelId;
        private BigDecimal usedValue;
        private Integer status;
        private String createdBy;
        private String updatedBy;
        private String createdAt;
        private String updatedAt;
    }

    /* ══════════ 角色額度 VO ══════════ */
    @Data
    public static class RoleQuotaVO {
        private Long id;
        /** 配置ID（编号生成规则 ai_emp_role_quota） */
        private String configCode;
        private String roleName;
        private String description;
        private List<Long> userIds;
        private List<String> userNames;
        private Integer totalEmployeeCount;
        private String period;
        private String quotaType;
        private BigDecimal quotaValue;
        private String currency;
        private Integer softThreshold;
        private String overLimitAction;
        private Long downgradeModelId;
        private BigDecimal usedValue;
        private Integer status;
        private String createdBy;
        private String updatedBy;
        private String createdAt;
        private String updatedAt;
    }

    /* ══════════ 職位額度保存請求 ══════════ */
    @Data
    public static class PosQuotaRequest {
        private Long id; // null = 新增
        @NotBlank(message = "策略名稱不能為空")
        private String name;
        private String description;
        @NotNull(message = "職級序列不能為空")
        private List<String> sequences;
        @NotNull(message = "職級不能為空")
        private List<String> jobLevels;
        private Integer totalEmployeeCount;
        @NotBlank(message = "限額周期不能為空")
        private String period;
        @NotBlank(message = "限額類型不能為空")
        private String quotaType;
        @NotNull(message = "限額值不能為空")
        private BigDecimal quotaValue;
        private String currency = "CNY";
        private Integer softThreshold = 80;
        @NotBlank(message = "超額動作不能為空")
        private String overLimitAction;
        private Long downgradeModelId;
        private Integer status = 1;
    }

    /* ══════════ 角色額度保存請求 ══════════ */
    @Data
    public static class RoleQuotaRequest {
        private Long id; // null = 新增
        @NotBlank(message = "角色名稱不能為空")
        private String roleName;
        private String description;
        private List<Long> userIds;
        private List<String> userNames;
        private Integer totalEmployeeCount;
        @NotBlank(message = "限額周期不能為空")
        private String period;
        @NotBlank(message = "限額類型不能為空")
        private String quotaType;
        @NotNull(message = "限額值不能為空")
        private BigDecimal quotaValue;
        private String currency = "CNY";
        private Integer softThreshold = 80;
        @NotBlank(message = "超額動作不能為空")
        private String overLimitAction;
        private Long downgradeModelId;
        private Integer status = 1;
    }

    /* ══════════ 查詢請求 ══════════ */
    @Data
    public static class QuotaQueryRequest {
        private String name;
        private String sequence;
        private String period;
        private Integer status;
    }
}
