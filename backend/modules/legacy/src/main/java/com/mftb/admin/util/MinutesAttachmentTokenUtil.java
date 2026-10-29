package com.mftb.admin.util;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Base64;

/**
 * 纪要附件访问票据（站内登录态之外的浏览器直开入口）。
 *
 * <p>为什么用短时效 HMAC 票据而不是把 JWT 拼进 URL：新标签页/钉钉外部浏览器
 * 不会携带 Authorization 头，拼 JWT 等于把长期登录凭据复制进地址栏、代理日志与
 * Referer——票据只证明「这一个附件、这一个用途、这五分钟内」，泄露面被 TTL 封顶。
 *
 * <p>payload 绑 userId：兑换时复核该用户仍然启用且对资源有读权限（服务层查库），
 * 票据本身不授权，只免掉「带不动的 Authorization 头」。
 */
public final class MinutesAttachmentTokenUtil {

    /** 票据有效期：够点开一个预览并慢半拍重试，不够被收藏转发长期使用 */
    public static final Duration TTL = Duration.ofMinutes(5);

    public static final String PURPOSE_VIEW = "view";
    public static final String PURPOSE_DOWNLOAD = "download";

    private MinutesAttachmentTokenUtil() {
    }

    /** 票据承载的四元组 */
    public record Ticket(String attachmentNo, String purpose, long userId, long expireAt) {
    }

    public static String generate(String attachmentNo, String purpose, long userId, String secret) {
        long expireAt = LocalDateTime.now().plus(TTL)
                .atZone(ZoneId.systemDefault()).toInstant().toEpochMilli();
        return "v1." + attachmentNo + "." + purpose + "." + userId + "." + expireAt
                + "." + hmac(payload(attachmentNo, purpose, userId, expireAt), secret);
    }

    /**
     * 校验签名与有效期；任何不匹配（篡改、过期、格式错、用途非法）返回 {@code null}，
     * 调用方统一按「链接不可用」处理——区分错误码等于给探测者递线索。
     */
    public static Ticket parse(String ticket, String secret) {
        if (ticket == null || ticket.isBlank()) {
            return null;
        }
        String[] parts = ticket.trim().split("\\.");
        if (parts.length != 6 || !"v1".equals(parts[0])) {
            return null;
        }
        try {
            String attachmentNo = parts[1];
            String purpose = parts[2];
            long userId = Long.parseLong(parts[3]);
            long expireAt = Long.parseLong(parts[4]);
            if (!PURPOSE_VIEW.equals(purpose) && !PURPOSE_DOWNLOAD.equals(purpose)) {
                return null;
            }
            if (userId <= 0 || System.currentTimeMillis() > expireAt
                    || !MessageDigest.isEqual(hmac(payload(attachmentNo, purpose, userId, expireAt), secret)
                            .getBytes(StandardCharsets.UTF_8), parts[5].getBytes(StandardCharsets.UTF_8))) {
                return null;
            }
            return new Ticket(attachmentNo, purpose, userId, expireAt);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static String payload(String attachmentNo, String purpose, long userId, long expireAt) {
        return "minutes-attachment|" + attachmentNo + "|" + purpose + "|" + userId + "|" + expireAt;
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
