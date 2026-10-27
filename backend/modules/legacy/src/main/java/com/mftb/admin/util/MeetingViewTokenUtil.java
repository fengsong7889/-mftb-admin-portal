package com.mftb.admin.util;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Base64;

/**
 * 会议详情免登查看令牌：格式 {@code bookingId.expireAt.hmac}。
 *
 * <p><b>为什么不复用签到令牌</b>：签到令牌绑的是"人 + 会议 + 会后 2 小时"，只回令牌绑定者
 * 自己的那一行；详情令牌绑的是"一场会 + 可回看期"，读到的是整场会的公开信息。
 * 借一条等于让签到链接能读全场信息，或让详情链接能替人签到。
 *
 * <p><b>为什么令牌不带收件人</b>：邀约卡片发给 N 个人，逐人签发会让同一场会长出 N 条链接，
 * 且收件人转发给同组同事时反而失效；这里只授予「这一场会的只读查看权」，与日报看板同一口径。
 *
 * <p>任何不匹配（篡改、过期、格式错）统一返回 {@code null}，调用方给同一句提示：
 * 区分错误原因等于允许用错误响应枚举有效令牌。
 */
public final class MeetingViewTokenUtil {

    private MeetingViewTokenUtil() {
    }

    /** 令牌承载的二组信息 */
    public record Token(long bookingId, long expireAt) {
    }

    public static String generate(long bookingId, LocalDateTime expireAt, String secret) {
        long expireMilli = expireAt.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli();
        return bookingId + "." + expireMilli + "." + hmac(bookingId + "|" + expireMilli, secret);
    }

    /**
     * 校验签名与有效期；会议是否仍存在、是否已终态由服务层查库判断（令牌只证明
     * "哪场会、在什么时间之前"，事实必须查库）。
     */
    public static Token parse(String token, String secret) {
        if (token == null || token.isBlank() || secret == null || secret.isBlank()) {
            return null;
        }
        String[] parts = token.trim().split("\\.");
        if (parts.length != 3) {
            return null;
        }
        try {
            long bookingId = Long.parseLong(parts[0]);
            long expireAt = Long.parseLong(parts[1]);
            if (bookingId <= 0 || System.currentTimeMillis() > expireAt) {
                return null;
            }
            byte[] expected = Base64.getUrlDecoder().decode(hmac(bookingId + "|" + expireAt, secret));
            byte[] actual = Base64.getUrlDecoder().decode(parts[2]);
            if (!MessageDigest.isEqual(expected, actual)) {
                return null;
            }
            return new Token(bookingId, expireAt);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private static String hmac(String data, String secret) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return Base64.getUrlEncoder().withoutPadding()
                    .encodeToString(mac.doFinal(data.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException("HMAC 計算失敗", e);
        }
    }
}
