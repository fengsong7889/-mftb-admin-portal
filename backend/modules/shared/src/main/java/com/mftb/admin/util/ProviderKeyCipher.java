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
import java.util.HexFormat;

/**
 * AI 供应商 API Key 静态加密器（AES-256-GCM）。
 * <p>
 * 密钥优先取环境变量 {@code AI_PROVIDER_CRYPTO_KEY}，未配置时回退复用 {@code JWT_SECRET}。
 * 这个回退正是历史事故根因：轮换签名密钥会连带把已入库的供应商密文全部作废，而页面只表现为
 * 「未配置」，管理员据此反复重填却始终不解问题（2026-10-31 实测 42 条 Tag mismatch 告警）。
 * 因此密文自带密钥指纹 {@code enc:v1:<keyId>:<base64(iv|ciphertext|tag)>}，把
 * 「加密密钥换过」与「从未配置 / 数据损坏」拆成三种可判定状态，并在启动时告警提示解耦。
 * <p>
 * 兼容：无指纹的历史 {@code enc:<base64>} 密文仍用当前密钥尝试解密；更早的明文存储原样返回。
 */
@Slf4j
@Component
public class ProviderKeyCipher {

    /** 密文标识前缀，用于区分历史明文 */
    private static final String PREFIX = "enc:";
    /** 带密钥指纹的密文前缀（当前写入格式） */
    private static final String V1_PREFIX = "enc:v1:";
    /** GCM 推荐 IV 长度（字节） */
    private static final int GCM_IV_LENGTH = 12;
    /** GCM 认证标签长度（比特） */
    private static final int GCM_TAG_BITS = 128;
    /** 指纹取密钥摘要前 4 字节（8 个十六进制字符）：够区分密钥，又不泄露密钥本身 */
    private static final int KEY_ID_BYTES = 4;

    @Value("${ai.provider.crypto-key:${jwt.secret}}")
    private String keyMaterial;

    /** 仅用于识别「加密密钥正在复用签名密钥」这一危险耦合，不参与加解密 */
    @Value("${jwt.secret:}")
    private String jwtSecret;

    private SecretKeySpec secretKey;
    private String keyId;
    private final SecureRandom secureRandom = new SecureRandom();

    /** 存储值的可用状态：三态缺一不可，否则「解不开」会被误报成「没配」。 */
    public enum Outcome {
        /** 从未配置（NULL / 空串） */
        UNSET,
        /** 可取用明文（含改造前的历史明文存储） */
        OK,
        /** 存过密文但当前密钥解不开：加密密钥已轮换或数据损坏，只能由管理员重填 */
        STALE
    }

    @PostConstruct
    public void init() throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256")
                .digest(keyMaterial.getBytes(StandardCharsets.UTF_8));
        this.secretKey = new SecretKeySpec(digest, "AES");
        this.keyId = HexFormat.of().formatHex(digest, 0, KEY_ID_BYTES);
        if (keyMaterial.equals(jwtSecret)) {
            log.warn("AI 供应商 API Key 加密密钥未独立配置（缺少 AI_PROVIDER_CRYPTO_KEY），当前复用 JWT_SECRET；"
                    + "轮换 JWT_SECRET 会让已入库的供应商密钥全部解不开，请先配置独立密钥再做轮换");
        }
    }

    /**
     * 加密明文 API Key。
     *
     * @param plain 明文；为空时原样返回（不加密）
     * @return {@code enc:v1:<keyId>:<base64>} 密文
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
            return V1_PREFIX + keyId + ":" + Base64.getEncoder().encodeToString(combined);
        } catch (Exception e) {
            log.error("API Key 加密失败", e);
            throw new IllegalStateException("API Key 加密失败", e);
        }
    }

    /**
     * 解密存储值。
     *
     * @param stored 数据库存储值；非 {@code enc:} 前缀视为历史明文原样返回
     * @return 明文；未配置或解密失败（如密钥变更）返回 {@code null}
     */
    public String decrypt(String stored) {
        return probe(stored) == Outcome.OK ? open(stored) : null;
    }

    /**
     * 判定存储值能否被当前密钥取用，供上层把「没配」和「配过但解不开」分开表达。
     *
     * @param stored 数据库存储值
     * @return 可用状态；不会抛异常，任何损坏形态都归入 {@link Outcome#STALE}
     */
    public Outcome inspect(String stored) {
        return probe(stored);
    }

    /** 指纹匹配与否只能排除「密钥换过」，标签校验仍要真跑一遍才能确认数据完整。 */
    private Outcome probe(String stored) {
        if (stored == null || stored.isBlank()) {
            return Outcome.UNSET;
        }
        if (!stored.startsWith(PREFIX)) {
            return Outcome.OK;
        }
        if (stored.startsWith(V1_PREFIX)) {
            int sep = stored.indexOf(':', V1_PREFIX.length());
            if (sep < 0) {
                return Outcome.STALE;
            }
            if (!keyId.equals(stored.substring(V1_PREFIX.length(), sep))) {
                log.warn("API Key 密文由另一把加密密钥写入（存储指纹 ≠ 当前指纹），需重新填写");
                return Outcome.STALE;
            }
        }
        return open(stored) == null ? Outcome.STALE : Outcome.OK;
    }

    /** 真正的解密动作；失败返回 null，不向上抛异常（管理页读列表时不能让整张表 500）。 */
    private String open(String stored) {
        if (stored == null || stored.isBlank()) {
            return stored;
        }
        if (!stored.startsWith(PREFIX)) {
            return stored;
        }
        try {
            String payload = payloadOf(stored);
            if (payload == null) {
                return null;
            }
            byte[] combined = Base64.getDecoder().decode(payload);
            if (combined.length <= GCM_IV_LENGTH) {
                return null;
            }
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

    /** 剥掉密文前缀与指纹段，返回 Base64 载荷；格式不合法时返回 null。 */
    private static String payloadOf(String stored) {
        if (stored.startsWith(V1_PREFIX)) {
            int sep = stored.indexOf(':', V1_PREFIX.length());
            return sep < 0 ? null : stored.substring(sep + 1);
        }
        return stored.substring(PREFIX.length());
    }
}
