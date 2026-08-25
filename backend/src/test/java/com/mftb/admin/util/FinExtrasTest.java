package com.mftb.admin.util;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * FinExtras 单元测试（财务 extra 扩展数据读取）
 */
class FinExtrasTest {

    @Test
    @DisplayName("text: 缺失/空白返回 null，正常值去除首尾空格")
    void text() {
        Map<String, Object> extra = new HashMap<>();
        extra.put("name", "  test  ");
        extra.put("blank", "   ");

        assertThat(FinExtras.text(extra, "name")).isEqualTo("test");
        assertThat(FinExtras.text(extra, "blank")).isNull();
        assertThat(FinExtras.text(extra, "missing")).isNull();
        assertThat(FinExtras.text(null, "name")).isNull();
    }

    @Test
    @DisplayName("textOrDash: 缺失返回占位符 --")
    void textOrDash() {
        assertThat(FinExtras.textOrDash(new HashMap<>(), "x")).isEqualTo("--");
    }

    @Test
    @DisplayName("amount: 合法金额解析，非法/缺失返回 0")
    void amount() {
        Map<String, Object> extra = Map.of("ok", "123.45", "bad", "abc");
        assertThat(FinExtras.amount(extra, "ok")).isEqualByComparingTo("123.45");
        assertThat(FinExtras.amount(extra, "bad")).isEqualByComparingTo(BigDecimal.ZERO);
        assertThat(FinExtras.amount(extra, "missing")).isEqualByComparingTo(BigDecimal.ZERO);
    }

    @Test
    @DisplayName("flag: Boolean 与字符串均可解析")
    void flag() {
        Map<String, Object> extra = new HashMap<>();
        extra.put("b1", Boolean.TRUE);
        extra.put("b2", "true");
        extra.put("b3", "false");

        assertThat(FinExtras.flag(extra, "b1")).isTrue();
        assertThat(FinExtras.flag(extra, "b2")).isTrue();
        assertThat(FinExtras.flag(extra, "b3")).isFalse();
        assertThat(FinExtras.flag(extra, "missing")).isFalse();
    }

    @Test
    @DisplayName("storeIdOf/storeNameOf: 从门店文案提取 ID 与名称")
    void storeLabelParsing() {
        assertThat(FinExtras.storeIdOf("廣州酒家(123456789)")).isEqualTo("123456789");
        assertThat(FinExtras.storeIdOf("珠海前山分店(MD00007)")).isEqualTo("MD00007");
        assertThat(FinExtras.storeIdOf("无ID门店")).isEqualTo("--");
        assertThat(FinExtras.storeIdOf(null)).isEqualTo("--");

        assertThat(FinExtras.storeNameOf("廣州酒家(123456789)")).isEqualTo("廣州酒家");
        assertThat(FinExtras.storeNameOf(null)).isEqualTo("--");
    }

    @Test
    @DisplayName("storeId: 优先取 storeId 字段，回退从 storeLabel 解析")
    void storeIdFromRow() {
        Map<String, Object> row1 = Map.of("storeId", "S001", "storeLabel", "门店(999)");
        Map<String, Object> row2 = Map.of("storeLabel", "门店(999)");

        assertThat(FinExtras.storeId(row1)).isEqualTo("S001");
        assertThat(FinExtras.storeId(row2)).isEqualTo("999");
    }

    @Test
    @DisplayName("rows: 过滤非 Map 元素，null 安全")
    void rows() {
        Map<String, Object> extra = new HashMap<>();
        extra.put("stores", List.of(Map.of("id", 1), "not-a-map"));

        assertThat(FinExtras.rows(extra, "stores")).hasSize(1);
        assertThat(FinExtras.rows(extra, "missing")).isEmpty();
        assertThat(FinExtras.rows(null, "stores")).isEmpty();
    }

    @Test
    @DisplayName("round2/nonNull/intOf/decimalOf: 数值工具方法")
    void numericHelpers() {
        assertThat(FinExtras.round2(new BigDecimal("1.005"))).isEqualByComparingTo("1.01");
        assertThat(FinExtras.round2(null)).isNull();
        assertThat(FinExtras.nonNull(null)).isEqualByComparingTo(BigDecimal.ZERO);

        Map<String, Object> map = Map.of("n", 5, "d", "3.14");
        assertThat(FinExtras.intOf(map, "n")).isEqualTo(5);
        assertThat(FinExtras.intOf(map, "missing")).isEqualTo(Integer.MAX_VALUE);
        assertThat(FinExtras.decimalOf(map, "missing")).isNull();
    }
}
