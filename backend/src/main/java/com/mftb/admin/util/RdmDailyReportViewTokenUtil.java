package com.mftb.admin.util;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.Base64;

/**
 * 进度日报看板开放链接令牌：{@code base64url(payload).base64url(hmac)}。
 *
 * <p><b>为什么不用登录态</b>：日报推给项目经理/产品负责人与钉钉群，读者常常没有后台账号，
 * 要求登录等于把推送做成白发。令牌只授予「一份快照的只读查看权」，不能列表、不能改配置。
 *
 * <p><b>为什么不用 JWT</b>：这里只需要「绑定范围 + 过期」两件事，自签 HMAC 结构更小、无库依赖，
 * 也与项目内免登页（签到/纪要/签署）保持同一套安全模型。密钥按域隔离派生，
 * 换一把不会让其他免登链接同时失效。
 *
 * <p><b>payload 字段</b>：date|type|projectId|iterationCode|issuedAt|expireAt。
 * 不用点号分隔字段，避免迭代编码含分隔符时解析歧义；整个 payload 再做 URL-safe Base64。
 */
public final class RdmDailyReportViewTokenUtil {

    private RdmDailyReportViewTokenUtil() {
    }

    /** 令牌承载的范围与时效；{@code projectId/iterationCode} 为空表示不按该维度收敛。 */
    public record Token(LocalDate reportDate, String reportType, Long projectId, String iterationCode,
                        long issuedAt, long expireAt, String scopeKey) {
    }

    public static String generate(LocalDate reportDate, String reportType, Long projectId, String iterationCode,
                                  long issuedAt, long expireAt, String secret) {
        return generate(reportDate, reportType, projectId, iterationCode, issuedAt, expireAt, null, secret);
    }

    /**
     * 带范围键的令牌：多项目/全部项目快照没有单一 projectId，公开页必须靠 scopeKey 精确命中那份快照，
     * 否则同一天多规则时只能取最新一条，读者会打开别的范围的日报。
     */
    public static String generate(LocalDate reportDate, String reportType, Long projectId, String iterationCode,
                                  long issuedAt, long expireAt, String scopeKey, String secret) {
        String payload = payload(reportDate, reportType, projectId, iterationCode, issuedAt, expireAt, scopeKey);
        String body = encoder().encodeToString(payload.getBytes(StandardCharsets.UTF_8));
        return body + "." + encoder().encodeToString(hmac(body, secret));
    }

    /**
     * 校验签名与结构，<b>不校验是否过期</b>：过期判定要用「当前配置的有效期」二次约束，
     * 属于服务层职责（见 {@code RdmDailyReportService#publicView}）。
     *
     * <p>任何不匹配（篡改、格式错、字段非法）统一返回 {@code null}，调用方给同一句提示——
     * 区分错误原因等于允许用错误响应枚举有效令牌。
     */
    public static Token parse(String token, String secret) {
        if (token == null || token.isBlank()) {
            return null;
        }
        String[] parts = token.trim().split("\\.");
        if (parts.length != 2) {
            return null;
        }
        byte[] signature;
        try {
            signature = decoder().decode(parts[1]);
        } catch (IllegalArgumentException e) {
            return null;
        }
        if (!MessageDigest.isEqual(hmac(parts[0], secret), signature)) {
            return null;
        }
        String payload;
        try {
            payload = new String(decoder().decode(parts[0]), StandardCharsets.UTF_8);
        } catch (IllegalArgumentException e) {
            return null;
        }
        // 兼容两代令牌：旧链接 6 段、新链接第 7 段是快照范围键
        String[] fields = payload.split("\\|", -1);
        if (fields.length != 6 && fields.length != 7) {
            return null;
        }
        try {
            LocalDate reportDate = LocalDate.parse(fields[0]);
            String reportType = fields[1];
            Long projectId = fields[2].isEmpty() ? null : Long.valueOf(fields[2]);
            String iterationCode = fields[3].isEmpty() ? null : fields[3];
            long issuedAt = Long.parseLong(fields[4]);
            long expireAt = Long.parseLong(fields[5]);
            String scopeKey = fields.length == 7 && !fields[6].isEmpty() ? fields[6] : null;
            if (reportType.isBlank() || issuedAt <= 0 || expireAt <= issuedAt) {
                return null;
            }
            return new Token(reportDate, reportType, projectId, iterationCode, issuedAt, expireAt, scopeKey);
        } catch (DateTimeParseException | NumberFormatException e) {
            return null;
        }
    }

    private static String payload(LocalDate reportDate, String reportType, Long projectId, String iterationCode,
                                  long issuedAt, long expireAt, String scopeKey) {
        return reportDate + "|" + reportType + "|" + (projectId == null ? "" : projectId) + "|"
                + (iterationCode == null ? "" : iterationCode) + "|" + issuedAt + "|" + expireAt
                + (scopeKey == null || scopeKey.isBlank() ? "" : "|" + scopeKey);
    }

    private static byte[] hmac(String data, String secret) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            throw new IllegalStateException("HMAC 計算失敗", e);
        }
    }

    private static Base64.Encoder encoder() {
        return Base64.getUrlEncoder().withoutPadding();
    }

    private static Base64.Decoder decoder() {
        return Base64.getUrlDecoder();
    }
}
