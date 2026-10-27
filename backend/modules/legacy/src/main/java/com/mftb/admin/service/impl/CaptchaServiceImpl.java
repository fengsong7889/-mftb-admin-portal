package com.mftb.admin.service.impl;

import com.mftb.admin.service.CaptchaService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.HexFormat;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 滑块验证码 Token 签发与校验实现
 * Token 格式: expireAt.nonce.signature
 *  - expireAt: 过期时间戳（毫秒），防长期有效
 *  - nonce: 安全随机数，服务端存储并一次性消费，防重放
 *  - signature: HMAC-SHA256(expireAt.nonce)，防伪造/篡改
 */
@Slf4j
@Service
public class CaptchaServiceImpl implements CaptchaService {

    /** Token 有效期：5 分钟 */
    private static final long TOKEN_TTL_MS = 5 * 60 * 1000L;
    /** 内存中最多保留的未消费 nonce 数，超过则清理过期条目 */
    private static final int MAX_NONCE_ENTRIES = 1000;

    /** 已签发未消费的 nonce → 过期时间戳 */
    private final ConcurrentHashMap<String, Long> nonceStore = new ConcurrentHashMap<>();
    private final SecureRandom secureRandom = new SecureRandom();
    private final SecretKeySpec hmacKey;

    public CaptchaServiceImpl(@Value("${jwt.secret}") String secret) {
        // 域名隔离派生密钥，避免与 JWT 签名密钥直接复用
        this.hmacKey = new SecretKeySpec(("captcha:" + secret).getBytes(StandardCharsets.UTF_8), "HmacSHA256");
    }

    @Override
    public String issueToken() {
        long expireAt = System.currentTimeMillis() + TOKEN_TTL_MS;
        byte[] nonceBytes = new byte[16];
        secureRandom.nextBytes(nonceBytes);
        String nonce = HexFormat.of().formatHex(nonceBytes);
        String payload = expireAt + "." + nonce;
        String token = payload + "." + hmac(payload);
        nonceStore.put(nonce, expireAt);
        // 定期清理过期条目，防止内存膨胀
        if (nonceStore.size() > MAX_NONCE_ENTRIES) {
            long now = System.currentTimeMillis();
            nonceStore.entrySet().removeIf(e -> e.getValue() < now);
        }
        return token;
    }

    @Override
    public boolean verifyAndConsume(String token) {
        if (token == null || token.isBlank()) {
            return false;
        }
        String[] parts = token.split("\\.");
        if (parts.length != 3) {
            return false;
        }
        try {
            long expireAt = Long.parseLong(parts[0]);
            String nonce = parts[1];
            String payload = parts[0] + "." + nonce;
            // 1. 签名校验（常量时间比较，防时序攻击）
            String expected = hmac(payload);
            if (!MessageDigest.isEqual(expected.getBytes(StandardCharsets.UTF_8),
                    parts[2].getBytes(StandardCharsets.UTF_8))) {
                return false;
            }
            // 2. 有效期校验
            if (System.currentTimeMillis() > expireAt) {
                nonceStore.remove(nonce);
                return false;
            }
            // 3. 一次性消费：仅当 nonce 存在且被成功移除时才有效（防重放）
            return nonceStore.remove(nonce) != null;
        } catch (Exception e) {
            log.warn("captchaToken 校验异常: {}", e.getMessage());
            return false;
        }
    }

    /** 计算 HMAC-SHA256 签名（hex） */
    private String hmac(String payload) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(hmacKey);
            return HexFormat.of().formatHex(mac.doFinal(payload.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException("HMAC 计算失败", e);
        }
    }
}
