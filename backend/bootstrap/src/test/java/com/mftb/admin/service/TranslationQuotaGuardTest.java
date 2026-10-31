package com.mftb.admin.service;

/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「闪蜂推广管理后台」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.mapper.SysLanguageMapper;
import com.mftb.admin.mapper.SysTranslationMapper;
import com.mftb.admin.service.impl.TranslationServiceImpl;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;

/**
 * MyMemory 机翻额度口径与超额响应识别测试。
 * <p>
 * 钉住两条很容易被「改默认值」类变更静默击中的口径：
 * <ol>
 *   <li><b>额度上限必须与实际身份一致</b>：匿名 5000 字符/天，配置 {@code MYMEMORY_EMAIL} 才提升至
 *       50000。若本地常量固定按 50000 自我评估，未配置 email 的部署会以为还有额度而持续外呼；</li>
 *   <li><b>超额响应不是 HTTP 错误</b>：MyMemory 以 200 + responseStatus=200 返回，把警告文案塞进
 *       {@code responseData.translatedText}。不识别就会把警告当译文返回，进而写进 sys_translation，
 *       属静默数据污染 —— 比直接报错更难发现。</li>
 * </ol>
 * 两个方法都是私有实现细节，这里按本项目既有做法用 {@link ReflectionTestUtils} 直接调用，
 * 不为此扩大类的公开 API。
 */
class TranslationQuotaGuardTest {

    /** 构造被测服务：只关心额度判定，DB/Mapper 全部给 mock */
    private TranslationServiceImpl service(String email) {
        TranslationServiceImpl s = new TranslationServiceImpl(
                mock(SysTranslationMapper.class),
                mock(SysLanguageMapper.class),
                mock(OperatorResolver.class),
                new ObjectMapper());
        ReflectionTestUtils.setField(s, "myMemoryEmail", email);
        return s;
    }

    private int dailyLimitOf(TranslationServiceImpl s) {
        Integer limit = ReflectionTestUtils.invokeMethod(s, "effectiveDailyCharLimit");
        assertNotNullValue(limit);
        return limit;
    }

    private boolean isQuotaWarning(TranslationServiceImpl s, String text) {
        Boolean hit = ReflectionTestUtils.invokeMethod(s, "looksLikeQuotaWarning", text);
        assertNotNullValue(hit);
        return hit;
    }

    private static void assertNotNullValue(Object value) {
        if (value == null) {
            throw new AssertionError("被测方法返回 null，说明方法名或签名已漂移");
        }
    }

    @Test
    @DisplayName("未配置 MYMEMORY_EMAIL 时按匿名额度 5000 自我评估")
    void anonymousQuotaIsFiveThousand() {
        assertEquals(5000, dailyLimitOf(service("")));
        assertEquals(5000, dailyLimitOf(service(null)), "null 与空串同口径：都视为未配置");
        assertEquals(5000, dailyLimitOf(service("   ")), "纯空白不应被当成已配置");
    }

    @Test
    @DisplayName("配置 MYMEMORY_EMAIL 后额度提升到 50000")
    void emailLiftsQuotaToFiftyThousand() {
        assertEquals(50000, dailyLimitOf(service("ops@example.com")));
        assertEquals(50000, dailyLimitOf(service("  ops@example.com  ")), "前后空白不影响判定");
    }

    @Test
    @DisplayName("服务端以 200 返回的额度警告必须被识别（大小写不敏感）")
    void detectsQuotaWarningText() {
        TranslationServiceImpl s = service("");
        assertTrue(isQuotaWarning(s, "MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY."));
        assertTrue(isQuotaWarning(s, "mymemory warning: you used all available free translations for today"),
                "大小写混排也要命中，否则警告会被当成正常译文入库");
        assertTrue(isQuotaWarning(s, "QUOTA EXCEEDED"));
        assertTrue(isQuotaWarning(s, "Prefix text ... MyMemory Warning ... suffix"),
                "警告短语嵌在长句中间同样要命中");
    }

    @Test
    @DisplayName("正常译文不得被误杀：相近字样不等于额度警告")
    void ordinaryTextsAreNotFlagged() {
        TranslationServiceImpl s = service("");
        assertFalse(isQuotaWarning(s, "免費翻譯配額已使用完"), "中文含「配额」不应被误判");
        assertFalse(isQuotaWarning(s, "Quota management module"), "业务文案里的 quota 不是警告");
        assertFalse(isQuotaWarning(s, "Today"), "普通词不应被误判");
        assertFalse(isQuotaWarning(s, ""), "空串按无译文处理，不是警告");
        assertFalse(isQuotaWarning(s, null), "null 不应抛异常");
    }
}
