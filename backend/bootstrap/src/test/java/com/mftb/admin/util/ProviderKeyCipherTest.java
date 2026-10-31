/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「闪蜂推广管理后台」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.util;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * ProviderKeyCipher 三态判定与向后兼容回归。
 *
 * <p>背景（2026-10-31 事故）：加密密钥回退复用 JWT_SECRET，轮换签名密钥后所有供应商密文解不开，
 * 而管理页只表现为「未配置」——看不出是密钥换过还是从没配过，管理员反复重填也定位不到根因。
 * 本文件钉住两件事：
 * <ol>
 *   <li>换密钥后必须判 STALE（而不是 UNSET），让上层能报「密钥已失效，需重填」；</li>
 *   <li>历史无指纹密文与更早的明文存储仍可取用，格式升级不得破坏存量数据。</li>
 * </ol>
 */
class ProviderKeyCipherTest {

    private static final String V1_PREFIX = "enc:v1:";

    /** 手工装配（不经 Spring 上下文）：jwtSecret 故意与加密材料不同，避免污染「复用签名密钥」告警分支。 */
    private static ProviderKeyCipher cipher(String cryptoKey) throws Exception {
        ProviderKeyCipher c = new ProviderKeyCipher();
        ReflectionTestUtils.setField(c, "keyMaterial", cryptoKey);
        ReflectionTestUtils.setField(c, "jwtSecret", "unrelated-jwt-secret");
        c.init();
        return c;
    }

    /** 从新格式密文里取出密钥指纹段，供构造「同指纹但载荷损坏」的用例。 */
    private static String keyIdOf(String encrypted) {
        return encrypted.substring(V1_PREFIX.length(), encrypted.indexOf(':', V1_PREFIX.length()));
    }

    @Test
    @DisplayName("新密文自带密钥指纹，且可原样解回明文")
    void roundTripCarriesKeyIdFingerprint() throws Exception {
        ProviderKeyCipher c = cipher("crypto-key-A");
        String stored = c.encrypt("sk-abcdefghijklmnopqrstuvwxyz");

        assertTrue(stored.startsWith(V1_PREFIX), "当前写入格式必须带指纹，才能区分换密钥与数据损坏");
        assertEquals(ProviderKeyCipher.Outcome.OK, c.inspect(stored));
        assertEquals("sk-abcdefghijklmnopqrstuvwxyz", c.decrypt(stored));
    }

    @Test
    @DisplayName("换加密密钥后判 STALE，而不是 UNSET")
    void otherKeyIsStaleNotUnset() throws Exception {
        String stored = cipher("crypto-key-A").encrypt("sk-abcdefghijklmnopqrstuvwxyz");
        ProviderKeyCipher rotated = cipher("crypto-key-B");

        // 旧口径只回 null，上层据此显示「未配置」；STALE 才能表达「配过但解不开」
        assertEquals(ProviderKeyCipher.Outcome.STALE, rotated.inspect(stored));
        assertNull(rotated.decrypt(stored));
    }

    @Test
    @DisplayName("历史无指纹密文仍可解密，换密钥同样判 STALE")
    void legacyCipherTextWithoutFingerprintStillWorks() throws Exception {
        ProviderKeyCipher legacyWriter = cipher("crypto-key-A");
        String v1 = legacyWriter.encrypt("sk-abcdefghijklmnopqrstuvwxyz");
        String legacyStored = "enc:" + v1.substring(v1.indexOf(':', V1_PREFIX.length()) + 1);

        assertEquals(ProviderKeyCipher.Outcome.OK, legacyWriter.inspect(legacyStored));
        assertEquals("sk-abcdefghijklmnopqrstuvwxyz", legacyWriter.decrypt(legacyStored));
        assertEquals(ProviderKeyCipher.Outcome.STALE, cipher("crypto-key-B").inspect(legacyStored));
    }

    /** 加密改造之前 api_key 是明文入库的，判成 STALE 会让本来能用的通道被误关。 */
    @Test
    @DisplayName("历史明文存储原样取用，判 OK")
    void legacyPlaintextIsStillUsable() throws Exception {
        ProviderKeyCipher c = cipher("crypto-key-A");

        assertEquals(ProviderKeyCipher.Outcome.OK, c.inspect("sk-plain-old-value"));
        assertEquals("sk-plain-old-value", c.decrypt("sk-plain-old-value"));
    }

    @Test
    @DisplayName("NULL 与空串同判 UNSET；空值不加密")
    void blankValueIsUnset() throws Exception {
        ProviderKeyCipher c = cipher("crypto-key-A");

        assertEquals(ProviderKeyCipher.Outcome.UNSET, c.inspect(null));
        assertEquals(ProviderKeyCipher.Outcome.UNSET, c.inspect("   "));
        assertNull(c.decrypt(null));
        assertNull(c.encrypt(null));
        assertEquals("", c.encrypt(""));
    }

    /** 载荷被截断/写坏时不能抛异常——列表页一次读全表，任何一行坏都不能让整张表 500。 */
    @Test
    @DisplayName("指纹匹配但载荷损坏：判 STALE 且不抛异常")
    void corruptPayloadWithMatchingKeyIsStale() throws Exception {
        ProviderKeyCipher c = cipher("crypto-key-A");
        String good = c.encrypt("sk-abcdefghijklmnopqrstuvwxyz");

        assertEquals(ProviderKeyCipher.Outcome.STALE, c.inspect(V1_PREFIX + keyIdOf(good) + ":not-base64!!!"));
        assertEquals(ProviderKeyCipher.Outcome.STALE, c.inspect(V1_PREFIX + keyIdOf(good)));
        assertEquals(ProviderKeyCipher.Outcome.STALE, c.inspect(V1_PREFIX + keyIdOf(good) + ":" + "AAAA"));
        assertNull(c.decrypt(V1_PREFIX + keyIdOf(good) + ":not-base64!!!"));
    }
}
