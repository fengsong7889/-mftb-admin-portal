package com.mftb.admin.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.List;

/**
 * 预约规则与黑名单的出入参契约（M2「預約規則」页）。
 *
 * <p>规则不建新表而是直接读写 {@code sys_config} 的 {@code meeting_*} 键：只有十几个开关与数字，
 * 建一张规则表就等于再多一份要与 {@code MeetingRuleService} 保持同步的真值源。
 * 但**读写必须经过本 DTO 的白名单**：{@code sys_config} 是全系统共用的键值表，
 * 开放任意 key 读写等于把会话超时、钉钉凭据等一并交给会议页，那是横向越权。
 */
public final class MeetingConfigDto {

    private MeetingConfigDto() {
    }

    /** 全局规则视图（房间级列留 NULL 时回落到这里） */
    @Data
    public static class RuleForm {
        @NotNull(message = "請填寫最遠可預約天數")
        @Min(value = 1, message = "最遠可預約天數至少 1 天")
        @Max(value = 365, message = "最遠可預約天數最多 365 天")
        private Integer advanceDays;

        @NotNull(message = "請填寫最少提前分鐘數")
        @Min(value = 0, message = "最少提前分鐘數不得為負")
        @Max(value = 1440, message = "最少提前分鐘數最多 1440 分鐘")
        private Integer minLeadMinutes;

        @NotNull(message = "請填寫默認時長")
        @Min(value = 5, message = "默認時長至少 5 分鐘")
        @Max(value = 720, message = "默認時長最多 720 分鐘")
        private Integer defaultDuration;

        @NotNull(message = "請填寫單場最長時長")
        @Min(value = 15, message = "單場最長時長至少 15 分鐘")
        @Max(value = 720, message = "單場最長時長最多 720 分鐘")
        private Integer maxDuration;

        @NotNull(message = "請填寫時間粒度")
        @Min(value = 5, message = "時間粒度至少 5 分鐘")
        @Max(value = 60, message = "時間粒度最多 60 分鐘")
        private Integer granularityMinutes;

        @NotBlank(message = "請選擇每日可預約開始時間")
        private String bookableStart;

        @NotBlank(message = "請選擇每日可預約結束時間")
        private String bookableEnd;

        @NotNull(message = "請填寫開始前提醒分鐘數")
        @Min(value = 0, message = "提醒分鐘數不得為負（0=不提醒）")
        @Max(value = 1440, message = "提醒分鐘數最多 1440 分鐘")
        private Integer remindMinutes;

        @NotNull(message = "請填寫可提前簽到分鐘數")
        @Min(value = 0, message = "提前簽到分鐘數不得為負")
        @Max(value = 120, message = "提前簽到分鐘數最多 120 分鐘")
        private Integer checkinOpenMinutes;

        @NotNull(message = "請填寫未簽到自動釋放分鐘數")
        @Min(value = 1, message = "自動釋放分鐘數至少 1 分鐘")
        @Max(value = 240, message = "自動釋放分鐘數最多 240 分鐘")
        private Integer releaseAfterMinutes;

        @NotNull(message = "請填寫爽約自動拉黑閾值")
        @Min(value = 0, message = "閾值不得為負（0=不自動拉黑）")
        @Max(value = 30, message = "閾值最多 30 次")
        private Integer noShowThreshold;

        @NotNull(message = "請填寫自動限制天數")
        @Min(value = 1, message = "限制天數至少 1 天")
        @Max(value = 365, message = "限制天數最多 365 天")
        private Integer blacklistDays;

        /**
         * 变更原因：全局规则一改就影响所有人的预约，必须能回答"谁在什么时候为什么改的"。
         * <p>服务端强制而不是只靠前端：前端弹框是体验，把必填只写在前端等于允许绕过 UI
         * 直接改全站规则而不留任何说明，审计就成了一句空话。
         */
        @NotBlank(message = "請填寫變更原因")
        @Size(max = 300, message = "變更原因最長 300 字")
        private String changeReason;
    }

    /** 规则视图（回显当前生效值 + 各键的来源，便于区分"没配过"与"配成了默认值"） */
    @Data
    public static class RuleView {
        private RuleForm rule;
        /** 尚未落库、正使用代码默认值的键（行政需要知道哪些是出厂值） */
        private List<String> missingKeys;
        private String updatedBy;
        private String updatedAt;
    }

    /* ==================== 黑名单 ==================== */

    @Data
    public static class BlacklistQuery {
        private Integer page = 1;
        private Integer size = 20;
        /** 姓名 / 工号 */
        private String keyword;
        /** auto/admin，留空=全部 */
        private String source;
        /** active/revoked，留空=全部 */
        private String status;
        private Long userId;
    }

    @Data
    public static class BlacklistForm {
        @NotNull(message = "請選擇被限制人員")
        private Long userId;

        @NotBlank(message = "請填寫限制原因")
        @Size(max = 300, message = "原因最長 300 字")
        private String reason;

        @NotNull(message = "請填寫限制天數")
        @Min(value = 1, message = "限制天數至少 1 天")
        @Max(value = 365, message = "限制天數最多 365 天")
        private Integer days;
    }

    @Data
    public static class RevokeForm {
        @NotBlank(message = "請填寫撤銷原因")
        @Size(max = 300, message = "原因最長 300 字")
        private String reason;

        @NotNull(message = "缺少版本號，請刷新後重試")
        private Integer version;
    }

    @Data
    public static class BlacklistVO {
        private Long id;
        private Long userId;
        private String empNo;
        private String name;
        private String departmentName;
        private String reason;
        private String source;
        private Integer noShowCount;
        private String startDate;
        private String endDate;
        private String status;
        /** 派生态：active 且已过 end_date 时展示为"已到期"，不靠每日 job 翻状态 */
        private String displayState;
        /** 剩余天数（已到期或已撤销为 null） */
        private Integer remainingDays;
        private String revokeReason;
        private String revokedByName;
        private String revokedAt;
        private Integer version;
        private String createdBy;
        private String createdAt;
    }

    @Data
    public static class BlacklistStats {
        private long total;
        private long effective;
        private long expired;
        private long revoked;
    }

    @Data
    public static class BlacklistPage {
        private PageResult<BlacklistVO> page;
        private BlacklistStats stats;
    }
}
