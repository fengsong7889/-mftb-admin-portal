package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.mftb.admin.constant.HrPerfConstants;
import com.mftb.admin.entity.HrPerfAssessment;
import com.mftb.admin.entity.HrPerfPlan;
import com.mftb.admin.entity.HrPerfScoreItem;
import com.mftb.admin.entity.HrPerfTemplate;
import com.mftb.admin.mapper.HrPerfAssessmentMapper;
import com.mftb.admin.mapper.HrPerfPlanMapper;
import com.mftb.admin.mapper.HrPerfScoreItemMapper;
import com.mftb.admin.mapper.HrPerfTemplateMapper;
import com.mftb.admin.util.OperatorResolver;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 績效确认回调测试。
 * <p>
 * 回调是整批结果的唯一出口，最怕两件事：重复回调把已下发结果冲掉、驳回后计划卡在旧流程上无法重提。
 */
class HrPerfCallbackTest {

    private static final String FLOW = "OA202609280001";

    private HrPerfPlanMapper planMapper;
    private HrPerfAssessmentMapper assessmentMapper;
    private HrPerfScoreItemMapper scoreItemMapper;
    private HrPerfTemplateMapper templateMapper;
    private HrPerfCallbackServiceImpl service;

    @BeforeEach
    void setUp() {
        MapperBuilderAssistant assistant = new MapperBuilderAssistant(new MybatisConfiguration(), "");
        for (Class<?> c : new Class<?>[]{HrPerfPlan.class, HrPerfAssessment.class, HrPerfScoreItem.class,
                HrPerfTemplate.class}) {
            TableInfoHelper.initTableInfo(assistant, c);
        }
        planMapper = mock(HrPerfPlanMapper.class);
        assessmentMapper = mock(HrPerfAssessmentMapper.class);
        scoreItemMapper = mock(HrPerfScoreItemMapper.class);
        templateMapper = mock(HrPerfTemplateMapper.class);
        OperatorResolver operatorResolver = mock(OperatorResolver.class);
        lenient().when(operatorResolver.currentOperatorName()).thenReturn("審批人");
        service = new HrPerfCallbackServiceImpl(planMapper, assessmentMapper, scoreItemMapper,
                templateMapper, operatorResolver);
    }

    private HrPerfPlan plan(String status, String flowNo) {
        HrPerfPlan plan = new HrPerfPlan();
        plan.setId(90L);
        plan.setReqNo("PP202609280001");
        plan.setTemplateId(81L);
        plan.setStatus(status);
        plan.setFlowNo(flowNo);
        return plan;
    }

    private HrPerfAssessment assessment(Long id, String status) {
        HrPerfAssessment a = new HrPerfAssessment();
        a.setId(id);
        a.setPlanId(90L);
        a.setUserId(30L);
        a.setStatus(status);
        return a;
    }

    private void stubTemplate(String gradeScheme) {
        HrPerfTemplate template = new HrPerfTemplate();
        template.setId(81L);
        template.setGradeScheme(gradeScheme);
        when(templateMapper.selectById(81L)).thenReturn(template);
    }

    @Test
    @DisplayName("审批通过：分数取校准优先、其次上级、最后自评，等级按模板区间映射")
    void approvedPrefersCalibratedScoreAndMapsGrade() {
        when(planMapper.selectOne(any())).thenReturn(plan(HrPerfConstants.PLAN_CONFIRM_PENDING, FLOW));
        stubTemplate("[{\"code\":\"S\",\"minScore\":90},{\"code\":\"A\",\"minScore\":80},{\"code\":\"B\",\"minScore\":60}]");

        // 校准过：85 分 → 等级取校准值，不被区间覆盖
        HrPerfAssessment calibrated = assessment(1L, HrPerfConstants.A_CONFIRM_PENDING);
        calibrated.setCalibratedScore(new BigDecimal("85.00"));
        calibrated.setCalibratedGrade("S");
        calibrated.setSupervisorScore(new BigDecimal("70.00"));
        // 未校准：上级 80 分 → 命中 A（下限 80 边界含）
        HrPerfAssessment bySupervisor = assessment(2L, HrPerfConstants.A_CONFIRM_PENDING);
        bySupervisor.setSupervisorScore(new BigDecimal("80.00"));
        bySupervisor.setSelfScore(new BigDecimal("99.00"));
        // 未校准且得分低于最低下限：不得凭空造等级
        HrPerfAssessment belowRange = assessment(3L, HrPerfConstants.A_CONFIRM_PENDING);
        belowRange.setSelfScore(new BigDecimal("40.00"));
        when(assessmentMapper.selectList(any())).thenReturn(List.of(calibrated, bySupervisor, belowRange));
        when(scoreItemMapper.selectList(any())).thenReturn(List.of());

        service.onFlowApproved(FLOW);

        assertEquals(new BigDecimal("85.00"), calibrated.getFinalScore());
        assertEquals("S", calibrated.getFinalGrade());
        assertEquals(HrPerfConstants.A_CONFIRMED, calibrated.getStatus());
        assertNotNull(calibrated.getConfirmedAt());
        assertEquals(new BigDecimal("80.00"), bySupervisor.getFinalScore(), "上级分优先于自评分下发");
        assertEquals("A", bySupervisor.getFinalGrade());
        assertNull(belowRange.getFinalGrade(), "低于最低下限时不得套用任意等级");
        verify(assessmentMapper, times(3)).updateById(any(HrPerfAssessment.class));
        assertEquals(HrPerfConstants.PLAN_CONFIRMED, planOfLastUpdate().getStatus());
    }

    /** 计划状态断言：捕获最后一次 updateById 的实体 */
    private HrPerfPlan planOfLastUpdate() {
        ArgumentCaptor<HrPerfPlan> captor = ArgumentCaptor.forClass(HrPerfPlan.class);
        verify(planMapper, atLeastOnce()).updateById(captor.capture());
        List<HrPerfPlan> all = captor.getAllValues();
        return all.get(all.size() - 1);
    }

    @Test
    @DisplayName("重复回调不重复下发：计划已确认则直接跳过")
    void approvedIsIdempotent() {
        when(planMapper.selectOne(any())).thenReturn(plan(HrPerfConstants.PLAN_CONFIRMED, FLOW));

        service.onFlowApproved(FLOW);

        verify(assessmentMapper, never()).selectList(any());
        verify(assessmentMapper, never()).updateById(any(HrPerfAssessment.class));
        verify(planMapper, never()).updateById(any(HrPerfPlan.class));
    }

    @Test
    @DisplayName("流程号不属于绩效（无关单据）时静默跳过，不抛异常影响审批主流程")
    void unknownFlowIsSkipped() {
        when(planMapper.selectOne(any())).thenReturn(null);

        service.onFlowApproved("OA-OTHER");
        service.onFlowRejected("OA-OTHER");

        verify(assessmentMapper, never()).updateById(any(HrPerfAssessment.class));
    }

    @Test
    @DisplayName("驳回：计划退回进行中并清空流程绑定，考核单回到待校准")
    void rejectedClearsFlowBindingSoHrCanResubmit() {
        when(planMapper.selectOne(any())).thenReturn(plan(HrPerfConstants.PLAN_CONFIRM_PENDING, FLOW));
        HrPerfAssessment pending = assessment(1L, HrPerfConstants.A_CONFIRM_PENDING);
        HrPerfAssessment alreadyConfirmed = assessment(2L, HrPerfConstants.A_CONFIRMED);
        when(assessmentMapper.selectList(any())).thenReturn(List.of(pending));

        service.onFlowRejected(FLOW);

        // 置空 flowNo 必须走 UpdateWrapper：updateById 会忽略 null 字段，导致计划永远挂在已驳回流程上
        verify(planMapper).update(isNull(), any(LambdaUpdateWrapper.class));
        verify(planMapper, never()).updateById(any(HrPerfPlan.class));
        assertEquals(HrPerfConstants.A_CALIBRATION_PENDING, pending.getStatus());
        verify(assessmentMapper).updateById(pending);
        // 只回退仍处待确认的单据，已确认结果不受影响
        verify(assessmentMapper, never()).updateById(eq(alreadyConfirmed));
    }

    @Test
    @DisplayName("指标最终分随结果下发：取上级分，已有相同最终分时不重复写库")
    void itemFinalScoreIsPublishedWithResult() {
        when(planMapper.selectOne(any())).thenReturn(plan(HrPerfConstants.PLAN_CONFIRM_PENDING, FLOW));
        stubTemplate("[{\"code\":\"A\",\"minScore\":80}]");
        HrPerfAssessment a = assessment(1L, HrPerfConstants.A_CONFIRM_PENDING);
        a.setSupervisorScore(new BigDecimal("88.00"));
        when(assessmentMapper.selectList(any())).thenReturn(List.of(a));

        HrPerfScoreItem needUpdate = new HrPerfScoreItem();
        needUpdate.setId(11L);
        needUpdate.setAssessmentId(1L);
        needUpdate.setWeight(BigDecimal.valueOf(100));
        needUpdate.setSelfScore(new BigDecimal("70.00"));
        needUpdate.setSupervisorScore(new BigDecimal("88.00"));
        HrPerfScoreItem alreadyPublished = new HrPerfScoreItem();
        alreadyPublished.setId(12L);
        alreadyPublished.setAssessmentId(1L);
        alreadyPublished.setSupervisorScore(new BigDecimal("90.00"));
        alreadyPublished.setFinalScore(new BigDecimal("90.00"));
        when(scoreItemMapper.selectList(any())).thenReturn(List.of(needUpdate, alreadyPublished));

        service.onFlowApproved(FLOW);

        assertEquals(new BigDecimal("88.00"), needUpdate.getFinalScore());
        verify(scoreItemMapper).updateById(needUpdate);
        verify(scoreItemMapper, never()).updateById(alreadyPublished);
    }
}
