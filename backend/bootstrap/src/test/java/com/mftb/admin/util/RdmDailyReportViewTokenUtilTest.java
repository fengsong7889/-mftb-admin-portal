package com.mftb.admin.util;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

/**
 * 日報看板開放令牌單測（純邏輯，不觸庫）。
 *
 * <p>釘住三件事：簽名必須綁定範圍、篡改任何字段都驗不過、結構非法一律返回 null，
 * 讓調用方給同一句提示（不區分錯誤原因，避免用錯誤響應枚舉有效令牌）。
 */
class RdmDailyReportViewTokenUtilTest {

    private static final String SECRET = "rdm-daily-view:test-secret";
    private static final LocalDate DAY = LocalDate.of(2026, 10, 20);
    private static final long ISSUED = 1_760_000_000_000L;
    private static final long EXPIRE = ISSUED + 30L * 24 * 60 * 60 * 1000;

    @Test
    @DisplayName("生成后解析：日期/档位/项目/迭代/签发与到期原样还原")
    void roundTrip() {
        String token = RdmDailyReportViewTokenUtil.generate(DAY, "morning", 12L, "SP202610001", ISSUED, EXPIRE, SECRET);
        RdmDailyReportViewTokenUtil.Token parsed = RdmDailyReportViewTokenUtil.parse(token, SECRET);
        assertNotNull(parsed);
        assertEquals(DAY, parsed.reportDate());
        assertEquals("morning", parsed.reportType());
        assertEquals(12L, parsed.projectId());
        assertEquals("SP202610001", parsed.iterationCode());
        assertEquals(ISSUED, parsed.issuedAt());
        assertEquals(EXPIRE, parsed.expireAt());
    }

    @Test
    @DisplayName("空项目/空迭代是合法语义（规则只按未挂项目迭代收敛）")
    void allowsEmptyScope() {
        String token = RdmDailyReportViewTokenUtil.generate(DAY, "manual", null, null, ISSUED, EXPIRE, SECRET);
        RdmDailyReportViewTokenUtil.Token parsed = RdmDailyReportViewTokenUtil.parse(token, SECRET);
        assertNotNull(parsed);
        assertNull(parsed.projectId());
        assertNull(parsed.iterationCode());
    }

    @Test
    @DisplayName("多项目/全部项目：scopeKey 随令牌签名，公开页靠它精确命中快照")
    void carriesScopeKey() {
        String token = RdmDailyReportViewTokenUtil.generate(DAY, "morning", null, null,
                ISSUED, EXPIRE, "rule:12", SECRET);
        RdmDailyReportViewTokenUtil.Token parsed = RdmDailyReportViewTokenUtil.parse(token, SECRET);
        assertNotNull(parsed);
        assertEquals("rule:12", parsed.scopeKey());
        assertNull(parsed.projectId());
    }

    @Test
    @DisplayName("篡改载荷后签名不匹配：拒绝（不能把链接改成别的项目/日期）")
    void rejectsTamperedPayload() {
        String token = RdmDailyReportViewTokenUtil.generate(DAY, "morning", 12L, null, ISSUED, EXPIRE, SECRET);
        String payload = token.substring(0, token.indexOf('.'));
        String signature = token.substring(token.indexOf('.') + 1);
        String otherPayload = RdmDailyReportViewTokenUtil
                .generate(DAY, "morning", 13L, null, ISSUED, EXPIRE, SECRET);
        String forged = otherPayload.substring(0, otherPayload.indexOf('.')) + "." + signature;
        assertNull(RdmDailyReportViewTokenUtil.parse(forged, SECRET), "换了项目ID但沿用旧签名必须拒绝");
    }

    @Test
    @DisplayName("换密钥即失效：域隔离后不同用途的令牌不能互借")
    void rejectsWrongSecret() {
        String token = RdmDailyReportViewTokenUtil.generate(DAY, "morning", 12L, null, ISSUED, EXPIRE, SECRET);
        assertNull(RdmDailyReportViewTokenUtil.parse(token, "rdm-daily-view:another-secret"));
    }

    @Test
    @DisplayName("结构非法（空/缺段/非数字/日期错/到期不晚于签发）一律 null")
    void rejectsMalformedTokens() {
        assertNull(RdmDailyReportViewTokenUtil.parse(null, SECRET));
        assertNull(RdmDailyReportViewTokenUtil.parse("", SECRET));
        assertNull(RdmDailyReportViewTokenUtil.parse("only-one-segment", SECRET));
        assertNull(RdmDailyReportViewTokenUtil.parse("a.b.c", SECRET));
        String badRange = RdmDailyReportViewTokenUtil.generate(DAY, "morning", 1L, null, EXPIRE, ISSUED, SECRET);
        assertNull(RdmDailyReportViewTokenUtil.parse(badRange, SECRET), "到期早于签发视为非法");
    }
}
