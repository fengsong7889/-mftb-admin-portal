package com.mftb.admin.util;

import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;

/**
 * AI 供应商 API Key 静态加密器（AES-256-GCM）。
 * <p>
 * 密钥派生自环境变量 {@code AI_PROVIDER_CRYPTO_KEY}，未配置时回退复用 {@code JWT_SECRET}。
 * 密文以 {@code enc:} 前缀标识；无前缀的历史明文在 {@link #decrypt(String)} 中原样返回，
 * 保证加密改造前的存量数据仍可正常展示（向后兼容）。
 */
@Slf4j
@Component
public class ProviderKeyCipher {

    /** 密文标识前缀，用于区分历史明文 */
    private static final String PREFIX = "enc:";
    /** GCM 推荐 IV 长度（字节） */
    private static final int GCM_IV_LENGTH = 12;
    /** GCM 认证标签长度（比特） */
    private static final int GCM_TAG_BITS = 128;

    @Value("${ai.provider.crypto-key:${jwt.secret}}")
    private String keyMaterial;

    private SecretKeySpec secretKey;
    private final SecureRandom secureRandom = new SecureRandom();

    @PostConstruct
    public void init() throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256")
                .digest(keyMaterial.getBytes(StandardCharsets.UTF_8));
        this.secretKey = new SecretKeySpec(digest, "AES");
    }

    /**
     * 加密明文 API Key。
     *
     * @param plain 明文；为空时原样返回（不加密）
     * @return {@code enc:} 前缀的 Base64 密文
     */
    public String encrypt(String plain) {
        if (plain == null || plain.isBlank()) {
            return plain;
        }
        try {
            byte[] iv = new byte[GCM_IV_LENGTH];
            secureRandom.nextBytes(iv);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, secretKey, new GCMParameterSpec(GCM_TAG_BITS, iv));
            byte[] cipherText = cipher.doFinal(plain.getBytes(StandardCharsets.UTF_8));
            byte[] combined = new byte[iv.length + cipherText.length];
            System.arraycopy(iv, 0, combined, 0, iv.length);
            System.arraycopy(cipherText, 0, combined, iv.length, cipherText.length);
            return PREFIX + Base64.getEncoder().encodeToString(combined);
        } catch (Exception e) {
            log.error("API Key 加密失败", e);
            throw new IllegalStateException("API Key 加密失败", e);
        }
    }

    /**
     * 解密存储值。
     *
     * @param stored 数据库存储值；非 {@code enc:} 前缀视为历史明文原样返回
     * @return 明文；解密失败（如密钥变更）返回 {@code null}
     */
    public String decrypt(String stored) {
        if (stored == null || stored.isBlank()) {
            return stored;
        }
        if (!stored.startsWith(PREFIX)) {
            return stored;
        }
        try {
            byte[] combined = Base64.getDecoder().decode(stored.substring(PREFIX.length()));
            byte[] iv = new byte[GCM_IV_LENGTH];
            System.arraycopy(combined, 0, iv, 0, GCM_IV_LENGTH);
            byte[] cipherText = new byte[combined.length - GCM_IV_LENGTH];
            System.arraycopy(combined, GCM_IV_LENGTH, cipherText, 0, cipherText.length);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, secretKey, new GCMParameterSpec(GCM_TAG_BITS, iv));
            return new String(cipher.doFinal(cipherText), StandardCharsets.UTF_8);
        } catch (Exception e) {
            log.warn("API Key 解密失败，可能加密密钥已变更: {}", e.getMessage());
            return null;
        }
    }
}
