package com.mftb.admin.util;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Base64;

/**
 * 会议纪要免登查看令牌：格式 {@code minutesId.sendId.tokenVersion.expireAt.hmac}。
 *
 * <p>为什么不复用签到令牌（{@link CheckinTokenUtil}）：签到令牌绑的是"人 + 会议 + 会后 2 小时"，
 * 纪要是"某一批次发出的那一份正文 + 可回看 90 天"。两者绑的对象和时长都不同，
 * 借一条等于让签到链接能读纪要正文，或让纪要链接能替人签到。
 *
 * <p>令牌里必须带 {@code tokenVersion}：记录人在纪要页点"作廢查看鏈接"后，
 * 主表版本递增，凡版本不等于当前版本的令牌一律判无效——不需要遍历历史投递行逐条打标。
 */
public final class MinutesViewTokenUtil {

    private MinutesViewTokenUtil() {
    }

    /** 令牌承载的四元组 */
    public record Token(long minutesId, long sendId, int tokenVersion, long expireAt) {
    }

    public static String generate(long minutesId, long sendId, int tokenVersion, LocalDateTime expireAt, String secret) {
        long expireMilli = expireAt.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli();
        return minutesId + "." + sendId + "." + tokenVersion + "." + expireMilli
                + "." + hmac(payload(minutesId, sendId, tokenVersion, expireMilli), secret);
    }

    /**
     * 校验签名与有效期。
     *
     * <p>不校验"这个批次属不属于这份纪要""版本是否已被作废"——那是服务层职责（令牌只证明
     * "哪一批、在什么时间之前"，事实要查库）。任何不匹配（篡改、过期、格式错）都返回 {@code null}，
     * 调用方统一给一句提示：区分错误码等于允许人用错误响应枚举有效令牌。
     */
    public static Token parse(String token, String secret) {
        if (token == null || token.isBlank()) {
            return null;
        }
        String[] parts = token.trim().split("\\.");
        if (parts.length != 5) {
            return null;
        }
        try {
            long minutesId = Long.parseLong(parts[0]);
            long sendId = Long.parseLong(parts[1]);
            int tokenVersion = Integer.parseInt(parts[2]);
            long expireAt = Long.parseLong(parts[3]);
            if (minutesId <= 0 || sendId <= 0 || tokenVersion < 0 || System.currentTimeMillis() > expireAt) {
                return null;
            }
            if (!hmac(payload(minutesId, sendId, tokenVersion, expireAt), secret).equals(parts[4])) {
                return null;
            }
            return new Token(minutesId, sendId, tokenVersion, expireAt);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static String payload(long minutesId, long sendId, int tokenVersion, long expireAt) {
        return minutesId + "|" + sendId + "|" + tokenVersion + "|" + expireAt;
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
