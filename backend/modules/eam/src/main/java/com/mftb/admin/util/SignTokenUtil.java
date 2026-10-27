package com.mftb.admin.util;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

/**
 * 资产领用签署链接令牌工具
 * 格式: claimId.employeeId.expireAt.hmac  （hmac = HMAC-SHA256(payload)）
 * 用于钉钉通知中的签署页外链，免登录校验领用人身份，有效期 7 天
 */
public final class SignTokenUtil {

    private static final long VALID_DURATION_MS = 7L * 24 * 60 * 60 * 1000;

    private SignTokenUtil() {}

    /** 生成签署令牌（payload = claimId|employeeId，过期时间 = 当前时间 + 7 天） */
    public static String generate(long claimId, long employeeId, String secret) {
        long expireAt = System.currentTimeMillis() + VALID_DURATION_MS;
        String payload = claimId + "|" + employeeId + "|" + expireAt;
        return claimId + "." + employeeId + "." + expireAt + "." + hmac(payload, secret);
    }

    /**
     * 校验令牌有效性（签名一致、未过期、claimId/employeeId 与目标记录匹配）
     *
     * @return 有效返回 true
     */
    public static boolean validate(String token, long claimId, long employeeId, String secret) {
        if (token == null || token.isBlank()) return false;
        String[] parts = token.split("\\.");
        if (parts.length != 4) return false;
        try {
            long tokenClaimId = Long.parseLong(parts[0]);
            long tokenEmployeeId = Long.parseLong(parts[1]);
            long expireAt = Long.parseLong(parts[2]);
            if (tokenClaimId != claimId || tokenEmployeeId != employeeId) return false;
            if (System.currentTimeMillis() > expireAt) return false;
            String payload = tokenClaimId + "|" + tokenEmployeeId + "|" + expireAt;
            return hmac(payload, secret).equals(parts[3]);
        } catch (NumberFormatException e) {
            return false;
        }
    }

    private static String hmac(String data, String secret) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return Base64.getUrlEncoder().withoutPadding()
                    .encodeToString(mac.doFinal(data.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException("HMAC 计算失败", e);
        }
    }
}
