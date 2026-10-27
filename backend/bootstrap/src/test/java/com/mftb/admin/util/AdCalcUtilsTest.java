package com.mftb.admin.util;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * AdCalcUtils 单元测试（梯度折扣匹配为广告计价核心逻辑）
 */
class AdCalcUtilsTest {

    private static final String TIERS =
            "[{\"minDays\":7,\"discount\":90},{\"minDays\":3,\"discount\":95},{\"minDays\":1,\"discount\":98}]";

    @Test
    @DisplayName("matchDiscountTier: 按阈值降序匹配最大满足梯度")
    void matchDiscountTier_descending() {
        assertThat(AdCalcUtils.matchDiscountTier(TIERS, "minDays", 10)).isEqualByComparingTo("90");
        assertThat(AdCalcUtils.matchDiscountTier(TIERS, "minDays", 7)).isEqualByComparingTo("90");
        assertThat(AdCalcUtils.matchDiscountTier(TIERS, "minDays", 5)).isEqualByComparingTo("95");
        assertThat(AdCalcUtils.matchDiscountTier(TIERS, "minDays", 1)).isEqualByComparingTo("98");
    }

    @Test
    @DisplayName("matchDiscountTier: 无匹配/非法 JSON/空列表返回 100")
    void matchDiscountTier_noMatch() {
        assertThat(AdCalcUtils.matchDiscountTier(TIERS, "minDays", 0)).isEqualByComparingTo("100");
        assertThat(AdCalcUtils.matchDiscountTier("invalid", "minDays", 5)).isEqualByComparingTo("100");
        assertThat(AdCalcUtils.matchDiscountTier(null, "minDays", 5)).isEqualByComparingTo("100");
    }

    @Test
    @DisplayName("matchDiscountTier: 梯度乱序时仍按阈值降序匹配")
    void matchDiscountTier_unorderedInput() {
        String unordered = "[{\"minDays\":1,\"discount\":98},{\"minDays\":7,\"discount\":90}]";
        assertThat(AdCalcUtils.matchDiscountTier(unordered, "minDays", 7)).isEqualByComparingTo("90");
    }

    @Test
    @DisplayName("matchDiscountTier: discount 非法(<=0)时跳过该梯度")
    void matchDiscountTier_invalidDiscount() {
        String tiers = "[{\"minDays\":1,\"discount\":0},{\"minDays\":2,\"discount\":95}]";
        assertThat(AdCalcUtils.matchDiscountTier(tiers, "minDays", 1)).isEqualByComparingTo("100");
        assertThat(AdCalcUtils.matchDiscountTier(tiers, "minDays", 2)).isEqualByComparingTo("95");
    }

    @Test
    @DisplayName("intOf/decimalOf: 类型安全读取")
    void numericReaders() {
        Map<String, Object> map = new HashMap<>();
        map.put("n", 42);
        map.put("d", 3.14);
        map.put("s", "text");

        assertThat(AdCalcUtils.intOf(map, "n")).isEqualTo(42);
        assertThat(AdCalcUtils.intOf(map, "missing")).isZero();
        assertThat(AdCalcUtils.intOf(map, "s")).isZero();
        assertThat(AdCalcUtils.decimalOf(map, "d")).isEqualByComparingTo("3.14");
        assertThat(AdCalcUtils.decimalOf(map, "s")).isNull();
    }

    @Test
    @DisplayName("round2: 四舍五入保留两位")
    void round2() {
        assertThat(AdCalcUtils.round2(new BigDecimal("1.005"))).isEqualByComparingTo("1.01");
        assertThat(AdCalcUtils.round2(new BigDecimal("2.344"))).isEqualByComparingTo("2.34");
    }
}
