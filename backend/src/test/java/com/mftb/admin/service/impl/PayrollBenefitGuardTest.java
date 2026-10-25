package com.mftb.admin.service.impl;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.entity.HrEmployment;
import com.mftb.admin.entity.PayrollBenefitPlan;
import com.mftb.admin.entity.PayrollEnrollment;
import com.mftb.admin.mapper.HrEmploymentMapper;
import com.mftb.admin.mapper.PersonMapper;
import com.mftb.admin.mapper.PayrollBenefitPlanMapper;
import com.mftb.admin.mapper.PayrollEnrollmentMapper;
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
 * 福利參保的拒絕性與快照用例（D2 第三批）。
 * 这些口径错一条，工资单的社保/公积金行就会给出错数，且申报会被整批退回。
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class PayrollBenefitGuardTest {

    @Mock private PayrollBenefitPlanMapper planMapper;
    @Mock private PayrollEnrollmentMapper enrollmentMapper;
    @Mock private HrEmploymentMapper employmentMapper;
    @Mock private PersonMapper personMapper;
    @Mock private OperatorResolver operatorResolver;

    private PayrollBenefitServiceImpl service;

    @BeforeEach
    void setUp() {
        service = new PayrollBenefitServiceImpl(planMapper, enrollmentMapper, employmentMapper, personMapper, operatorResolver);
        when(operatorResolver.currentOperatorAccount()).thenReturn("tester");
    }

    @Test
    @DisplayName("雇主与雇员比例之和超过 1 时拒绝（多半是把 10.5% 写成了 10.5）")
    void rejectsRatioSumOverOne() {
        PayrollBenefitPlan plan = basePlan();
        plan.setEmployerRatio(new BigDecimal("0.1050"));
        plan.setEmployeeRatio(new BigDecimal("0.9500"));

        BusinessException ex = assertThrows(BusinessException.class, () -> service.savePlan(plan));
        assertEquals("雇主與雇員比例之和不能超過 1（請填小數，如 10.5% 填 0.105）", ex.getMessage());
        verify(planMapper, never()).insert(any(PayrollBenefitPlan.class));
    }

    @Test
    @DisplayName("方案类型不在白名单时拒绝")
    void rejectsUnknownPlanType() {
        PayrollBenefitPlan plan = basePlan();
        plan.setPlanType("WELFARE");
        assertThrows(BusinessException.class, () -> service.savePlan(plan));
    }

    @Test
    @DisplayName("缴费基数低于方案下限时拒绝")
    void rejectsBaseBelowMin() {
        stubActiveEmployment();
        PayrollBenefitPlan plan = activePlan();
        plan.setMinBase(new BigDecimal("5000.0000"));
        when(planMapper.selectById(1L)).thenReturn(plan);

        PayrollEnrollment enrollment = baseEnrollment();
        enrollment.setBaseAmount(new BigDecimal("4000.0000"));

        BusinessException ex = assertThrows(BusinessException.class, () -> service.saveEnrollment(enrollment));
        assertEquals("繳費基數低於方案下限 5000.0000", ex.getMessage());
        verify(enrollmentMapper, never()).insert(any(PayrollEnrollment.class));
    }

    @Test
    @DisplayName("缴费基数高于方案上限时拒绝")
    void rejectsBaseAboveMax() {
        stubActiveEmployment();
        PayrollBenefitPlan plan = activePlan();
        plan.setMaxBase(new BigDecimal("30000.0000"));
        when(planMapper.selectById(1L)).thenReturn(plan);

        PayrollEnrollment enrollment = baseEnrollment();
        enrollment.setBaseAmount(new BigDecimal("35000.0000"));

        assertThrows(BusinessException.class, () -> service.saveEnrollment(enrollment));
    }

    @Test
    @DisplayName("方案已停用时不能新增参保")
    void rejectsInactivePlan() {
        stubActiveEmployment();
        PayrollBenefitPlan plan = activePlan();
        plan.setStatus(0);
        when(planMapper.selectById(1L)).thenReturn(plan);

        BusinessException ex = assertThrows(BusinessException.class, () -> service.saveEnrollment(baseEnrollment()));
        assertEquals("該參保方案已停用，不能新增參保", ex.getMessage());
    }

    @Test
    @DisplayName("同一雇佣同一方案的参保期间重叠时拒绝")
    void rejectsOverlappingEnrollment() {
        stubActiveEmployment();
        when(planMapper.selectById(1L)).thenReturn(activePlan());
        PayrollEnrollment other = new PayrollEnrollment();
        other.setId(88L);
        other.setEffectiveFrom(LocalDate.of(2026, 1, 1));
        other.setEffectiveTo(LocalDate.of(2026, 12, 31));
        when(enrollmentMapper.selectList(any())).thenReturn(List.of(other));

        PayrollEnrollment enrollment = baseEnrollment();
        enrollment.setEffectiveFrom(LocalDate.of(2026, 6, 1));

        BusinessException ex = assertThrows(BusinessException.class, () -> service.saveEnrollment(enrollment));
        assertEquals("該雇傭在同一方案的參保期間重疊，請先停保上一段（#88）", ex.getMessage());
    }

    @Test
    @DisplayName("参保时按方案费率快照雇主/雇员金额，两位小数四舍五入")
    void snapshotsAmountsByPlanRatio() {
        stubActiveEmployment();
        when(planMapper.selectById(1L)).thenReturn(activePlan());
        when(enrollmentMapper.insert(any(PayrollEnrollment.class))).thenAnswer(invocation -> {
            PayrollEnrollment saved = invocation.getArgument(0);
            saved.setId(9L);
            when(enrollmentMapper.selectById(9L)).thenReturn(saved);
            return 1;
        });

        PayrollEnrollment enrollment = baseEnrollment();
        enrollment.setBaseAmount(new BigDecimal("12345.6700"));
        PayrollEnrollment saved = service.saveEnrollment(enrollment);

        // 12345.67 × 0.1050 = 1296.29535 → 1296.30；× 0.0800 = 987.6536 → 987.65
        assertEquals(new BigDecimal("1296.30"), saved.getEmployeeAmount());
        assertEquals(new BigDecimal("987.65"), saved.getEmployerAmount());
        assertEquals("CNY", saved.getCurrency());
    }

    private void stubActiveEmployment() {
        HrEmployment employment = new HrEmployment();
        employment.setId(1L);
        employment.setStatus(1);
        when(employmentMapper.selectById(1L)).thenReturn(employment);
    }

    private PayrollBenefitPlan basePlan() {
        PayrollBenefitPlan plan = new PayrollBenefitPlan();
        plan.setCode("SI-CN");
        plan.setName("社保");
        plan.setPlanType("SOCIAL_INSURANCE");
        plan.setJurisdiction("CN");
        plan.setEmployerRatio(new BigDecimal("0.0800"));
        plan.setEmployeeRatio(new BigDecimal("0.1050"));
        plan.setCurrency("CNY");
        plan.setEffectiveFrom(LocalDate.of(2026, 1, 1));
        return plan;
    }

    private PayrollBenefitPlan activePlan() {
        PayrollBenefitPlan plan = basePlan();
        plan.setId(1L);
        plan.setStatus(1);
        return plan;
    }

    private PayrollEnrollment baseEnrollment() {
        PayrollEnrollment enrollment = new PayrollEnrollment();
        enrollment.setEmploymentId(1L);
        enrollment.setPlanId(1L);
        enrollment.setBaseAmount(new BigDecimal("10000.0000"));
        enrollment.setEffectiveFrom(LocalDate.of(2026, 10, 1));
        return enrollment;
    }
}
