package com.mftb.admin.service;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.OrganicScoreRuleRequest;
import com.mftb.admin.service.impl.OrganicScoreServiceImpl;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 自然流量计分规则请求的服务端校验单测。
 * <p>
 * 只测 validateRuleRequest（纯入参裁决，不碰 mapper，因此依赖传 null），
 * 重点盯住「加分规则分值不得为负」这条新边界：前端 0~200 只是 UX，负值一旦被保存，
 * 计分侧会把 mode=1（命中即加分）的配置读成扣分，与界面「固定加分」标签互相矛盾。
 */
class OrganicScoreRuleValidationTest {

    /** validateRuleRequest 不访问任何依赖，传 null 即可隔离单测 */
    private final OrganicScoreServiceImpl service = new OrganicScoreServiceImpl(null, null, null);

    private OrganicScoreRuleRequest request(Integer mode, Integer score) {
        OrganicScoreRuleRequest req = new OrganicScoreRuleRequest();
        req.setDimension(2);
        req.setName("自動接單");
        req.setDescription("商家在店端開啟自動接單即得固定加分");
        req.setMode(mode);
        req.setScore(score);
        req.setStatus(1);
        return req;
    }

    private void validate(OrganicScoreRuleRequest req) {
        ReflectionTestUtils.invokeMethod(service, "validateRuleRequest", req);
    }

    @Test
    void rejectsNegativeScoreForBonusMode() {
        BusinessException ex = assertThrows(BusinessException.class, () -> validate(request(1, -50)));
        assertTrue(ex.getMessage().contains("不得為負"), ex.getMessage());
    }

    @Test
    void acceptsZeroAndPositiveScoreForBonusMode() {
        assertDoesNotThrow(() -> validate(request(1, 0)));
        assertDoesNotThrow(() -> validate(request(1, 50)));
        // score 未填按未配置处理（createRule 会补 0），不得因为新加的符号校验而报错
        assertDoesNotThrow(() -> validate(request(1, null)));
    }

    @Test
    void keepsLegacySignFreedomForOtherModes() {
        // 3=規則減分 / 5=梯度計分等口径的分值符号由各自面板决定，本条只收紧加分模式
        assertDoesNotThrow(() -> validate(request(3, -80)));
        assertDoesNotThrow(() -> validate(request(5, -10)));
        assertDoesNotThrow(() -> validate(request(6, -30)));
    }

    @Test
    void stillRejectsOutOfRangeDimensionModeStatus() {
        OrganicScoreRuleRequest badDimension = request(1, 50);
        badDimension.setDimension(3);
        assertThrows(BusinessException.class, () -> validate(badDimension));

        OrganicScoreRuleRequest badMode = request(99, 50);
        assertThrows(BusinessException.class, () -> validate(badMode));

        OrganicScoreRuleRequest badStatus = request(1, 50);
        badStatus.setStatus(5);
        assertThrows(BusinessException.class, () -> validate(badStatus));
    }

    @Test
    void rejectsNegativeMaxScoreOrNonPositiveCoefficientForDecayMode() {
        // mode=2（衰減函數）通用邊界：滿分不得為負、係數配置時必須為正；按 mode 裁決不按 rule_code 特判
        BusinessException negativeScore = assertThrows(BusinessException.class, () -> validate(request(2, -10)));
        assertTrue(negativeScore.getMessage().contains("滿分不得為負"), negativeScore.getMessage());

        OrganicScoreRuleRequest zeroCoeff = request(2, 100);
        zeroCoeff.setDecayCoefficient(BigDecimal.ZERO);
        BusinessException zeroEx = assertThrows(BusinessException.class, () -> validate(zeroCoeff));
        assertTrue(zeroEx.getMessage().contains("衰減係數必須為正"), zeroEx.getMessage());

        OrganicScoreRuleRequest negativeCoeff = request(2, 100);
        negativeCoeff.setDecayCoefficient(new BigDecimal("-0.5"));
        assertThrows(BusinessException.class, () -> validate(negativeCoeff));
    }

    @Test
    void acceptsValidDecayAndKeepsNullOptionalFields() {
        OrganicScoreRuleRequest ok = request(2, 100);
        ok.setDecayCoefficient(new BigDecimal("5"));
        assertDoesNotThrow(() -> validate(ok));
        // 可選字段 null 不拦（沿用 createRule 補默認語義）；滿分 0 合法（該時段不給分）
        assertDoesNotThrow(() -> validate(request(2, null)));
        assertDoesNotThrow(() -> validate(request(2, 0)));
    }
}
