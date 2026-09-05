package com.mftb.admin.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;
import java.util.List;

public class AiDeptQuotaDTO {

    /* ══════════ VO ══════════ */

    @Data
    public static class DeptQuotaVO implements Serializable {
        private Long id;
        /** 配置ID（编号生成规则 ai_dept_quota） */
        private String configCode;
        private String name;
        private String description;
        private List<Long> deptIds;
        private List<String> deptNames;
        private Integer totalEmployeeCount;
        private String allocateMode;
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

    /* ══════════ Request ══════════ */

    @Data
    public static class DeptQuotaRequest implements Serializable {
        private Long id;
        @NotBlank(message = "策略名稱不能為空")
        private String name;
        private String description;
        private List<Long> deptIds;
        private List<String> deptNames;
        private Integer totalEmployeeCount;
        @NotBlank(message = "額度分配方式不能為空")
        private String allocateMode;
        @NotBlank(message = "限額周期不能為空")
        private String period;
        @NotBlank(message = "限額類型不能為空")
        private String quotaType;
        @NotNull(message = "限額值不能為空")
        private BigDecimal quotaValue;
        private String currency;
        private Integer softThreshold;
        @NotBlank(message = "超額動作不能為空")
        private String overLimitAction;
        private Long downgradeModelId;
        private Integer status;
    }

    /* ══════════ Query ══════════ */

    @Data
    public static class DeptQuotaQueryRequest implements Serializable {
        private String name;
        private String period;
        private Integer status;
    }
}
