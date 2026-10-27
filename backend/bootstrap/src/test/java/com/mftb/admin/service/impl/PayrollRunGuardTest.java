package com.mftb.admin.service.impl;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.entity.HrEmployment;
import com.mftb.admin.entity.PayrollBenefitPlan;
import com.mftb.admin.entity.PayrollEnrollment;
import com.mftb.admin.entity.PayrollPayslip;
import com.mftb.admin.entity.PayrollPayslipItem;
import com.mftb.admin.entity.PayrollRuleSet;
import com.mftb.admin.entity.PayrollRun;
import com.mftb.admin.entity.PayrollSalaryStandard;
import com.mftb.admin.mapper.HrEmploymentMapper;
import com.mftb.admin.mapper.PayrollBenefitPlanMapper;
import com.mftb.admin.mapper.PayrollEnrollmentMapper;
import com.mftb.admin.mapper.PayrollPayslipItemMapper;
import com.mftb.admin.mapper.PayrollPayslipMapper;
import com.mftb.admin.mapper.PayrollRuleSetMapper;
import com.mftb.admin.mapper.PayrollRunMapper;
import com.mftb.admin.mapper.PayrollSalaryStandardMapper;
import com.mftb.admin.mapper.PersonMapper;
import com.mftb.admin.service.PayrollRuleService;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 核算批次的拒绝性与试算结果用例（D3 第三批）。
 * 关注三类会把工资算错的情况：缺薪酬标准、锁定后重算、未试算先锁定。
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class PayrollRunGuardTest {

    @Mock private PayrollRunMapper runMapper;
    @Mock private PayrollPayslipMapper payslipMapper;
    @Mock private PayrollPayslipItemMapper itemMapper;
    @Mock private PayrollSalaryStandardMapper standardMapper;
    @Mock private PayrollEnrollmentMapper enrollmentMapper;
    @Mock private PayrollBenefitPlanMapper planMapper;
    @Mock private HrEmploymentMapper employmentMapper;
    @Mock private PersonMapper personMapper;
    @Mock private PayrollRuleSetMapper ruleSetMapper;
    @Mock private PayrollRuleService ruleService;
    @Mock private OperatorResolver operatorResolver;

    private PayrollRunServiceImpl service;

    @BeforeEach
    void setUp() {
        service = new PayrollRunServiceImpl(runMapper, payslipMapper, itemMapper, standardMapper,
                enrollmentMapper, planMapper, employmentMapper, personMapper, ruleService, operatorResolver);
        when(operatorResolver.currentOperatorAccount()).thenReturn("tester");
        when(ruleService.resolveRuleSet(anyString(), any())).thenReturn(ruleSet());
        when(ruleService.monthlyTax(any(), any())).thenReturn(new BigDecimal("300.00"));
    }

    @Test
    @DisplayName("工資月格式不合法時拒絕")
    void rejectsInvalidPeriod() {
        PayrollRun run = new PayrollRun();
        run.setPeriod("2026-13");
        run.setCityCode("4403");

        BusinessException ex = assertThrows(BusinessException.class, () -> service.createRun(run));
        assertEquals("工資月格式必須是 YYYY-MM", ex.getMessage());
        verify(runMapper, never()).insert(any(PayrollRun.class));
    }

    @Test
    @DisplayName("同城同月批次已存在時拒絕重複建立")
    void rejectsDuplicateRun() {
        when(runMapper.selectCount(any())).thenReturn(1L);
        PayrollRun run = new PayrollRun();
        run.setPeriod("2026-10");
        run.setCityCode("4403");

        BusinessException ex = assertThrows(BusinessException.class, () -> service.createRun(run));
        assertEquals("城市 4403 的 2026-10 批次已存在", ex.getMessage());
    }

    @Test
    @DisplayName("批次已鎖定時不能再試算")
    void rejectsCalculateWhenLocked() {
        PayrollRun run = run("LOCKED");
        when(runMapper.selectById(1L)).thenReturn(run);

        BusinessException ex = assertThrows(BusinessException.class, () -> service.calculate(1L));
        assertEquals("批次已鎖定，不能重新試算", ex.getMessage());
        verify(payslipMapper, never()).insert(any(PayrollPayslip.class));
    }

    @Test
    @DisplayName("有人缺薪酬標準時整批拒絕，並列出是哪個雇傭")
    void rejectsCalculateWhenStandardMissing() {
        when(runMapper.selectById(1L)).thenReturn(run("DRAFT"));
        when(employmentMapper.selectList(any())).thenReturn(List.of(employment()));
        when(standardMapper.selectList(any())).thenReturn(List.of());

        BusinessException ex = assertThrows(BusinessException.class, () -> service.calculate(1L));
        assertEquals("試算被拒絕：雇傭 E001 缺少 2026-10 生效的薪酬標準", ex.getMessage());
        verify(payslipMapper, never()).insert(any(PayrollPayslip.class));
    }

    @Test
    @DisplayName("未試算先鎖定時拒絕")
    void rejectsLockBeforeCalculate() {
        when(runMapper.selectById(1L)).thenReturn(run("DRAFT"));

        BusinessException ex = assertThrows(BusinessException.class, () -> service.lock(1L));
        assertEquals("請先完成試算再鎖定", ex.getMessage());
    }

    @Test
    @DisplayName("試算產出工資單：應發-個人社保-個稅=實發，雇主成本另計，明細四行")
    void calculatesPayslipAndItems() {
        when(runMapper.selectById(1L)).thenReturn(run("DRAFT"));
        when(employmentMapper.selectList(any())).thenReturn(List.of(employment()));
        when(standardMapper.selectList(any())).thenReturn(List.of(standard()));
        when(enrollmentMapper.selectList(any())).thenReturn(List.of(enrollment()));
        when(planMapper.selectById(7L)).thenReturn(plan());
        when(payslipMapper.selectList(any())).thenReturn(List.of());
        when(payslipMapper.insert(any(PayrollPayslip.class))).thenAnswer(invocation -> {
            PayrollPayslip saved = invocation.getArgument(0);
            saved.setId(55L);
            return 1;
        });

        service.calculate(1L);

        ArgumentCaptor<PayrollPayslip> captor = ArgumentCaptor.forClass(PayrollPayslip.class);
        verify(payslipMapper).insert(captor.capture());
        PayrollPayslip slip = captor.getValue();
        assertEquals(new BigDecimal("10000.00"), slip.getGrossAmount());
        assertEquals(new BigDecimal("1350.00"), slip.getDeductionAmount());
        assertEquals(new BigDecimal("10800.00"), slip.getEmployerCostAmount());
        assertEquals(new BigDecimal("8650.00"), slip.getNetAmount());
        assertEquals(new BigDecimal("8950.00"), slip.getTaxableBase());
        assertEquals(new BigDecimal("300.00"), slip.getTaxAmount());
        assertEquals("CALCULATED", slip.getStatus());
        // 基本工资 + 个人社保 + 雇主社保 + 个税
        verify(itemMapper, org.mockito.Mockito.times(4)).insert(any(PayrollPayslipItem.class));
        ArgumentCaptor<PayrollRun> runCaptor = ArgumentCaptor.forClass(PayrollRun.class);
        verify(runMapper).updateById(runCaptor.capture());
        assertEquals("CALCULATED", runCaptor.getValue().getStatus());
        assertNull(runCaptor.getValue().getWarnings());
    }

    private PayrollRun run(String status) {
        PayrollRun run = new PayrollRun();
        run.setId(1L);
        run.setPeriod("2026-10");
        run.setCityCode("4403");
        run.setCurrency("CNY");
        run.setStatus(status);
        return run;
    }

    private PayrollRuleSet ruleSet() {
        PayrollRuleSet set = new PayrollRuleSet();
        set.setId(5L);
        set.setName("深圳 2026");
        set.setJurisdiction("CN");
        set.setCityCode("4403");
        set.setCurrency("CNY");
        set.setBasicDeduction(new BigDecimal("5000.0000"));
        set.setStatus(1);
        set.setEffectiveFrom(LocalDate.of(2026, 1, 1));
        return set;
    }

    private HrEmployment employment() {
        HrEmployment employment = new HrEmployment();
        employment.setId(10L);
        employment.setPersonId(100L);
        employment.setEmploymentNo("E001");
        employment.setJurisdiction("CN");
        employment.setStatus(1);
        employment.setStartDate(LocalDate.of(2025, 1, 1));
        return employment;
    }

    private PayrollSalaryStandard standard() {
        PayrollSalaryStandard standard = new PayrollSalaryStandard();
        standard.setId(20L);
        standard.setEmploymentId(10L);
        standard.setBaseAmount(new BigDecimal("10000.0000"));
        standard.setCurrency("CNY");
        standard.setEffectiveFrom(LocalDate.of(2026, 1, 1));
        return standard;
    }

    private PayrollEnrollment enrollment() {
        PayrollEnrollment enrollment = new PayrollEnrollment();
        enrollment.setId(30L);
        enrollment.setEmploymentId(10L);
        enrollment.setPlanId(7L);
        enrollment.setEmployeeAmount(new BigDecimal("1050.0000"));
        enrollment.setEmployerAmount(new BigDecimal("800.0000"));
        enrollment.setCurrency("CNY");
        enrollment.setEffectiveFrom(LocalDate.of(2026, 1, 1));
        return enrollment;
    }

    private PayrollBenefitPlan plan() {
        PayrollBenefitPlan plan = new PayrollBenefitPlan();
        plan.setId(7L);
        plan.setName("社保");
        plan.setPlanType("SOCIAL_INSURANCE");
        return plan;
    }
}
