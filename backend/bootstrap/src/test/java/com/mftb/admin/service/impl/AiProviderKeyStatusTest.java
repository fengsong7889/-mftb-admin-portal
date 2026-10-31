/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「闪蜂推广管理后台」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.mftb.admin.dto.AiProviderDTO;
import com.mftb.admin.entity.AiProvider;
import com.mftb.admin.mapper.AiProviderMapper;
import com.mftb.admin.util.ProviderKeyCipher;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/**
 * 供应商列表 API Key 三态映射回归。
 *
 * <p>背景（2026-10-31 事故）：轮换 JWT_SECRET 后已入库的供应商密文全部解不开，
 * 列表页却显示「未配置」，管理员据此以为没保存成功。本测试钉住「从未配置 / 已配置 /
 * 密钥已失效」三态必须由服务端实算并各自回不同的 apiKeyStatus，且失效行不得回脱敏串。
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class AiProviderKeyStatusTest {

    private static final String PLAIN_KEY = "sk-abcdefghijklmnopqrstuvwxyz";

    @Mock private AiProviderMapper providerMapper;

    /**
     * LambdaQueryWrapper 解析「方法引用 → 列名」依赖 MyBatis-Plus 的 TableInfo 缓存，
     * 没有 Spring 容器时该缓存是空的，list() 里的 orderByAsc 会抛
     * 「can not find lambda cache for this entity」。按仓库既有做法手动初始化。
     */
    @BeforeAll
    static void initTableInfo() {
        TableInfoHelper.initTableInfo(
                new MapperBuilderAssistant(new MybatisConfiguration(), ""), AiProvider.class);
    }

    private static ProviderKeyCipher cipher(String cryptoKey) throws Exception {
        ProviderKeyCipher c = new ProviderKeyCipher();
        ReflectionTestUtils.setField(c, "keyMaterial", cryptoKey);
        ReflectionTestUtils.setField(c, "jwtSecret", "unrelated-jwt-secret");
        c.init();
        return c;
    }

    private static AiProvider provider(Long id, String storedKey) {
        AiProvider p = new AiProvider();
        p.setId(id);
        p.setProviderKey("dashscope");
        p.setName("阿里云百炼");
        p.setApiKey(storedKey);
        p.setStatus(1);
        return p;
    }

    @Test
    @DisplayName("列表回三态：未配置=0 / 已配置=1 / 密钥已失效=2，且失效行不带脱敏串")
    void listMapsThreeKeyStates() throws Exception {
        ProviderKeyCipher current = cipher("unit-crypto-A");
        String usable = current.encrypt(PLAIN_KEY);
        // 模拟「上一把加密密钥写入的密文」：JWT_SECRET 或 AI_PROVIDER_CRYPTO_KEY 轮换后就长这样
        String stale = cipher("unit-crypto-B").encrypt(PLAIN_KEY);
        when(providerMapper.selectList(any())).thenReturn(List.of(
                provider(1L, null), provider(2L, usable), provider(3L, stale)));

        List<AiProviderDTO.ProviderVO> vos = new AiProviderServiceImpl(providerMapper, current).list(null, null, null);

        assertEquals(AiProviderDTO.API_KEY_UNSET, vos.get(0).getApiKeyStatus().intValue());
        assertEquals("", vos.get(0).getApiKeyMasked());

        assertEquals(AiProviderDTO.API_KEY_OK, vos.get(1).getApiKeyStatus().intValue());
        assertEquals("sk-a****wxyz", vos.get(1).getApiKeyMasked());

        assertEquals(AiProviderDTO.API_KEY_STALE, vos.get(2).getApiKeyStatus().intValue());
        assertEquals("", vos.get(2).getApiKeyMasked());
    }

    /** 加密改造前 api_key 是明文入库的，这类存量必须继续算「已配置」，否则升级会把可用通道判死。 */
    @Test
    @DisplayName("历史明文存储仍判已配置")
    void legacyPlaintextStillCountsAsConfigured() throws Exception {
        when(providerMapper.selectList(any())).thenReturn(List.of(provider(1L, PLAIN_KEY)));

        List<AiProviderDTO.ProviderVO> vos = new AiProviderServiceImpl(providerMapper, cipher("unit-crypto-A"))
                .list(null, null, null);

        assertEquals(AiProviderDTO.API_KEY_OK, vos.get(0).getApiKeyStatus().intValue());
        assertEquals("sk-a****wxyz", vos.get(0).getApiKeyMasked());
    }
}
