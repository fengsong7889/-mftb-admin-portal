package com.mftb.admin.dto;

import lombok.Data;
import jakarta.validation.constraints.NotNull;
import java.io.Serializable;
import java.util.List;

/**
 * AI 配额 DTO 聚合（查询/配置/响应）
 */
public class AiQuotaDTO {

    /**
     * 部门配额查询请求
     */
    @Data
    public static class DeptQuotaQueryRequest implements Serializable {
        private static final long serialVersionUID = 1L;
        private Long departmentId;
        private String name;
    }

    /**
     * 员工配额查询请求
     */
    @Data
    public static class EmpQuotaQueryRequest implements Serializable {
        private static final long serialVersionUID = 1L;
        private Long employeeId;
        private String empId;
        private String name;
    }

    /**
     * 配额配置请求
     */
    @Data
    public static class QuotaConfigRequest implements Serializable {
        private static final long serialVersionUID = 1L;

        @NotNull(message = "配额类型不能为空")
        private String quotaType; // department / employee

        @NotNull(message = "目标 ID 不能为空")
        private Long targetId;

        private Long modelId;      // NULL = 全局配额

        private Integer dailyQuota;
        private Integer monthlyQuota;
        private Integer autoReset;
        private Integer resetDayOfMonth;
    }

    /**
     * 批量设置配额请求
     */
    @Data
    public static class BatchQuotaRequest implements Serializable {
        private static final long serialVersionUID = 1L;

        private List<QuotaConfigRequest> quotas;
    }

    /**
     * 配额响应对象
     */
    @Data
    public static class QuotaVO implements Serializable {
        private static final long serialVersionUID = 1L;

        private Long id;
        private String quotaType; // department / employee
        private Long targetId;
        private String targetName;  // 部门名称或员工工号 + 姓名
        private Long modelId;
        private String modelName;  // 模型名称（NULL 表示全局配额）

        private Integer dailyQuota;
        private Integer monthlyQuota;
        private Long usedToday;
        private Long usedMonth;

        private Boolean hasLimit;  // 是否有限制（daily > 0 or monthly > 0）

        private Integer autoReset;
        private Integer resetDayOfMonth;
        private String createdAt;
        private String updatedAt;
    }
}
