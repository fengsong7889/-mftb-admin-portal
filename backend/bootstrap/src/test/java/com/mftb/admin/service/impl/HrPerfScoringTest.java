package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.common.PermissionDeniedException;
import com.mftb.admin.constant.HrPerfConstants;
import com.mftb.admin.dto.HrPerfAssessmentVO;
import com.mftb.admin.dto.HrPerfPlanLaunchDTO;
import com.mftb.admin.dto.HrPerfReportVO;
import com.mftb.admin.dto.HrPerfScoreSubmitDTO;
import com.mftb.admin.dto.HrPerfTemplateSaveDTO;
import com.mftb.admin.entity.HrPerfAssessment;
import com.mftb.admin.entity.HrPerfCycle;
import com.mftb.admin.entity.HrPerfIndicator;
import com.mftb.admin.entity.HrPerfPlan;
import com.mftb.admin.entity.HrPerfScoreItem;
import com.mftb.admin.entity.HrPerfTemplate;
import com.mftb.admin.entity.SysDepartment;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.HrPerfAssessmentMapper;
import com.mftb.admin.mapper.HrPerfCycleMapper;
import com.mftb.admin.mapper.HrPerfIndicatorMapper;
import com.mftb.admin.mapper.HrPerfPlanMapper;
import com.mftb.admin.mapper.HrPerfScoreItemMapper;
import com.mftb.admin.mapper.HrPerfTemplateMapper;
import com.mftb.admin.mapper.SysDepartmentMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.HrPerfReportService;
import com.mftb.admin.service.OaRequestService;
import com.mftb.admin.service.PermissionService;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.OperatorResolver;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 績效考核核心口径测试。
 * <p>
 * 覆盖四件最容易出错的事：总分必须由服务端按权重算（不接受前端值）、评估人指派在姓名歧义时
 * 必须宁缺勿错、结果在未确认前对本人不可见、整批提交与回调的前置与幂等。
 */
class HrPerfScoringTest {

    private static final long EMPLOYEE_ID = 30L;
    private static final long EVALUATOR_ID = 31L;
    private static final long STRANGER_ID = 32L;
    private static final long DEPT_ID = 7L;

    private HrPerfAssessmentMapper assessmentMapper;
    private HrPerfScoreItemMapper scoreItemMapper;
    private HrPerfPlanMapper planMapper;
    private HrPerfTemplateMapper templateMapper;
    private SysUserMapper sysUserMapper;
    private SysDepartmentMapper sysDepartmentMapper;
    private PermissionService permissionService;
    private OperatorResolver operatorResolver;
    private HrPerfReportService reportService;
    private HrPerfServiceImpl service;
    private final List<SysUser> loginStack = new ArrayList<>();

    @BeforeEach
    void setUp() {
        MapperBuilderAssistant assistant = new MapperBuilderAssistant(new MybatisConfiguration(), "");
        for (Class<?> c : new Class<?>[]{HrPerfAssessment.class, HrPerfScoreItem.class, HrPerfPlan.class,
                HrPerfTemplate.class, HrPerfCycle.class, HrPerfIndicator.class, SysUser.class, SysDepartment.class}) {
            TableInfoHelper.initTableInfo(assistant, c);
        }
        assessmentMapper = mock(HrPerfAssessmentMapper.class);
        scoreItemMapper = mock(HrPerfScoreItemMapper.class);
        planMapper = mock(HrPerfPlanMapper.class);
        templateMapper = mock(HrPerfTemplateMapper.class);
        sysUserMapper = mock(SysUserMapper.class);
        sysDepartmentMapper = mock(SysDepartmentMapper.class);
        permissionService = mock(PermissionService.class);
        operatorResolver = mock(OperatorResolver.class);
        reportService = mock(HrPerfReportService.class);
        service = new HrPerfServiceImpl(mock(HrPerfCycleMapper.class), templateMapper,
                mock(HrPerfIndicatorMapper.class), planMapper, assessmentMapper, scoreItemMapper,
                sysUserMapper, sysDepartmentMapper, mock(OaRequestService.class), mock(BizSeqService.class),
                operatorResolver, permissionService, reportService);

        lenient().when(operatorResolver.currentOperatorName()).thenReturn("管理員");
        lenient().when(operatorResolver.currentUser()).thenAnswer(inv -> loginStack.get(loginStack.size() - 1));
        // 默认放行所有绩效菜单，再由具体用例收紧
        lenient().when(permissionService.hasPermission(any(), anyString(), anyString())).thenReturn(true);
    }

    // ==================== 夹具 ====================

    private static SysUser user(long id, String empId, String name) {
        SysUser u = new SysUser();
        u.setId(id);
        u.setUsername(empId);
        u.setEmpId(empId);
        u.setName(name);
        u.setDepartmentId(DEPT_ID);
        u.setDepartment("运营部");
        u.setJobLevel("P5");
        u.setStatus(1);
        return u;
    }

    private void loginAs(SysUser user) {
        loginStack.add(user);
    }

    private HrPerfAssessment assessment(String status) {
        HrPerfAssessment a = new HrPerfAssessment();
        a.setId(500L);
        a.setReqNo("PH202609280001");
        a.setPlanId(90L);
        a.setUserId(EMPLOYEE_ID);
        a.setEmpName("陳小明");
        a.setEvaluatorUserId(EVALUATOR_ID);
        a.setEvaluatorName("王大軍");
        a.setStatus(status);
        return a;
    }

    private List<HrPerfScoreItem> items(BigDecimal... weights) {
        List<HrPerfScoreItem> list = new ArrayList<>();
        for (int i = 0; i < weights.length; i++) {
            HrPerfScoreItem item = new HrPerfScoreItem();
            item.setId((long) (i + 1));
            item.setAssessmentId(500L);
            item.setIndicatorName("指標" + (i + 1));
            item.setWeight(weights[i]);
            item.setDeleted(0);
            list.add(item);
        }
        return list;
    }

    private static HrPerfScoreSubmitDTO score(Long itemId, int value) {
        HrPerfScoreSubmitDTO dto = new HrPerfScoreSubmitDTO();
        dto.setSubmit(true);
        HrPerfScoreSubmitDTO.ItemScore in = new HrPerfScoreSubmitDTO.ItemScore();
        in.setItemId(itemId);
        in.setScore(BigDecimal.valueOf(value));
        dto.setItems(List.of(in));
        return dto;
    }

    private static HrPerfScoreSubmitDTO.ItemScore scoreItem(Long itemId, int value) {
        HrPerfScoreSubmitDTO.ItemScore in = new HrPerfScoreSubmitDTO.ItemScore();
        in.setItemId(itemId);
        in.setScore(BigDecimal.valueOf(value));
        return in;
    }

    private static HrPerfScoreSubmitDTO scores(List<HrPerfScoreItem> items, int value) {
        HrPerfScoreSubmitDTO dto = new HrPerfScoreSubmitDTO();
        dto.setSubmit(true);
        dto.setItems(items.stream().map(i -> {
            HrPerfScoreSubmitDTO.ItemScore in = new HrPerfScoreSubmitDTO.ItemScore();
            in.setItemId(i.getId());
            in.setScore(BigDecimal.valueOf(value));
            return in;
        }).toList());
        return dto;
    }

    // ==================== 计分 ====================

    @Test
    @DisplayName("总分按权重加权计算，而非取平均或采用前端值")
    void totalIsWeightedNotPlainAverage() {
        loginAs(user(EMPLOYEE_ID, "MF00030", "陳小明"));
        HrPerfAssessment entity = assessment(HrPerfConstants.A_SELF_PENDING);
        when(assessmentMapper.selectById(500L)).thenReturn(entity);
        // 权重 70/30，两项都 80 与 100：平均是 90，加权应为 86
        List<HrPerfScoreItem> list = items(BigDecimal.valueOf(70), BigDecimal.valueOf(30));
        when(scoreItemMapper.selectList(any())).thenReturn(list);

        service.submitScore(500L, weightedFixture(list));

        assertEquals(0, new BigDecimal("86.00").compareTo(entity.getSelfScore()),
                "期望加权 86.00，实际 " + entity.getSelfScore());
        assertEquals(HrPerfConstants.A_SUPERVISOR_PENDING, entity.getStatus());
    }

    private HrPerfScoreSubmitDTO weightedFixture(List<HrPerfScoreItem> list) {
        HrPerfScoreSubmitDTO dto = new HrPerfScoreSubmitDTO();
        dto.setSubmit(true);
        List<HrPerfScoreSubmitDTO.ItemScore> in = new ArrayList<>();
        int[] values = {80, 100};
        for (int i = 0; i < list.size(); i++) {
            HrPerfScoreSubmitDTO.ItemScore one = new HrPerfScoreSubmitDTO.ItemScore();
            one.setItemId(list.get(i).getId());
            one.setScore(BigDecimal.valueOf(values[i]));
            in.add(one);
        }
        dto.setItems(in);
        return dto;
    }

    @Test
    @DisplayName("得分越界、权重合计为 0 都必须拒绝")
    void invalidScoreAndZeroWeightRejected() {
        loginAs(user(EMPLOYEE_ID, "MF00030", "陳小明"));
        when(assessmentMapper.selectById(500L)).thenReturn(assessment(HrPerfConstants.A_SELF_PENDING));
        when(scoreItemMapper.selectList(any())).thenReturn(items(BigDecimal.valueOf(70), BigDecimal.valueOf(30)));

        assertThrows(BusinessException.class, () -> service.submitScore(500L, score(1L, 101)));

        List<HrPerfScoreItem> zeroWeight = items(BigDecimal.ZERO, BigDecimal.ZERO);
        when(scoreItemMapper.selectList(any())).thenReturn(zeroWeight);
        assertThrows(BusinessException.class, () -> service.submitScore(500L, scores(zeroWeight, 80)));
    }

    @Test
    @DisplayName("部分评分只暂存不推进状态，缺少任一指标则不得提交")
    void partialSaveDoesNotAdvanceState() {
        loginAs(user(EMPLOYEE_ID, "MF00030", "陳小明"));
        HrPerfAssessment entity = assessment(HrPerfConstants.A_SELF_PENDING);
        when(assessmentMapper.selectById(500L)).thenReturn(entity);
        List<HrPerfScoreItem> list = items(BigDecimal.valueOf(50), BigDecimal.valueOf(50));
        when(scoreItemMapper.selectList(any())).thenReturn(list);

        HrPerfScoreSubmitDTO draft = score(1L, 90);
        draft.setSubmit(false);
        service.submitScore(500L, draft);
        assertEquals(HrPerfConstants.A_SELF_PENDING, entity.getStatus());
        assertNull(entity.getSelfAt());

        assertThrows(BusinessException.class, () -> service.submitScore(500L, score(2L, 90)));
    }

    // ==================== 状态机 ====================

    @Test
    @DisplayName("阶段顺序不可跳过：自评未完成时上级评被拒")
    void supervisorCannotScoreBeforeSelf() {
        loginAs(user(EVALUATOR_ID, "MF00031", "王大軍"));
        when(assessmentMapper.selectById(500L)).thenReturn(assessment(HrPerfConstants.A_SELF_PENDING));
        when(scoreItemMapper.selectList(any())).thenReturn(items(BigDecimal.valueOf(100)));

        assertThrows(BusinessException.class, () -> service.submitScore(500L, score(1L, 88)));
        verify(assessmentMapper, never()).updateById(any(HrPerfAssessment.class));
    }

    @Test
    @DisplayName("已确认单据不可再评分")
    void confirmedIsFrozen() {
        loginAs(user(EMPLOYEE_ID, "MF00030", "陳小明"));
        when(assessmentMapper.selectById(500L)).thenReturn(assessment(HrPerfConstants.A_CONFIRMED));

        assertThrows(BusinessException.class, () -> service.submitScore(500L, score(1L, 88)));
    }

    @Test
    @DisplayName("审批中的单据不得改判；重复提交同一指标不得掩盖漏评")
    void batchUnderApprovalIsFrozenAndDuplicateScoresDoNotPass() {
        loginAs(user(1L, "MF00001", "管理員"));
        HrPerfAssessment submitted = assessment(HrPerfConstants.A_CONFIRM_PENDING);
        when(assessmentMapper.selectById(500L)).thenReturn(submitted);
        BusinessException e = assertThrows(BusinessException.class,
                () -> service.calibrate(500L, new BigDecimal("90"), "A", "審批中想改"));
        assertTrue(e.getMessage().contains("審批中不可改判"), "实际: " + e.getMessage());

        // 两条明细只对一条打分并用同一 id 凑数：不得被当作“已评完”放行
        loginAs(user(EMPLOYEE_ID, "MF00030", "陳小明"));
        HrPerfAssessment selfPending = assessment(HrPerfConstants.A_SELF_PENDING);
        when(assessmentMapper.selectById(500L)).thenReturn(selfPending);
        when(scoreItemMapper.selectList(any())).thenReturn(items(BigDecimal.valueOf(50), BigDecimal.valueOf(50)));
        HrPerfScoreSubmitDTO cheat = new HrPerfScoreSubmitDTO();
        cheat.setSubmit(true);
        cheat.setItems(List.of(scoreItem(1L, 90), scoreItem(1L, 90)));

        assertThrows(BusinessException.class, () -> service.submitScore(500L, cheat));
        assertEquals(HrPerfConstants.A_SELF_PENDING, selfPending.getStatus());
    }

    // ==================== 数据范围与敏感字段 ====================

    @Test
    @DisplayName("结果未确认前，本人看不到上级评分与等级；无关人一律 403")
    void sensitiveFieldsHiddenUntilConfirmed() {
        HrPerfAssessment pending = assessment(HrPerfConstants.A_CALIBRATION_PENDING);
        pending.setSupervisorScore(new BigDecimal("77.00"));
        pending.setFinalGrade("B");
        when(assessmentMapper.selectById(500L)).thenReturn(pending);
        when(scoreItemMapper.selectList(any())).thenReturn(items(BigDecimal.valueOf(100)));

        loginAs(user(EMPLOYEE_ID, "MF00030", "陳小明"));
        HrPerfAssessmentVO selfView = service.getMyAssessment(500L);
        assertNull(selfView.getSupervisorScore(), "未确认前不得暴露上级评分");
        assertNull(selfView.getFinalGrade());

        loginAs(user(STRANGER_ID, "MF00032", "路人甲"));
        PermissionDeniedException denied = assertThrows(PermissionDeniedException.class,
                () -> service.getMyAssessment(500L));
        assertTrue(denied.getMessage().contains("本人的資料"), "实际: " + denied.getMessage());

        loginAs(user(EMPLOYEE_ID, "MF00030", "陳小明"));
        HrPerfAssessment confirmed = assessment(HrPerfConstants.A_CONFIRMED);
        confirmed.setFinalScore(new BigDecimal("77.00"));
        confirmed.setFinalGrade("B");
        when(assessmentMapper.selectById(500L)).thenReturn(confirmed);
        assertEquals("B", service.getMyAssessment(500L).getFinalGrade(), "确认后结果对本人开放");
    }

    @Test
    @DisplayName("三层数据范围：HR 看全量、评估人看名下、本人只看自己且未确认前裁字段")
    void threeTierDataScopeOnAssessmentDetail() {
        HrPerfAssessment pending = assessment(HrPerfConstants.A_CALIBRATION_PENDING);
        pending.setSupervisorScore(new BigDecimal("77.00"));
        when(assessmentMapper.selectById(500L)).thenReturn(pending);
        when(scoreItemMapper.selectList(any())).thenReturn(items(BigDecimal.valueOf(100)));

        // HR（持校准菜单）可看上级分
        loginAs(user(1L, "MF00001", "管理員"));
        assertEquals(new BigDecimal("77.00"), service.getAssessment(500L).getSupervisorScore());

        // 评估人可看自己打过的分
        loginAs(user(EVALUATOR_ID, "MF00031", "王大軍"));
        assertEquals(new BigDecimal("77.00"), service.getAssessment(500L).getSupervisorScore());

        // 无校准/评分菜单的普通员工走自助口径，上级分被服务端剔除
        loginAs(user(EMPLOYEE_ID, "MF00030", "陳小明"));
        lenient().when(permissionService.hasPermission(any(), eq(HrPerfConstants.MENU_CALIBRATION), anyString()))
                .thenReturn(false);
        lenient().when(permissionService.hasPermission(any(), eq(HrPerfConstants.MENU_REVIEW), anyString()))
                .thenReturn(false);
        assertNull(service.getMyAssessment(500L).getSupervisorScore());
    }

    @Test
    @DisplayName("工作台列表不裁上级评分：那就是评估人自己写的数据")
    void reviewListKeepsSupervisorScores() {
        loginAs(user(EVALUATOR_ID, "MF00031", "王大軍"));
        HrPerfAssessment done = assessment(HrPerfConstants.A_CALIBRATION_PENDING);
        done.setSupervisorScore(new BigDecimal("82.00"));
        Page<HrPerfAssessment> paged = new Page<>(1, 20, 1);
        paged.setRecords(List.of(done));
        when(assessmentMapper.selectPage(any(), any())).thenReturn(paged);

        List<HrPerfAssessmentVO> records = service.pageMyReviews(1, 20, null, null).getRecords();
        assertEquals(1, records.size());
        assertEquals(new BigDecimal("82.00"), records.get(0).getSupervisorScore(),
                "评分工作台裁掉上级分会让评估人看不到自己打过的分");
    }

    @Test
    @DisplayName("已确认后结果对本人开放（列表与详情同口径），明细不泄露上级分")
    void confirmedResultsAreVisibleToOwner() {
        loginAs(user(EMPLOYEE_ID, "MF00030", "陳小明"));
        lenient().when(permissionService.hasPermission(any(), anyString(), anyString())).thenReturn(false);
        lenient().when(permissionService.hasPermission(any(), eq(HrPerfConstants.MENU_SELF), anyString()))
                .thenReturn(true);

        HrPerfAssessment confirmed = assessment(HrPerfConstants.A_CONFIRMED);
        confirmed.setSupervisorScore(new BigDecimal("82.00"));
        confirmed.setFinalScore(new BigDecimal("85.00"));
        confirmed.setFinalGrade("A");
        when(assessmentMapper.selectById(500L)).thenReturn(confirmed);
        when(planMapper.selectById(90L)).thenReturn(planNamed(90L, "2026Q3 考核"));
        HrPerfScoreItem item = items(BigDecimal.valueOf(60)).get(0);
        item.setSelfScore(new BigDecimal("80.00"));
        item.setSupervisorScore(new BigDecimal("90.00"));
        item.setFinalScore(new BigDecimal("90.00"));
        when(scoreItemMapper.selectList(any())).thenReturn(List.of(item));

        HrPerfAssessmentVO detail = service.getMyAssessment(500L);
        assertEquals(new BigDecimal("82.00"), detail.getSupervisorScore(), "已确认后上级评分对本人开放");
        assertEquals("A", detail.getFinalGrade());
        assertEquals("2026Q3 考核", detail.getPlanName(), "详情必须带计划名，不能只靠列表补");
        assertEquals(new BigDecimal("90.00"), detail.getItems().get(0).getSupervisorScore());

        // 未确认：表头与指标行都得裁掉上级分，否则能从明细反推
        HrPerfAssessment pending = assessment(HrPerfConstants.A_CALIBRATION_PENDING);
        pending.setSupervisorScore(new BigDecimal("82.00"));
        when(assessmentMapper.selectById(500L)).thenReturn(pending);
        HrPerfAssessmentVO blind = service.getMyAssessment(500L);
        assertNull(blind.getSupervisorScore());
        assertNull(blind.getItems().get(0).getSupervisorScore(), "指标行也得裁掉上级分");
        assertNull(blind.getItems().get(0).getFinalScore());
    }

    private static HrPerfPlan planNamed(long id, String name) {
        HrPerfPlan plan = new HrPerfPlan();
        plan.setId(id);
        plan.setName(name);
        return plan;
    }

    @Test
    @DisplayName("评估人只能评自己名下的单据")
    void evaluatorMustBeAssigned() {
        loginAs(user(STRANGER_ID, "MF00032", "路人甲"));
        when(assessmentMapper.selectById(500L)).thenReturn(assessment(HrPerfConstants.A_SUPERVISOR_PENDING));

        assertThrows(PermissionDeniedException.class, () -> service.submitScore(500L, score(1L, 90)));
    }

    // ==================== 发起范围与评估人指派 ====================

    private HrPerfPlanLaunchDTO launchDTO() {
        HrPerfPlanLaunchDTO dto = new HrPerfPlanLaunchDTO();
        dto.setCycleId(80L);
        dto.setTemplateId(81L);
        dto.setName("2026Q3 運營考核");
        dto.setDeptIds(List.of(DEPT_ID));
        dto.setSelfStart(LocalDate.of(2026, 7, 1));
        dto.setSelfEnd(LocalDate.of(2026, 7, 10));
        dto.setSupStart(LocalDate.of(2026, 7, 11));
        dto.setSupEnd(LocalDate.of(2026, 7, 20));
        dto.setCalibEnd(LocalDate.of(2026, 7, 25));
        return dto;
    }

    private void stubLaunchContext(HrPerfTemplate template, List<SysUser> users, SysDepartment dept) {
        HrPerfCycle cycle = new HrPerfCycle();
        cycle.setId(80L);
        cycle.setStatus(HrPerfConstants.CYCLE_PUBLISHED);
        cycle.setCycleType(HrPerfConstants.CYCLE_QUARTER);
        HrPerfCycleMapper cycleMapper = mock(HrPerfCycleMapper.class);
        when(cycleMapper.selectById(80L)).thenReturn(cycle);
        // 通过反射式重建代价高，这里直接改写 service 的周期依赖
        service = new HrPerfServiceImpl(cycleMapper, templateMapper, indicatorStub(template), planMapper,
                assessmentMapper, scoreItemMapper, sysUserMapper, sysDepartmentMapper,
                mock(OaRequestService.class), seqStub(), operatorResolver, permissionService, reportService);
        when(templateMapper.selectById(81L)).thenReturn(template);
        when(sysUserMapper.selectList(any())).thenReturn(users);
        when(sysDepartmentMapper.selectList(any())).thenReturn(List.of(dept));
        when(sysDepartmentMapper.selectBatchIds(any())).thenReturn(List.of(dept));
    }

    private HrPerfIndicatorMapper indicatorStub(HrPerfTemplate template) {
        HrPerfIndicatorMapper mapper = mock(HrPerfIndicatorMapper.class);
        HrPerfIndicator one = new HrPerfIndicator();
        one.setId(900L);
        one.setTemplateId(template.getId());
        one.setName("业绩达成");
        one.setWeight(new BigDecimal("100"));
        when(mapper.selectList(any())).thenReturn(List.of(one));
        return mapper;
    }

    private BizSeqService seqStub() {
        BizSeqService seq = mock(BizSeqService.class);
        lenient().when(seq.next(anyString())).thenAnswer(inv -> inv.getArgument(0) + "-0001");
        return seq;
    }

    @Test
    @DisplayName("部门负责人姓名唯一命中才自动指派，歧义或查不到一律进待指派清单")
    void evaluatorAssignmentRefusesAmbiguousNameMatch() {
        loginAs(user(1L, "MF00001", "管理員"));
        HrPerfTemplate template = new HrPerfTemplate();
        template.setId(81L);
        template.setStatus(1);
        template.setWeightSum(100);
        template.setGradeScheme("[{\"code\":\"A\",\"minScore\":80},{\"code\":\"B\",\"minScore\":60}]");
        SysDepartment dept = new SysDepartment();
        dept.setId(DEPT_ID);
        dept.setLeader("王大軍");

        // 部门内只有一个王大軍：员工自动指派给他，但负责人本人本部门无上级，落待指派
        SysUser boss = user(EVALUATOR_ID, "MF00031", "王大軍");
        stubLaunchContext(template, List.of(user(EMPLOYEE_ID, "MF00030", "陳小明"), boss), dept);
        Map<String, Object> ok = service.previewLaunch(launchDTO());
        assertEquals(2, ok.get("total"));
        assertEquals(1, ok.get("unassigned"), "唯一同名负责人可指派，仅剩负责人本人待指派");
        assertEquals(List.of(String.valueOf(EVALUATOR_ID)), unassignedIds(ok), "待指派必须是负责人本人");

        // 部门内出现两个同名 -> 无法判定哪个是负责人，整个人群都不指派（不得拿同名同事凑数）
        SysUser sameName = user(33L, "MF00033", "王大軍");
        stubLaunchContext(template, List.of(user(EMPLOYEE_ID, "MF00030", "陳小明"), boss, sameName), dept);
        Map<String, Object> ambiguous = service.previewLaunch(launchDTO());
        assertEquals(3, ambiguous.get("unassigned"), "同名歧义时不得猜人");

        // 负责人已离职（不在名单里）-> 同样落待指派
        SysDepartment ghostDept = new SysDepartment();
        ghostDept.setId(DEPT_ID);
        ghostDept.setLeader("已離職主管");
        stubLaunchContext(template, List.of(user(EMPLOYEE_ID, "MF00030", "陳小明")), ghostDept);
        Map<String, Object> gone = service.previewLaunch(launchDTO());
        assertEquals(1, gone.get("unassigned"));

        // 未设负责人 -> 全部待指派，且预览必须给出原因供 HR 处置
        SysDepartment noLeader = new SysDepartment();
        noLeader.setId(DEPT_ID);
        stubLaunchContext(template, List.of(user(EMPLOYEE_ID, "MF00030", "陳小明"), boss), noLeader);
        Map<String, Object> none = service.previewLaunch(launchDTO());
        assertEquals(2, none.get("unassigned"));
        assertTrue(String.valueOf(firstReason(none)).contains("歧義"), "实际: " + firstReason(none));
    }

    @SuppressWarnings("unchecked")
    private static List<String> unassignedIds(Map<String, Object> preview) {
        return ((List<Map<String, Object>>) preview.get("unassignedList")).stream()
                .map(m -> String.valueOf(m.get("userId"))).toList();
    }

    @SuppressWarnings("unchecked")
    private static Object firstReason(Map<String, Object> preview) {
        List<Map<String, Object>> list = (List<Map<String, Object>>) preview.get("unassignedList");
        return list.isEmpty() ? null : list.get(0).get("reason");
    }

    @Test
    @DisplayName("强制分布超编：不放行则拒绝提交，放行必须带理由并留痕")
    void distributionGateIsSoftButAudited() {
        loginAs(user(1L, "MF00001", "管理員"));
        HrPerfPlan plan = new HrPerfPlan();
        plan.setId(90L);
        plan.setStatus(HrPerfConstants.PLAN_RUNNING);
        plan.setName("2026Q3 運營考核");
        plan.setReqNo("PP202609280001");
        plan.setTemplateId(81L);
        when(planMapper.selectById(90L)).thenReturn(plan);
        HrPerfAssessment ready = assessment(HrPerfConstants.A_CALIBRATION_PENDING);
        ready.setSupervisorScore(new BigDecimal("95.00"));
        when(assessmentMapper.selectList(any())).thenReturn(List.of(ready));
        HrPerfReportVO.GradeCount over = new HrPerfReportVO.GradeCount();
        over.setGrade("S");
        over.setGapNote("超出建议占比上限 1 人（上限 0 人）");
        when(reportService.distributionGap(90L)).thenReturn(List.of(over));

        BusinessException blocked = assertThrows(BusinessException.class,
                () -> service.submitConfirm(90L, false, null));
        assertTrue(blocked.getMessage().contains("建议占比"), "实际: " + blocked.getMessage());

        // 例外放行但不写理由：不能“静默超标”
        assertThrows(BusinessException.class, () -> service.submitConfirm(90L, true, "  "));
        verify(reportService, never()).logDistributionWaiver(any(HrPerfPlan.class), anyString());

        // 理由齐备时例外放行应能提交，并把例外本身写进留痕
        service.submitConfirm(90L, true, "新并入团队结构上凑不满五档");
        verify(reportService).logDistributionWaiver(eq(plan), eq("新并入团队结构上凑不满五档"));
    }

    // ==================== 整批提交与校准 ====================

    @Test
    @DisplayName("整批提交前必须完成评分且已指派评估人")
    void submitConfirmPreconditions() {
        loginAs(user(1L, "MF00001", "管理員"));
        HrPerfPlan plan = new HrPerfPlan();
        plan.setId(90L);
        plan.setStatus(HrPerfConstants.PLAN_RUNNING);
        plan.setName("2026Q3 運營考核");
        plan.setReqNo("PP202609280001");
        plan.setTemplateId(81L);
        when(planMapper.selectById(90L)).thenReturn(plan);

        HrPerfAssessment notScored = assessment(HrPerfConstants.A_SUPERVISOR_PENDING);
        when(assessmentMapper.selectList(any())).thenReturn(List.of(notScored));
        BusinessException e1 = assertThrows(BusinessException.class, () -> service.submitConfirm(90L, false, null));
        assertTrue(e1.getMessage().contains("未完成"), "实际: " + e1.getMessage());

        HrPerfAssessment noEvaluator = assessment(HrPerfConstants.A_CALIBRATION_PENDING);
        noEvaluator.setEvaluatorUserId(null);
        when(assessmentMapper.selectList(any())).thenReturn(List.of(noEvaluator));
        BusinessException e2 = assertThrows(BusinessException.class, () -> service.submitConfirm(90L, false, null));
        assertTrue(e2.getMessage().contains("評估人"), "实际: " + e2.getMessage());
    }

    @Test
    @DisplayName("改判必须写理由，等级必须来自模板方案")
    void calibrationRequiresReasonAndKnownGrade() {
        loginAs(user(1L, "MF00001", "管理員"));
        HrPerfAssessment entity = assessment(HrPerfConstants.A_CALIBRATION_PENDING);
        when(assessmentMapper.selectById(500L)).thenReturn(entity);
        HrPerfTemplate template = new HrPerfTemplate();
        template.setId(81L);
        template.setGradeScheme("[{\"code\":\"A\",\"minScore\":80}]");
        when(templateMapper.selectById(81L)).thenReturn(template);
        HrPerfPlan plan = new HrPerfPlan();
        plan.setId(90L);
        plan.setTemplateId(81L);
        when(planMapper.selectById(90L)).thenReturn(plan);
        when(scoreItemMapper.selectList(any())).thenReturn(items(BigDecimal.valueOf(100)));

        assertThrows(BusinessException.class,
                () -> service.calibrate(500L, new BigDecimal("85"), "A", "  "));
        assertThrows(BusinessException.class,
                () -> service.calibrate(500L, new BigDecimal("85"), "S", "模板无此等级"));

        service.calibrate(500L, new BigDecimal("85"), "A", "跨部门拉齐");
        assertEquals("A", entity.getCalibratedGrade());
        assertEquals("跨部门拉齐", entity.getCalibratedReason());
        // 改判必须同时写留痕，否则“谁改的”依旧查不到
        verify(reportService).logCalibration(eq(entity), eq(HrPerfConstants.LOG_CALIBRATE),
                any(), any(), eq(new BigDecimal("85")), eq("A"), eq("跨部门拉齐"), any());
    }

    @Test
    @DisplayName("改派评估人也必须留痕：谁打分是事后要追责的事实")
    void reassignIsAudited() {
        loginAs(user(1L, "MF00001", "管理員"));
        HrPerfAssessment entity = assessment(HrPerfConstants.A_CALIBRATION_PENDING);
        when(assessmentMapper.selectById(500L)).thenReturn(entity);
        when(sysUserMapper.selectById(EVALUATOR_ID)).thenReturn(user(EVALUATOR_ID, "MF00031", "王大軍"));

        service.reassign(500L, EVALUATOR_ID);

        assertEquals("王大軍", entity.getEvaluatorName());
        verify(reportService).logCalibration(eq(entity), eq(HrPerfConstants.LOG_REASSIGN),
                isNull(), isNull(), isNull(), isNull(), contains("王大軍"), isNull());
    }

    // ==================== 模板校验 ====================

    @Test
    @DisplayName("模板指标权重合计必须等于设定值，等级下限不得重复")
    void templateValidationGuards() {
        loginAs(user(1L, "MF00001", "管理員"));
        HrPerfTemplateSaveDTO dto = new HrPerfTemplateSaveDTO();
        dto.setName("運營模板");
        dto.setWeightSum(100);
        HrPerfTemplateSaveDTO.IndicatorItem ind = new HrPerfTemplateSaveDTO.IndicatorItem();
        ind.setName("GMV 達成率");
        ind.setWeight(new BigDecimal("60"));
        dto.setIndicators(List.of(ind));
        HrPerfTemplateSaveDTO.GradeRule g1 = grade("A", 80);
        HrPerfTemplateSaveDTO.GradeRule g2 = grade("B", 60);
        dto.setGrades(List.of(g1, g2));

        BusinessException weightErr = assertThrows(BusinessException.class, () -> service.saveTemplate(null, dto));
        assertTrue(weightErr.getMessage().contains("權重"), "实际: " + weightErr.getMessage());

        // 权重补齐后，两个等级共用同一下限（映射会产生歧义）必须被拒
        dto.setIndicators(List.of(ind, weightIndicator("客诉率", 40)));
        dto.setGrades(List.of(grade("S", 90), grade("A", 90)));
        BusinessException dupErr = assertThrows(BusinessException.class, () -> service.saveTemplate(null, dto));
        assertTrue(dupErr.getMessage().contains("重複"), "实际: " + dupErr.getMessage());

        // 等级代码重复同样拒绝
        dto.setGrades(List.of(grade("A", 80), grade("A", 60)));
        assertThrows(BusinessException.class, () -> service.saveTemplate(null, dto));

        // 下限越界拒绝，而 S→D 降序录入（前端自然顺序）不得被拒
        dto.setGrades(List.of(grade("S", 120)));
        assertThrows(BusinessException.class, () -> service.saveTemplate(null, dto));
        dto.setGrades(List.of(grade("S", 90), grade("A", 80), grade("B", 60)));
        assertDoesNotThrow(() -> service.saveTemplate(null, dto), "等级按降序录入是自然写法，不应要求递增");
    }

    private static HrPerfTemplateSaveDTO.GradeRule grade(String code, int minScore) {
        HrPerfTemplateSaveDTO.GradeRule g = new HrPerfTemplateSaveDTO.GradeRule();
        g.setCode(code);
        g.setMinScore(minScore);
        return g;
    }

    private static HrPerfTemplateSaveDTO.IndicatorItem weightIndicator(String name, int weight) {
        HrPerfTemplateSaveDTO.IndicatorItem i = new HrPerfTemplateSaveDTO.IndicatorItem();
        i.setName(name);
        i.setWeight(BigDecimal.valueOf(weight));
        return i;
    }
}
