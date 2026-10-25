package com.mftb.admin.service.impl;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.entity.PayrollRuleSet;
import com.mftb.admin.entity.PayrollTaxBracket;
import com.mftb.admin.mapper.PayrollRuleSetMapper;
import com.mftb.admin.mapper.PayrollTaxBracketMapper;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 薪酬規則的拒絕性與算稅用例（D3 第一批）。
 * 這裡的每個失敗用例都對應一種"會把工資算錯"的配置：缺規則、級距有斷檔、
 * 同城多套規則同時生效。系統刻意不提供默認費率，缺配置必須報錯而不是猜。
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class PayrollRuleGuardTest {

    @Mock private PayrollRuleSetMapper ruleSetMapper;
    @Mock private PayrollTaxBracketMapper bracketMapper;
    @Mock private OperatorResolver operatorResolver;

    private PayrollRuleServiceImpl service;

    @BeforeEach
    void setUp() {
        service = new PayrollRuleServiceImpl(ruleSetMapper, bracketMapper, operatorResolver);
        when(operatorResolver.currentOperatorAccount()).thenReturn("tester");
    }

    @Test
    @DisplayName("城市缺規則時拒絕試算，並明確提示需先配置（不提供默認費率）")
    void rejectsWhenNoRuleSetForCity() {
        when(ruleSetMapper.selectList(any())).thenReturn(List.of());

        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.resolveRuleSet("4403", LocalDate.of(2026, 10, 1)));
        assertEquals("城市 4403 在 2026-10-01 沒有生效的薪酬規則集，請先在薪酬規則中配置（系統不提供默認費率）",
                ex.getMessage());
    }

    @Test
    @DisplayName("同城同日多套規則同時生效時拒絕（不挑一個看起來對的算）")
    void rejectsAmbiguousRuleSets() {
        PayrollRuleSet a = ruleSet(); a.setId(1L);
        PayrollRuleSet b = ruleSet(); b.setId(2L);
        when(ruleSetMapper.selectList(any())).thenReturn(List.of(a, b));

        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.resolveRuleSet("4403", LocalDate.of(2026, 10, 1)));
        assertEquals("城市 4403 在 2026-10-01 有 2 套規則集同時生效，請先收斂為一套", ex.getMessage());
    }

    @Test
    @DisplayName("級距中間有斷檔時拒絕（漏檔會讓部分所得無人徵稅）")
    void rejectsBracketGap() {
        when(ruleSetMapper.selectById(1L)).thenReturn(ruleSet());
        List<PayrollTaxBracket> brackets = List.of(
                bracket("0", "3000", "0.0300", "0"),
                bracket("5000", null, "0.1000", "210"));

        BusinessException ex = assertThrows(BusinessException.class, () -> service.saveBrackets(1L, brackets));
        assertEquals("第 2 檔下限必須等於上一檔上限（3000），不允許有空檔或重疊", ex.getMessage());
        verify(bracketMapper, never()).insert(any(PayrollTaxBracket.class));
    }

    @Test
    @DisplayName("最高檔必須無上限，否則超出部分無人徵稅")
    void rejectsBoundedTopBracket() {
        when(ruleSetMapper.selectById(1L)).thenReturn(ruleSet());
        List<PayrollTaxBracket> brackets = List.of(bracket("0", "3000", "0.0300", "0"));

        BusinessException ex = assertThrows(BusinessException.class, () -> service.saveBrackets(1L, brackets));
        assertEquals("最高檔上限必須留空（表示無上限），否則超出的部分無人徵稅", ex.getMessage());
    }

    @Test
    @DisplayName("稅率寫成百分數（如 10）時拒絕")
    void rejectsPercentRate() {
        when(ruleSetMapper.selectById(1L)).thenReturn(ruleSet());
        List<PayrollTaxBracket> brackets = List.of(bracket("0", null, "10", "0"));

        BusinessException ex = assertThrows(BusinessException.class, () -> service.saveBrackets(1L, brackets));
        assertEquals("第 1 檔稅率必須在 0~1 之間（10% 填 0.10）", ex.getMessage());
    }

    @Test
    @DisplayName("未配置級距時算稅直接拒絕")
    void rejectsTaxWhenNoBrackets() {
        when(ruleSetMapper.selectById(1L)).thenReturn(ruleSet());
        when(bracketMapper.selectList(any())).thenReturn(List.of());

        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.monthlyTax(ruleSet(), new BigDecimal("20000")));
        assertEquals("規則集「深圳 2026」尚未配置個稅級距，無法試算", ex.getMessage());
    }

    @Test
    @DisplayName("超額累進算稅：20000 應稅收入、5000 減除費用 → 15000 落入 20% 檔，稅 1590.00")
    void computesProgressiveTax() {
        when(ruleSetMapper.selectById(1L)).thenReturn(ruleSet());
        when(bracketMapper.selectList(any())).thenReturn(List.of(
                bracket("0", "3000", "0.0300", "0"),
                bracket("3000", "12000", "0.1000", "210"),
                bracket("12000", null, "0.2000", "1410")));

        BigDecimal tax = service.monthlyTax(ruleSet(), new BigDecimal("20000.00"));

        assertEquals(new BigDecimal("1590.00"), tax);
    }

    @Test
    @DisplayName("應稅收入低於減除費用時稅額為 0（不產生負數稅）")
    void taxIsZeroBelowDeduction() {
        when(ruleSetMapper.selectById(1L)).thenReturn(ruleSet());
        when(bracketMapper.selectList(any())).thenReturn(List.of(bracket("0", null, "0.0300", "0")));

        assertEquals(new BigDecimal("0.00"), service.monthlyTax(ruleSet(), new BigDecimal("4000.00")));
    }

    private PayrollRuleSet ruleSet() {
        PayrollRuleSet set = new PayrollRuleSet();
        set.setId(1L);
        set.setName("深圳 2026");
        set.setCityCode("4403");
        set.setBasicDeduction(new BigDecimal("5000.0000"));
        set.setStatus(1);
        set.setEffectiveFrom(LocalDate.of(2026, 1, 1));
        return set;
    }

    private PayrollTaxBracket bracket(String lower, String upper, String rate, String quick) {
        PayrollTaxBracket bracket = new PayrollTaxBracket();
        bracket.setLowerBound(new BigDecimal(lower));
        bracket.setUpperBound(upper == null ? null : new BigDecimal(upper));
        bracket.setRate(new BigDecimal(rate));
        bracket.setQuickDeduction(new BigDecimal(quick));
        return bracket;
    }
}
