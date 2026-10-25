package com.mftb.admin.service.impl;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.entity.HrEmployment;
import com.mftb.admin.entity.PayrollComponent;
import com.mftb.admin.entity.PayrollSalaryStandard;
import com.mftb.admin.mapper.HrEmploymentMapper;
import com.mftb.admin.mapper.PayrollComponentMapper;
import com.mftb.admin.mapper.PayrollSalaryStandardMapper;
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
 * 薪酬基础的拒绝性用例（D2）。
 * 这些口径错一条，D3 的试算与工资单就会给出无法解释的数：
 * 项目类型混入、金额为负、币种缺失、区间重叠、雇佣已终止。
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class PayrollGuardTest {

    @Mock private PayrollComponentMapper componentMapper;
    @Mock private PayrollSalaryStandardMapper standardMapper;
    @Mock private HrEmploymentMapper employmentMapper;
    @Mock private OperatorResolver operatorResolver;

    private PayrollServiceImpl service;

    @BeforeEach
    void setUp() {
        service = new PayrollServiceImpl(componentMapper, standardMapper, employmentMapper, operatorResolver);
        when(operatorResolver.currentOperatorAccount()).thenReturn("tester");
    }

    @Test
    @DisplayName("薪酬项目类型不在白名单时拒绝")
    void rejectsUnknownComponentType() {
        PayrollComponent component = new PayrollComponent();
        component.setCode("BONUS");
        component.setName("奖金");
        component.setComponentType("ALLOWANCE");

        BusinessException ex = assertThrows(BusinessException.class, () -> service.saveComponent(component));
        assertEquals("薪酬項目類型只能是 EARNING / DEDUCTION / EMPLOYER_COST", ex.getMessage());
        verify(componentMapper, never()).insert(any(PayrollComponent.class));
    }

    @Test
    @DisplayName("币种不在首期三地时拒绝")
    void rejectsUnknownCurrency() {
        PayrollComponent component = new PayrollComponent();
        component.setCode("BASE");
        component.setName("基本工资");
        component.setComponentType("EARNING");
        component.setCurrency("USD");

        BusinessException ex = assertThrows(BusinessException.class, () -> service.saveComponent(component));
        assertEquals("幣種只能是 CNY / HKD / MOP", ex.getMessage());
    }

    @Test
    @DisplayName("基本工资为负时拒绝")
    void rejectsNegativeAmount() {
        when(employmentMapper.selectById(1L)).thenReturn(activeEmployment());

        PayrollSalaryStandard standard = baseStandard();
        standard.setBaseAmount(new BigDecimal("-1"));

        BusinessException ex = assertThrows(BusinessException.class, () -> service.saveStandard(standard));
        assertEquals("基本工資不能為空或負數", ex.getMessage());
        verify(standardMapper, never()).insert(any(PayrollSalaryStandard.class));
    }

    @Test
    @DisplayName("雇佣已终止时不再允许维护薪酬标准")
    void rejectsTerminatedEmployment() {
        HrEmployment employment = activeEmployment();
        employment.setStatus(0);
        when(employmentMapper.selectById(1L)).thenReturn(employment);

        BusinessException ex = assertThrows(BusinessException.class, () -> service.saveStandard(baseStandard()));
        assertEquals("該雇傭已終止，不能再維護薪酬標準", ex.getMessage());
    }

    @Test
    @DisplayName("同一雇佣的薪酬标准区间重叠时拒绝（否则某月工资有两个候选值）")
    void rejectsOverlappingStandard() {
        when(employmentMapper.selectById(1L)).thenReturn(activeEmployment());
        PayrollSalaryStandard other = new PayrollSalaryStandard();
        other.setId(99L);
        other.setEffectiveFrom(LocalDate.of(2026, 1, 1));
        other.setEffectiveTo(LocalDate.of(2026, 12, 31));
        when(standardMapper.selectList(any())).thenReturn(List.of(other));

        PayrollSalaryStandard entity = baseStandard();
        entity.setEffectiveFrom(LocalDate.of(2026, 6, 1));
        entity.setEffectiveTo(LocalDate.of(2027, 5, 31));

        BusinessException ex = assertThrows(BusinessException.class, () -> service.saveStandard(entity));
        assertEquals("該雇傭的薪酬標準期間重疊，請先結束上一段標準（#99）", ex.getMessage());
        verify(standardMapper, never()).insert(any(PayrollSalaryStandard.class));
    }

    @Test
    @DisplayName("变更类型不在白名单时拒绝")
    void rejectsUnknownChangeType() {
        when(employmentMapper.selectById(1L)).thenReturn(activeEmployment());
        PayrollSalaryStandard entity = baseStandard();
        entity.setChangeType("MAGIC");

        BusinessException ex = assertThrows(BusinessException.class, () -> service.saveStandard(entity));
        assertEquals("變更類型只能是 HIRE / ADJUST / PROMOTION / ANNUAL", ex.getMessage());
    }

    private HrEmployment activeEmployment() {
        HrEmployment employment = new HrEmployment();
        employment.setId(1L);
        employment.setStatus(1);
        return employment;
    }

    private PayrollSalaryStandard baseStandard() {
        PayrollSalaryStandard standard = new PayrollSalaryStandard();
        standard.setEmploymentId(1L);
        standard.setBaseAmount(new BigDecimal("12000.0000"));
        standard.setCurrency("CNY");
        standard.setChangeType("HIRE");
        standard.setEffectiveFrom(LocalDate.of(2026, 10, 1));
        return standard;
    }
}
