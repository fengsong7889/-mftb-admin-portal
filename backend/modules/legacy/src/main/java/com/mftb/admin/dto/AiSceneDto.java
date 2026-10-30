package com.mftb.admin.dto;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/** 业务 AI 场景管理契约；只包含配置元数据与诊断摘要，不能承载模型凭据或会议原文。 */
public final class AiSceneDto {
    private AiSceneDto() { }

    /** 拒绝额外字段，避免调用方误以为可以在本接口修改员工、模型、额度或场景归属。 */
    public abstract static class StrictForm {
        @JsonAnySetter
        public void rejectUnknown(String field, Object value) {
            throw new IllegalArgumentException("不支持的請求欄位");
        }
    }

    @Data
    public static class ConfigForm extends StrictForm {
        @NotNull
        private Boolean enabled;
        @NotNull @Min(0) @Max(Long.MAX_VALUE - 1)
        private Long expectedVersion;
        @NotBlank @Size(max = 200)
        private String reason;
    }

    @Data
    public static class DiagnoseForm extends StrictForm {
        @NotNull @Positive
        private Long userId;
    }

    @Data
    public static class ConfigVO {
        private String sceneKey;
        private String systemCode;
        private boolean enabled;
        private long version;
        private String reason;
        private boolean environmentAllowed;
        private String environmentReasonCode;
        private String updatedBy;
        /** UTC ISO 时间字符串，避免前端根据环境猜测时区。 */
        private String updatedAt;
    }

    /** status 固定为 passed / blocked / not_checked；action 指向前端白名单入口，不返回任意 URL。 */
    public record Check(String key, String status, String reasonCode, String message, String action) { }

    /** 来源沿用权限追溯，actions 仅保留本试点相关动作。 */
    public record PermissionSource(String menuKey, List<String> actions, List<String> sources) { }

    @Data
    public static class DiagnosisVO {
        private String sceneKey;
        private Long userId;
        private String name;
        private String empId;
        private String checkedAt;
        /** 仅代表基础配置通过，不代表具体会议与出站内容已经获得授权。 */
        private boolean ready;
        private boolean authorized;
        private String modelKey;
        private String reasonCode;
        private String message;
        private List<Check> checks = new ArrayList<>();
        private List<PermissionSource> permissionSources = new ArrayList<>();
    }

    public record EmployeeOption(Long id, String name, String empId) { }
    public record EmployeePage(List<EmployeeOption> records, long total) { }
}
