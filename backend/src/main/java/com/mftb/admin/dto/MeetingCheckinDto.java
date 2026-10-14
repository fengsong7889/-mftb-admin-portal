package com.mftb.admin.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * 免登签到页契约（扫码直达，无 JWT）。
 *
 * <p>字段刻意窄：只给"我是谁、这场会是什么、现在能不能签"。免登页在安全白名单里，
 * 每一个字段的暴露都不受登录态保护，所以参会人名单、议程、关联需求等业务字段
 * 一律不在这个视图里出现——只回当前令牌绑定的那一个人的信息。
 */
public final class MeetingCheckinDto {

    private MeetingCheckinDto() {
    }

    /** 令牌签发动作（登录后取自己的签到链接/二维码） */
    @Data
    public static class TokenForm {
        @NotBlank(message = "缺少參會令牌")
        @Size(max = 200, message = "令牌長度異常")
        private String token;
    }

    /**
     * 签发结果：令牌 + 可直接分享的链接。
     *
     * <p>令牌**只在这个响应里出现**，不写进会议详情 VO：详情接口会被列表页、通知回执等
     * 多个场景复用，把免登凭据混在业务字段里等于把它复制到浏览器历史、日志与缓存里各处一遍。
     */
    @Data
    public static class TokenIssued {
        private String token;
        /** 完整签到链接（前端渲染二维码与"复制链接"都用它，避免前后端各拼一套格式） */
        private String url;
        private String expireAt;
        private Long bookingId;
    }

    /** 免登页视图 */
    @Data
    public static class PublicView {
        /** 令牌是否有效（无效时只给结论与提示语，不说明是签名错还是过期——细节留给攻击者推断） */
        private Boolean valid;
        private String message;
        private Long bookingId;
        private String bookingNo;
        private String title;
        private String startTime;
        private String endTime;
        private String roomName;
        private String roomLocation;
        private String organizerName;
        /** 令牌绑定的人 */
        private String myName;
        private String myEmpNo;
        private String myRole;
        private Boolean checkedIn;
        private String checkinAt;
        private Boolean canCheckin;
        /** 已签到时给出提示而非按钮；未开始时给出可签到时间 */
        private String checkinOpenAt;
        private String checkinDeadlineAt;
        /** 令牌过期时刻（页面倒计时用，避免用户反复点一个已失效的链接） */
        private String tokenExpireAt;
    }
}
