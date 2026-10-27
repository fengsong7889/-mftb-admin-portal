package com.mftb.admin.util;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

/**
 * 会议详情免登令牌单测（纯逻辑，不触库）。
 *
 * <p>钉住三件事：签名必须绑会议、篡改任何字段都验不过、过期/结构非法一律返回 null，
 * 让调用方给同一句提示（不区分错误原因，避免用错误响应枚举有效令牌）。
 */
class MeetingViewTokenUtilTest {

    private static final String SECRET = "meeting-view:test-secret";

    @Test
    @DisplayName("生成后解析：会议ID与到期时刻原样还原")
    void roundTrip() {
        LocalDateTime expire = LocalDateTime.now().plusDays(30);
        String token = MeetingViewTokenUtil.generate(22L, expire, SECRET);
        MeetingViewTokenUtil.Token parsed = MeetingViewTokenUtil.parse(token, SECRET);
        assertNotNull(parsed);
        assertEquals(22L, parsed.bookingId());
        assertEquals(expire.atZone(java.time.ZoneId.systemDefault()).toInstant().toEpochMilli(), parsed.expireAt());
    }

    @Test
    @DisplayName("过期令牌拒绝：会议结束后回看期到了就不能再打开")
    void rejectsExpiredToken() {
        String token = MeetingViewTokenUtil.generate(22L, LocalDateTime.now().minusMinutes(1), SECRET);
        assertNull(MeetingViewTokenUtil.parse(token, SECRET));
    }

    @Test
    @DisplayName("篡改会议ID后签名不匹配：不能把链接改成打开别的会")
    void rejectsTamperedBookingId() {
        LocalDateTime expire = LocalDateTime.now().plusDays(30);
        String token = MeetingViewTokenUtil.generate(22L, expire, SECRET);
        String signature = token.substring(token.lastIndexOf('.') + 1);
        long expireMilli = expire.atZone(java.time.ZoneId.systemDefault()).toInstant().toEpochMilli();
        String forged = 23L + "." + expireMilli + "." + signature;
        assertNull(MeetingViewTokenUtil.parse(forged, SECRET));
    }

    @Test
    @DisplayName("换密钥即失效：签到/纪要/详情三类免登链接不能互借")
    void rejectsWrongSecret() {
        String token = MeetingViewTokenUtil.generate(22L, LocalDateTime.now().plusDays(30), SECRET);
        assertNull(MeetingViewTokenUtil.parse(token, "meeting-view:another-secret"));
        assertNull(MeetingViewTokenUtil.parse(token, null));
    }

    @Test
    @DisplayName("结构非法（空/缺段/非数字/签名非 Base64）一律 null")
    void rejectsMalformedTokens() {
        assertNull(MeetingViewTokenUtil.parse(null, SECRET));
        assertNull(MeetingViewTokenUtil.parse("", SECRET));
        assertNull(MeetingViewTokenUtil.parse("22.only-two", SECRET));
        assertNull(MeetingViewTokenUtil.parse("a.b.c", SECRET));
        assertNull(MeetingViewTokenUtil.parse("22.9999999999999.%%%", SECRET));
    }
}
