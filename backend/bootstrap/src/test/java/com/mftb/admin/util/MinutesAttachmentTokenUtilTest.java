package com.mftb.admin.util;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

/**
 * 纪要附件访问票据。
 *
 * <p>钉住的是票据作为"URL 里唯一凭据"必须扛住的攻击：改用途（view 偷换 download
 * 无所谓，但 download 换 view 绕转换也一样）、改附件号、改用户、改有效期、
 * 以及拿纪要免登令牌来当票据用（两套 HMAC 的 payload 前缀不同，必须互不通用）。
 */
class MinutesAttachmentTokenUtilTest {

    private static final String SECRET = "unit-test-secret";

    @Test
    @DisplayName("签发即可解析，四元组原样带回")
    void roundTrips() {
        String no = "a".repeat(32);
        MinutesAttachmentTokenUtil.Ticket parsed =
                MinutesAttachmentTokenUtil.parse(MinutesAttachmentTokenUtil.generate(no, "view", 7L, SECRET), SECRET);
        assertNotNull(parsed);
        assertEquals(no, parsed.attachmentNo());
        assertEquals("view", parsed.purpose());
        assertEquals(7L, parsed.userId());
    }

    @Test
    @DisplayName("篡改附件号/用途/用户/有效期，任何一处都整体失效")
    void rejectsTampering() {
        String ticket = MinutesAttachmentTokenUtil.generate("a".repeat(32), "view", 7L, SECRET);
        String[] parts = ticket.split("\\.");
        parts[1] = "b".repeat(32);
        assertNull(MinutesAttachmentTokenUtil.parse(String.join(".", parts), SECRET));
        parts = ticket.split("\\.");
        parts[2] = "download";
        assertNull(MinutesAttachmentTokenUtil.parse(String.join(".", parts), SECRET));
        parts = ticket.split("\\.");
        parts[3] = "8";
        assertNull(MinutesAttachmentTokenUtil.parse(String.join(".", parts), SECRET));
        parts = ticket.split("\\.");
        parts[4] = String.valueOf(Long.parseLong(parts[4]) + 600_000);
        assertNull(MinutesAttachmentTokenUtil.parse(String.join(".", parts), SECRET));
    }

    @Test
    @DisplayName("换密钥解不开：不同环境/轮换密钥后的旧票据立刻作废")
    void rejectsOtherSecret() {
        String ticket = MinutesAttachmentTokenUtil.generate("a".repeat(32), "download", 7L, SECRET);
        assertNull(MinutesAttachmentTokenUtil.parse(ticket, "another-secret"));
    }

    @Test
    @DisplayName("非 view/download 的用途根本签不出来")
    void rejectsUnknownPurpose() {
        // 直接手工拼一个"删除"用途的 payload：解析必须拒绝，防止给票据系统开出新用途
        String forged = "v1." + "a".repeat(32) + ".delete.7." + (System.currentTimeMillis() + 60_000) + ".x";
        assertNull(MinutesAttachmentTokenUtil.parse(forged, SECRET));
    }

    @Test
    @DisplayName("与纪要免登令牌互不通用：两套凭据的 payload 前缀不同")
    void notInterchangeableWithMinutesToken() {
        String minutesToken = MinutesViewTokenUtil.generate(9L, 3L, 0,
                java.time.LocalDateTime.now().plusDays(1), SECRET);
        assertNull(MinutesAttachmentTokenUtil.parse(minutesToken, SECRET));
        String attachmentTicket = MinutesAttachmentTokenUtil.generate("a".repeat(32), "view", 7L, SECRET);
        assertNull(MinutesViewTokenUtil.parse(attachmentTicket, SECRET));
    }
}
