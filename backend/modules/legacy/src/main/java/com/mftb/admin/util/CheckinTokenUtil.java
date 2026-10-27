package com.mftb.admin.util;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Base64;

/**
 * 会议签到免登令牌：格式 {@code bookingId.userId.expireAt.hmac}（hmac=HMAC-SHA256(payload)）。
 *
 * <p>为什么不复用领用签署的 {@link SignTokenUtil}：它的有效期写死 7 天，而签到令牌的语义是
 * "会议结束后不久就该失效"。借一条 7 天有效的链接等于把会议室入口挂在钉钉消息里整整一周；
 * 与其在两个语义不同的场景之间共享一个时长，不如各自把时长钉在自己的工具里。
 *
 * <p>令牌绑定到具体参会人（userId）而不是只绑会议：只绑会议的话，任何拿到链接的人都能替别人签到，
 * 出席记录就失去证据价值。
 */
public final class CheckinTokenUtil {

    /** 会议结束后仍可用的宽限期（小时）：给"人到了但会议刚被系统收尾"这种情况留出补救窗口 */
    private static final Duration AFTER_END_GRACE = Duration.ofHours(2);

    private CheckinTokenUtil() {
    }

    /**
     * 生成签到令牌。
     *
     * @param meetingEnd 会议实际结束时刻（过期时间 = 结束 + 宽限期，不由"签发时刻 + 固定天数"决定，
     *                   否则提前三周建的例会其二维码在会前就能被无限次使用）
     */
    public static String generate(long bookingId, long userId, LocalDateTime meetingEnd, String secret) {
        LocalDateTime end = meetingEnd == null ? LocalDateTime.now().plusDays(1) : meetingEnd;
        long expireAt = end.plus(AFTER_END_GRACE).atZone(ZoneId.systemDefault()).toInstant().toEpochMilli();
        String payload = bookingId + "|" + userId + "|" + expireAt;
        return bookingId + "." + userId + "." + expireAt + "." + hmac(payload, secret);
    }

    /**
     * 校验令牌签名与有效期。
     *
     * <p>不校验"这个人是不是参会人"——那是服务层职责（令牌只证明"谁在什么时间之前"，
     * 名单归属要查库，否则伪造一个合法签名的令牌就能签到任意会议）。
     *
     * @return 校验通过返回三元组，任何不匹配（含篡改、过期、格式错）都返回 {@code null}
     */
    public static Token parse(String token, String secret) {
        if (token == null || token.isBlank()) {
            return null;
        }
        String[] parts = token.split("\\.");
        if (parts.length != 4) {
            return null;
        }
        try {
            long bookingId = Long.parseLong(parts[0]);
            long userId = Long.parseLong(parts[1]);
            long expireAt = Long.parseLong(parts[2]);
            if (bookingId <= 0 || userId <= 0 || System.currentTimeMillis() > expireAt) {
                return null;
            }
            String payload = bookingId + "|" + userId + "|" + expireAt;
            if (!hmac(payload, secret).equals(parts[3])) {
                return null;
            }
            return new Token(bookingId, userId, expireAt);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /** 令牌承载的三元组 */
    public record Token(long bookingId, long userId, long expireAt) {
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
