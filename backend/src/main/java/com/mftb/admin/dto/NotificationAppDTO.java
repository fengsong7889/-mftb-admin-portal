package com.mftb.admin.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

import java.util.List;

/** 企业应用与场景管理的公开契约；响应中只提供密钥配置状态。 */
public final class NotificationAppDTO {
    private NotificationAppDTO() { }

    @Getter
    @Setter
    public static class Save extends DingTalkAppConfigRequest {
        @NotBlank(message = "應用名稱不能為空")
        @Size(max = 100, message = "應用名稱不能超過 100 字元")
        private String name;
        @Size(max = 500, message = "備註不能超過 500 字元")
        private String remark;
    }

    public record View(long id, String name, String platform, String appKey, String agentId,
                       String baseUrl, boolean appSecretConfigured, boolean tokenSecretConfigured,
                       boolean enabled, String remark, String updatedBy, String updatedAt,
                       List<String> scenarios) { }

    public record Toggle(@NotNull Boolean enabled) { }

    public record ScenarioSave(@Positive Long appId, @NotNull Boolean enabled) { }

    public record ScenarioView(String key, String name, String triggerDescription, String recipientRule,
                               Long appId, String appName, boolean enabled, boolean appEnabled,
                               String updatedBy, String updatedAt) { }
}
