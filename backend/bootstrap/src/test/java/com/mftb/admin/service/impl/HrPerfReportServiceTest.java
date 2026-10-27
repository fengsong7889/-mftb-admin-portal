package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.common.PermissionDeniedException;
import com.mftb.admin.constant.HrPerfConstants;
import com.mftb.admin.dto.HrPerfAppealSubmitDTO;
import com.mftb.admin.dto.HrPerfAppealVO;
import com.mftb.admin.dto.HrPerfCalibrationLogVO;
import com.mftb.admin.dto.HrPerfReportVO;
import com.mftb.admin.entity.HrPerfAppeal;
import com.mftb.admin.entity.HrPerfAssessment;
import com.mftb.admin.entity.HrPerfCalibrationLog;
import com.mftb.admin.entity.HrPerfPlan;
import com.mftb.admin.entity.HrPerfTemplate;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.HrPerfAppealMapper;
import com.mftb.admin.mapper.HrPerfAssessmentMapper;
import com.mftb.admin.mapper.HrPerfCalibrationLogMapper;
import com.mftb.admin.mapper.HrPerfCycleMapper;
import com.mftb.admin.mapper.HrPerfPlanMapper;
import com.mftb.admin.mapper.HrPerfTemplateMapper;
import com.mftb.admin.service.PermissionService;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.OperatorResolver;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 績效台账（M2）测试：强制分布、改判留痕、申诉闭环、统计口径。
 * <p>
 * 这几处最容易「看起来能用、数字却不对」：占比上限取整方向、留痕是否真写入、
 * 申诉修订后最终值是否同步、台账是否混入未确认结果，都用断言钉住。
 */
class HrPerfReportServiceTest {

    private static final long EMPLOYEE_ID = 30L;
    private static final long STRANGER_ID = 32L;
    private static final long PLAN_ID = 90L;

    private HrPerfCalibrationLogMapper logMapper;
    private HrPerfAppealMapper appealMapper;
    private HrPerfAssessmentMapper assessmentMapper;
    private HrPerfPlanMapper planMapper;
    private HrPerfTemplateMapper templateMapper;
    private PermissionService permissionService;
    private OperatorResolver operatorResolver;
    private HrPerfReportServiceImpl service;
    private final List<SysUser> loginStack = new ArrayList<>();

    @BeforeEach
    void setUp() {
        MapperBuilderAssistant assistant = new MapperBuilderAssistant(new MybatisConfiguration(), "");
        for (Class<?> c : new Class<?>[]{HrPerfCalibrationLog.class, HrPerfAppeal.class, HrPerfAssessment.class,
                HrPerfPlan.class, HrPerfTemplate.class}) {
            TableInfoHelper.initTableInfo(assistant, c);
        }
        logMapper = mock(HrPerfCalibrationLogMapper.class);
        appealMapper = mock(HrPerfAppealMapper.class);
        assessmentMapper = mock(HrPerfAssessmentMapper.class);
        planMapper = mock(HrPerfPlanMapper.class);
        templateMapper = mock(HrPerfTemplateMapper.class);
        permissionService = mock(PermissionService.class);
        operatorResolver = mock(OperatorResolver.class);
        service = new HrPerfReportServiceImpl(logMapper, appealMapper, assessmentMapper, planMapper,
                mock(HrPerfCycleMapper.class), templateMapper, operatorResolver, permissionService,
                mock(BizSeqService.class));
        lenient().when(operatorResolver.currentOperatorName()).thenReturn("人事专员");
        lenient().when(operatorResolver.currentUser())
                .thenAnswer(inv -> loginStack.isEmpty() ? null : loginStack.get(loginStack.size() - 1));
        lenient().when(permissionService.hasPermission(any(), anyString(), anyString())).thenReturn(true);
    }

    // ==================== 夹具 ====================

    private static SysUser user(long id, String name) {
        SysUser u = new SysUser();
        u.setId(id);
        u.setName(name);
        u.setStatus(1);
        return u;
    }

    private void loginAs(SysUser u) {
        loginStack.add(u);
    }

    private void stubPlan(String gradeScheme) {
        HrPerfPlan plan = new HrPerfPlan();
        plan.setId(PLAN_ID);
        plan.setReqNo("PP202609280001");
        plan.setName("2026Q3 考核");
        plan.setTemplateId(81L);
        lenient().when(planMapper.selectById(PLAN_ID)).thenReturn(plan);
        lenient().when(planMapper.selectBatchIds(any())).thenReturn(List.of(plan));
        // 不传 planId 时服务会先列全部计划；不桩就会返回空集，跨计划分支根本跑不到
        lenient().when(planMapper.selectList(any())).thenReturn(List.of(plan));
        HrPerfTemplate template = new HrPerfTemplate();
        template.setId(81L);
        template.setGradeScheme(gradeScheme);
        lenient().when(templateMapper.selectById(81L)).thenReturn(template);
    }

    private HrPerfAssessment assessed(long id, long userId, String dept, BigDecimal score, String grade, String status) {
        HrPerfAssessment a = new HrPerfAssessment();
        a.setId(id);
        a.setReqNo("PH20260928" + String.format("%04d", id));
        a.setPlanId(PLAN_ID);
        a.setUserId(userId);
        a.setEmpNo("MF" + String.format("%05d", userId));
        a.setEmpName("员工" + userId);
        a.setDeptName(dept);
        a.setSupervisorScore(score);
        a.setFinalScore(score);
        a.setFinalGrade(grade);
        a.setStatus(status);
        return a;
    }

    private HrPerfAppeal appeal(long id, String status) {
        HrPerfAppeal e = new HrPerfAppeal();
        e.setId(id);
        e.setReqNo("PA20260928000" + id);
        e.setAssessmentId(500L);
        e.setPlanId(PLAN_ID);
        e.setUserId(EMPLOYEE_ID);
        e.setEmpName("员工30");
        e.setReason("评分与事实不符");
        e.setStatus(status);
        e.setDeleted(0);
        return e;
    }

    private static HrPerfAppealSubmitDTO appealDto(String reason, String expectation) {
        HrPerfAppealSubmitDTO dto = new HrPerfAppealSubmitDTO();
        dto.setReason(reason);
        dto.setExpectation(expectation);
        return dto;
    }

    // ==================== 强制分布 ====================

    @Test
    @DisplayName("建议占比按上限取整判定：小部门一人即超编，未配占比则完全放行")
    void distributionGapUsesFloorOfSuggestedRatio() {
        loginAs(user(1L, "人事专员"));
        stubPlan("[{\"code\":\"S\",\"minScore\":90,\"ratio\":10},{\"code\":\"A\",\"minScore\":80,\"ratio\":30}]");
        List<HrPerfAssessment> rows = new ArrayList<>();
        for (long i = 1; i <= 10; i++) {
            // 8 人 95 分（落 S）、2 人 85 分（落 A）：S 允许 floor(10*10%)=1，A 允许 3
            rows.add(assessed(i, 100 + i, "运营部", BigDecimal.valueOf(i <= 8 ? 95 : 85), null,
                    HrPerfConstants.A_CALIBRATION_PENDING));
        }
        when(assessmentMapper.selectList(any())).thenReturn(rows);

        List<HrPerfReportVO.GradeCount> gap = service.distributionGap(PLAN_ID);
        assertEquals(1, gap.size(), "只有 S 超编，A 未超上限: " + gap);
        assertEquals("S", gap.get(0).getGrade());
        // 8 人落 S，10 人的 10% 上限就是 1 人
        assertTrue(gap.get(0).getGapNote().contains("7 人"), "实际: " + gap.get(0).getGapNote());
        // 结构化数值同步给出：前端算差值不该去解析中文描述
        assertEquals(1, gap.get(0).getAllowedCount());
        assertEquals(7, gap.get(0).getOverCount());
        assertFalse(service.distributionSatisfied(PLAN_ID));

        // 模板没配建议占比时不做校验：强制分布不该变成隐式卡点
        stubPlan("[{\"code\":\"S\",\"minScore\":90},{\"code\":\"A\",\"minScore\":80}]");
        assertTrue(service.distributionGap(PLAN_ID).isEmpty());
    }

    @Test
    @DisplayName("小部门不因取整而「制度上永远达不到」：ceil 口径下单人占 90% 不判超编")
    void tinyPopulationDoesNotBecomePermanentlyNonCompliant() {
        loginAs(user(1L, "人事专员"));
        stubPlan("[{\"code\":\"S\",\"minScore\":90,\"ratio\":10},{\"code\":\"A\",\"minScore\":60,\"ratio\":90}]");
        // 1 人得 65 分→A：floor 口径下 A 上限为 0，会判“超编”，部门永远提不了交
        when(assessmentMapper.selectList(any())).thenReturn(List.of(
                assessed(1L, 101L, "新并入小组", new BigDecimal("65"), null, HrPerfConstants.A_CALIBRATION_PENDING)));
        assertTrue(service.distributionGap(PLAN_ID).isEmpty(), "单人占 A 不该被判定超编");
    }

    @Test
    @DisplayName("校准改判后的分布要用改判值，而不是上级原始分")
    void distributionHonoursCalibratedGrade() {
        loginAs(user(1L, "人事专员"));
        stubPlan("[{\"code\":\"S\",\"minScore\":90,\"ratio\":10},{\"code\":\"A\",\"minScore\":60,\"ratio\":90}]");
        HrPerfAssessment a = assessed(1L, 101L, "运营部", new BigDecimal("95"), null,
                HrPerfConstants.A_CALIBRATION_PENDING);
        a.setCalibratedScore(new BigDecimal("70"));
        a.setCalibratedGrade("A");
        when(assessmentMapper.selectList(any())).thenReturn(List.of(a));
        assertTrue(service.distributionGap(PLAN_ID).isEmpty(), "已按 A 统计就不该判 S 超编");
    }

    // ==================== 结果台账 ====================

    @Test
    @DisplayName("台账只统计已确认结果，且建议占比只在单计划口径给出")
    void reportCountsOnlyConfirmedResults() {
        loginAs(user(1L, "人事专员"));
        stubPlan("[{\"code\":\"S\",\"minScore\":90,\"ratio\":10},{\"code\":\"A\",\"minScore\":80,\"ratio\":40}]");
        HrPerfAssessment c1 = assessed(1L, 101L, "运营部", new BigDecimal("90"), "S", HrPerfConstants.A_CONFIRMED);
        HrPerfAssessment c2 = assessed(2L, 102L, "运营部", new BigDecimal("80"), "A", HrPerfConstants.A_CONFIRMED);
        HrPerfAssessment c3 = assessed(3L, 103L, "技术部", new BigDecimal("70"), "A", HrPerfConstants.A_CONFIRMED);
        HrPerfAssessment running = assessed(4L, 104L, "技术部", new BigDecimal("99"), null,
                HrPerfConstants.A_CALIBRATION_PENDING);
        Page<HrPerfAssessment> page = new Page<>(1, 100, 3);
        page.setRecords(List.of(c1, c2, c3, running));
        // 服务侧只取 confirmedWrapper，Mock 返回同一批但真实 SQL 会过滤；用 selectList 结果再过滤模拟
        when(assessmentMapper.selectList(any())).thenAnswer(inv -> {
            com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<HrPerfAssessment> w = inv.getArgument(0);
            String sql = w.getTargetSql() == null ? "" : w.getTargetSql().toLowerCase();
            assertTrue(sql.contains("status"), "台账统计必须带状态过滤，否则未确认结果会混入");
            return List.of(c1, c2, c3);
        });

        HrPerfReportVO vo = service.report(null, PLAN_ID);
        assertEquals(3, vo.getHeadcount());
        assertEquals(0, new BigDecimal("80.00").compareTo(vo.getAvgScore()), "实际: " + vo.getAvgScore());
        assertEquals(new BigDecimal("90"), vo.getMaxScore());
        assertEquals(new BigDecimal("70"), vo.getMinScore());
        assertTrue(vo.getHasSuggestedRatio());
        assertEquals(List.of("S", "A"), vo.getGradeDistribution().stream()
                .map(HrPerfReportVO.GradeCount::getGrade).toList(), "等级须按模板下限降序展示");
        assertEquals(0, new BigDecimal("33.33").compareTo(vo.getGradeDistribution().get(0).getActualRatio()));
        assertEquals(1, vo.getGradeDistribution().get(0).getAllowedCount(), "10 人的 S 上限为 1");
        assertEquals(0, vo.getGradeDistribution().get(1).getOverCount(), "A 实占 2/3，未超上限");
        assertEquals(2, vo.getDeptDistribution().size());
        assertEquals("运营部", vo.getDeptDistribution().get(0).getDeptName(), "人数多的部门排前");
        assertEquals("S", vo.getDeptDistribution().get(0).getTopGrade());
        assertEquals(1, vo.getTrend().size());

        // 跨计划口径下不给出"平均建议占比"这种没有意义的数
        vo = service.report(null, null);
        assertFalse(vo.getHasSuggestedRatio());
        assertNull(vo.getGradeDistribution().get(0).getSuggestRatio());
    }

    @Test
    @DisplayName("台账明细只走已确认口径并补计划名")
    void reportRowsAttachPlanName() {
        loginAs(user(1L, "人事专员"));
        stubPlan("[{\"code\":\"A\",\"minScore\":80}]");
        HrPerfAssessment confirmed = assessed(1L, 101L, "运营部", new BigDecimal("88"), "A", HrPerfConstants.A_CONFIRMED);
        Page<HrPerfAssessment> page = new Page<>(1, 20, 1);
        page.setRecords(List.of(confirmed));
        when(assessmentMapper.selectPage(any(), any())).thenReturn(page);

        List<?> records = service.pageReportRows(1, 20, null, PLAN_ID, null, null, null).getRecords();
        assertEquals(1, records.size());
        assertEquals("2026Q3 考核",
                ((com.mftb.admin.dto.HrPerfAssessmentVO) records.get(0)).getPlanName());
    }

    // ==================== 留痕 ====================

    @Test
    @DisplayName("留痕写入带操作人 ID 与姓名快照，并拒绝无单号的空写入")
    void logCarriesOperatorIdentity() {
        loginAs(user(7L, "人事专员"));
        HrPerfAssessment a = assessed(500L, EMPLOYEE_ID, "运营部", new BigDecimal("82"), null,
                HrPerfConstants.A_CALIBRATION_PENDING);
        a.setCalibratedGrade("B");
        service.logCalibration(a, HrPerfConstants.LOG_CALIBRATE, new BigDecimal("82"), "B",
                new BigDecimal("85"), "A", "跨部门拉齐", null);

        ArgumentCaptor<HrPerfCalibrationLog> captor = ArgumentCaptor.forClass(HrPerfCalibrationLog.class);
        verify(logMapper).insert(captor.capture());
        HrPerfCalibrationLog row = captor.getValue();
        assertEquals(7L, row.getOperatorUserId());
        assertEquals("人事专员", row.getOperatorName());
        assertEquals("员工30", row.getEmpName(), "留痕必须存快照，事后改名也指得回当时事实");
        assertEquals("B", row.getBeforeGrade());
        assertEquals("A", row.getAfterGrade());

        assertThrows(BusinessException.class, () -> service.logCalibration(null,
                HrPerfConstants.LOG_CALIBRATE, null, null, null, null, "x", null));
    }

    @Test
    @DisplayName("例外放行是计划级动作：必须带理由，且不留具体考核单")
    void waiverIsPlanLevelAndRequiresReason() {
        loginAs(user(7L, "人事专员"));
        stubPlan(null);
        assertThrows(BusinessException.class, () -> service.logDistributionWaiver(planMapper.selectById(PLAN_ID), " "));
        service.logDistributionWaiver(planMapper.selectById(PLAN_ID), "本季新并入团队，结构上凑不满五档");
        ArgumentCaptor<HrPerfCalibrationLog> captor = ArgumentCaptor.forClass(HrPerfCalibrationLog.class);
        verify(logMapper).insert(captor.capture());
        assertEquals(HrPerfConstants.LOG_DISTRIBUTION_WAIVER, captor.getValue().getAction());
        assertEquals(PLAN_ID, captor.getValue().getPlanId());
        assertNull(captor.getValue().getAssessmentId());
    }

    @Test
    @DisplayName("员工不能从留痕口反推他人分数")
    void logsAreHrOnly() {
        loginAs(user(STRANGER_ID, "路人甲"));
        lenient().when(permissionService.hasPermission(any(), anyString(), anyString())).thenReturn(false);
        assertThrows(PermissionDeniedException.class, () -> service.logsOfAssessment(500L));
        assertThrows(PermissionDeniedException.class,
                () -> service.pageLogs(1, 20, null, null, null, null));
    }

    // ==================== 申诉 ====================

    @Test
    @DisplayName("只能对本人已确认结果提申诉，且在途申诉不得重复")
    void appealPreconditions() {
        loginAs(user(EMPLOYEE_ID, "员工30"));
        HrPerfAssessment confirmed = assessed(500L, EMPLOYEE_ID, "运营部", new BigDecimal("85"), "A",
                HrPerfConstants.A_CONFIRMED);
        when(assessmentMapper.selectById(500L)).thenReturn(confirmed);

        assertThrows(BusinessException.class, () -> service.submitAppeal(500L, appealDto(" ", null)));

        when(appealMapper.selectCount(any())).thenReturn(1L);
        assertThrows(BusinessException.class, () -> service.submitAppeal(500L, appealDto("分数与事实不符", null)));

        when(appealMapper.selectCount(any())).thenReturn(0L);
        HrPerfAssessment pending = assessed(501L, EMPLOYEE_ID, "运营部", new BigDecimal("85"), null,
                HrPerfConstants.A_CALIBRATION_PENDING);
        when(assessmentMapper.selectById(501L)).thenReturn(pending);
        assertThrows(BusinessException.class, () -> service.submitAppeal(501L, appealDto("还没确认就想申诉", null)));

        // 他人单据按数据范围拒绝，而不是"没有权限"
        loginAs(user(STRANGER_ID, "路人甲"));
        PermissionDeniedException denied = assertThrows(PermissionDeniedException.class,
                () -> service.submitAppeal(500L, appealDto("想动别人的结果", null)));
        assertTrue(denied.getMessage().contains("本人的資料"), "实际: " + denied.getMessage());
    }

    @Test
    @DisplayName("终态申诉必须有结论，且办结后不得再改")
    void appealHandlingGuards() {
        loginAs(user(1L, "人事专员"));
        HrPerfAppeal open = appeal(1L, HrPerfConstants.APPEAL_PENDING);
        when(appealMapper.selectById(1L)).thenReturn(open);
        assertThrows(BusinessException.class,
                () -> service.handleAppeal(1L, HrPerfConstants.APPEAL_RESOLVED, "  "));
        assertThrows(BusinessException.class, () -> service.handleAppeal(1L, "closed", "乱状态"));

        HrPerfAppealVO done = service.handleAppeal(1L, HrPerfConstants.APPEAL_RESOLVED, "已复核，维持原结果");
        assertEquals(HrPerfConstants.APPEAL_RESOLVED, done.getStatus());
        assertTrue(open.getHandledAt() != null);

        assertThrows(BusinessException.class, () -> service.handleAppeal(1L, HrPerfConstants.APPEAL_PENDING, null));
    }

    @Test
    @DisplayName("受理后改判要同步最终值、写留痕并把申诉办结")
    void reviseFromAppealRewritesFinalResult() {
        loginAs(user(1L, "人事专员"));
        stubPlan("[{\"code\":\"S\",\"minScore\":90},{\"code\":\"A\",\"minScore\":80}]");
        HrPerfAppeal appeal = appeal(1L, HrPerfConstants.APPEAL_PROCESSING);
        when(appealMapper.selectById(1L)).thenReturn(appeal);
        HrPerfAssessment a = assessed(500L, EMPLOYEE_ID, "运营部", new BigDecimal("80"), "A",
                HrPerfConstants.A_CONFIRMED);
        a.setSupervisorScore(new BigDecimal("80"));
        when(assessmentMapper.selectById(500L)).thenReturn(a);
        when(logMapper.selectCount(any())).thenReturn(0L);

        assertThrows(BusinessException.class,
                () -> service.reviseFromAppeal(1L, new BigDecimal("92"), "ZZ", "模板外等级"));
        assertThrows(BusinessException.class,
                () -> service.reviseFromAppeal(1L, new BigDecimal("92"), "S", " "));

        service.reviseFromAppeal(1L, new BigDecimal("92"), "S", "复核后上调至卓越");

        assertEquals(new BigDecimal("92"), a.getFinalScore(), "结果已下发，修订必须同步最终值");
        assertEquals("S", a.getFinalGrade());
        assertEquals(new BigDecimal("92"), a.getCalibratedScore());
        assertEquals(HrPerfConstants.APPEAL_RESOLVED, appeal.getStatus());
        assertTrue(appeal.getConclusion().contains("92"), "实际: " + appeal.getConclusion());

        ArgumentCaptor<HrPerfCalibrationLog> captor = ArgumentCaptor.forClass(HrPerfCalibrationLog.class);
        verify(logMapper, times(1)).insert(captor.capture());
        assertEquals(HrPerfConstants.LOG_APPEAL_REVISE, captor.getValue().getAction());
        assertEquals(1L, captor.getValue().getRefAppealId(), "留痕要能回指申诉单");
        assertEquals("A", captor.getValue().getBeforeGrade());

        // 只改分数没给等级时按模板重新映射，避免出现"分数变了等级没变"
        HrPerfAppeal appeal2 = appeal(2L, HrPerfConstants.APPEAL_PENDING);
        appeal2.setAssessmentId(500L);
        when(appealMapper.selectById(2L)).thenReturn(appeal2);
        a.setStatus(HrPerfConstants.A_CONFIRMED);
        service.reviseFromAppeal(2L, new BigDecimal("85"), null, "重新核算客诉口径");
        assertEquals("A", a.getFinalGrade(), "85 分在模板里只能落 A（S 下限 90）");
    }

    @Test
    @DisplayName("已办结的申诉不能再次修订结果")
    void resolvedAppealCannotBeRevisedAgain() {
        loginAs(user(1L, "人事专员"));
        when(appealMapper.selectById(1L)).thenReturn(appeal(1L, HrPerfConstants.APPEAL_RESOLVED));
        assertThrows(BusinessException.class,
                () -> service.reviseFromAppeal(1L, new BigDecimal("99"), "S", "想再改一次"));
        verify(assessmentMapper, never()).updateById(any(HrPerfAssessment.class));
    }
}
