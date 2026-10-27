package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.RdmResourceDTO;
import com.mftb.admin.dto.RdmResourceVO;
import com.mftb.admin.entity.RdmProjectMember;
import com.mftb.admin.entity.RdmRequirement;
import com.mftb.admin.entity.RdmResourceMember;
import com.mftb.admin.entity.RdmTaskTypeConfig;
import com.mftb.admin.entity.RdmTestBatch;
import com.mftb.admin.entity.RdmWorkCalendar;
import com.mftb.admin.entity.RdmWorkTask;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.RdmProjectMemberMapper;
import com.mftb.admin.mapper.RdmRequirementMapper;
import com.mftb.admin.mapper.RdmResourceMemberMapper;
import com.mftb.admin.mapper.RdmTestBatchMapper;
import com.mftb.admin.mapper.RdmWorkCalendarMapper;
import com.mftb.admin.mapper.RdmWorkTaskMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.RdmAccessGuard;
import com.mftb.admin.service.RdmDeliveryService;
import com.mftb.admin.service.RdmIdempotentService;
import com.mftb.admin.service.RdmRequirementService;
import com.mftb.admin.service.RdmTaskTypeService;
import com.mftb.admin.service.RdmTestBatchService;
import com.mftb.admin.service.RdmWorkingDayCalculator;
import com.mftb.admin.util.OperatorResolver;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.function.Supplier;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 团队负载聚合测试（阶段 B-1）。
 *
 * <p>锁死四类结论：
 * <ol>
 *   <li>人员全集 = 在途项目成员 ∪ 未完成任务负责人 ∪ 在途需求产品经理 ∪ 在途批次测试人员（没任务的人也在）；</li>
 *   <li>无全量数据范围的人只返回本人（负载页不能变成打探绩效的入口）；</li>
 *   <li>有产品需求/测试批次件数却无个人工时任务的人标 data_incomplete，不显示 0% 冒充空闲；</li>
 *   <li>日期区间越界（>92 天 / start>end）被拒绝。</li>
 * </ol>
 *
 * <p>固定查询窗口 2026-10-19（周一）~ 2026-11-01（周日），含 10 个工作日 × 8h = 80h 容量，
 * 避免用 LocalDate.now() 受周末/当前日期影响导致断言漂移。
 */
class RdmResourceServiceTest {

    /** 纯 Mockito 环境无 MyBatis-Plus 实体元数据，.select(Entity::field) 投影与 lambda 条件需先建 TableInfo 缓存 */
    @BeforeAll
    static void initTableInfo() {
        MapperBuilderAssistant assistant = new MapperBuilderAssistant(new MybatisConfiguration(), "");
        TableInfoHelper.initTableInfo(assistant, RdmWorkTask.class);
        TableInfoHelper.initTableInfo(assistant, RdmRequirement.class);
        TableInfoHelper.initTableInfo(assistant, RdmTestBatch.class);
        TableInfoHelper.initTableInfo(assistant, RdmProjectMember.class);
        TableInfoHelper.initTableInfo(assistant, RdmWorkCalendar.class);
    }

    private RdmWorkTaskMapper taskMapper;
    private RdmRequirementMapper requirementMapper;
    private RdmTestBatchMapper testBatchMapper;
    private RdmProjectMemberMapper projectMemberMapper;
    private RdmResourceMemberMapper resourceMemberMapper;
    private SysUserMapper userMapper;
    private RdmAccessGuard accessGuard;
    private OperatorResolver operatorResolver;
    private JdbcTemplate jdbcTemplate;
    private RdmDeliveryService deliveryService;
    private RdmIdempotentService idempotentService;
    private RdmRequirementService requirementService;
    private RdmTestBatchService testBatchService;
    private RdmTaskTypeService taskTypeService;
    private RdmResourceServiceImpl service;

    private static final String FROM = "2026-10-19";
    private static final String TO = "2026-11-01";

    @BeforeEach
    void setUp() {
        taskMapper = mock(RdmWorkTaskMapper.class);
        requirementMapper = mock(RdmRequirementMapper.class);
        testBatchMapper = mock(RdmTestBatchMapper.class);
        projectMemberMapper = mock(RdmProjectMemberMapper.class);
        resourceMemberMapper = mock(RdmResourceMemberMapper.class);
        userMapper = mock(SysUserMapper.class);
        accessGuard = mock(RdmAccessGuard.class);
        operatorResolver = mock(OperatorResolver.class);
        jdbcTemplate = mock(JdbcTemplate.class);
        deliveryService = mock(RdmDeliveryService.class);
        idempotentService = mock(RdmIdempotentService.class);
        requirementService = mock(RdmRequirementService.class);
        testBatchService = mock(RdmTestBatchService.class);
        taskTypeService = mock(RdmTaskTypeService.class);
        // 任务类型字典 stub：categoryOf 按内置三桶兑底，保证分桶 switch 不落 null
        when(taskTypeService.categoryOf(anyString())).thenAnswer(inv -> builtinCategoryOf(inv.getArgument(0)));
        RdmWorkCalendarMapper calendarMapper = mock(RdmWorkCalendarMapper.class);
        when(calendarMapper.selectList(any())).thenReturn(List.of());
        // 名册默认空：B-2 名册表尚未纳入人时，聚合仍走项目成员/单据负责人（不影响 B-1 用例）
        when(resourceMemberMapper.selectList(any())).thenReturn(List.of());

        service = new RdmResourceServiceImpl(taskMapper, requirementMapper, testBatchMapper,
                projectMemberMapper, resourceMemberMapper, userMapper, accessGuard, operatorResolver,
                new RdmWorkingDayCalculator(calendarMapper), jdbcTemplate, deliveryService, idempotentService,
                requirementService, testBatchService, taskTypeService);

        SysUser current = user(10L, "张三", "MF00010", "研发一部");
        when(operatorResolver.currentUser()).thenReturn(current);
    }

    private static SysUser user(Long id, String name, String empId, String dept) {
        SysUser u = new SysUser();
        u.setId(id);
        u.setName(name);
        u.setEmpId(empId);
        u.setDepartment(dept);
        u.setStatus(1);
        return u;
    }

    private static RdmProjectMember member(Long userId, String roleCode) {
        RdmProjectMember m = new RdmProjectMember();
        m.setUserId(userId);
        m.setRoleCode(roleCode);
        return m;
    }

    private static RdmWorkTask task(Long ownerId, String taskType, String hours, String status) {
        RdmWorkTask t = new RdmWorkTask();
        t.setOwnerUserId(ownerId);
        t.setTaskType(taskType);
        t.setPlanHours(hours == null ? null : new BigDecimal(hours));
        t.setStatus(status);
        t.setPlanStartDate(LocalDate.parse(FROM));
        t.setPlanFinishDate(LocalDate.parse("2026-10-23"));
        return t;
    }

    private static RdmRequirement req(Long pmId, String status) {
        RdmRequirement r = new RdmRequirement();
        r.setAssigneePmUserId(pmId);
        r.setStatus(status);
        return r;
    }

    private static RdmTestBatch batch(Long testLeadId, String status) {
        RdmTestBatch b = new RdmTestBatch();
        b.setTestLeadUserId(testLeadId);
        b.setStatus(status);
        b.setExecutorUserIdsJson("[]");
        return b;
    }

    /** 装配「全员」场景：项目成员10 + 研发任务10 + 设计任务11 + 产品需求12 + 测试批次13 */
    private void stubAllRoles() {
        when(projectMemberMapper.selectList(any())).thenReturn(List.of(member(10L, "dev")));
        when(taskMapper.selectList(any())).thenReturn(List.of(
                task(10L, "backend", "16", "doing"),
                task(11L, "design", "8", "todo")));
        when(requirementMapper.selectList(any())).thenReturn(List.of(req(12L, "developing")));
        when(testBatchMapper.selectList(any())).thenReturn(List.of(batch(13L, "pending")));
        when(userMapper.selectBatchIds(any())).thenReturn(List.of(
                user(10L, "张三", "MF00010", "研发一部"),
                user(11L, "李四", "MF00011", "研发一部"),
                user(12L, "王五", "MF00012", "产品部"),
                user(13L, "赵六", "MF00013", "测试部")));
    }

    @Test
    @DisplayName("人员全集合并项目成员/任务/需求/批次负责人，且各岗位件数与工时正确归类")
    void aggregatesAllRolesIntoPeople() {
        when(accessGuard.canSeeAll(any())).thenReturn(true);
        stubAllRoles();

        RdmResourceVO.Workload vo = service.workload(FROM, TO);

        assertEquals(4, vo.getPeople().size(), "应含 10/11/12/13 四人");
        assertEquals(4, vo.getSummary().getTotal());

        RdmResourceVO.Person dev = vo.getPeople().stream().filter(p -> p.getUserId() == 10L).findFirst().orElseThrow();
        assertEquals(1, dev.getDevTasks(), "backend 任务计入研发");
        assertTrue(dev.getTotalPlanned().compareTo(BigDecimal.ZERO) > 0, "研发任务有计划工时");
        assertTrue(dev.getRoles().contains(RdmResourceVO.ROLE_DEV));

        RdmResourceVO.Person designer = vo.getPeople().stream().filter(p -> p.getUserId() == 11L).findFirst().orElseThrow();
        assertEquals(1, designer.getDesignTasks(), "design 任务计入设计");
        assertTrue(designer.getRoles().contains(RdmResourceVO.ROLE_DESIGNER));

        RdmResourceVO.Person pm = vo.getPeople().stream().filter(p -> p.getUserId() == 12L).findFirst().orElseThrow();
        assertEquals(1, pm.getProductReqs(), "在途需求计入产品件数");
        assertTrue(pm.getRoles().contains(RdmResourceVO.ROLE_PRODUCT));

        RdmResourceVO.Person qa = vo.getPeople().stream().filter(p -> p.getUserId() == 13L).findFirst().orElseThrow();
        assertEquals(1, qa.getTestBatches(), "在途批次计入测试件数");
        assertTrue(qa.getRoles().contains(RdmResourceVO.ROLE_QA));
    }

    @Test
    @DisplayName("有产品需求/测试批次件数却无个人工时任务的人标为数据待完善，不显示 0% 空闲")
    void marksCountOnlyWorkAsDataIncomplete() {
        when(accessGuard.canSeeAll(any())).thenReturn(true);
        stubAllRoles();

        RdmResourceVO.Workload vo = service.workload(FROM, TO);

        RdmResourceVO.Person pm = vo.getPeople().stream().filter(p -> p.getUserId() == 12L).findFirst().orElseThrow();
        assertEquals(RdmResourceVO.LOAD_DATA_INCOMPLETE, pm.getLoadStatus(), "产品只有件数无工时应标待完善");
        assertNotNull(pm.getDataIncompleteReason());
        assertEquals(0, pm.getTotalPlanned().compareTo(BigDecimal.ZERO), "无工时任务则计划工时为 0");

        RdmResourceVO.Person qa = vo.getPeople().stream().filter(p -> p.getUserId() == 13L).findFirst().orElseThrow();
        assertEquals(RdmResourceVO.LOAD_DATA_INCOMPLETE, qa.getLoadStatus(), "测试批次只有件数无工时应标待完善");

        // 统计卡跟随：2 人数据待完善（产品 + 测试）
        assertEquals(2, vo.getSummary().getDataIncomplete());
    }

    @Test
    @DisplayName("无全量数据范围的人只返回本人，负载页不变成打探绩效的入口")
    void convergesToSelfWithoutViewAll() {
        when(accessGuard.canSeeAll(any())).thenReturn(false);
        stubAllRoles();

        RdmResourceVO.Workload vo = service.workload(FROM, TO);

        assertTrue(vo.getSelfOnly(), "应标记 selfOnly");
        assertEquals(1, vo.getPeople().size(), "只返回本人");
        assertEquals(10L, vo.getPeople().get(0).getUserId());
    }

    @Test
    @DisplayName("日期区间越界被拒绝：超过 92 天 / 开始晚于结束")
    void rejectsInvalidDateRange() {
        when(accessGuard.canSeeAll(any())).thenReturn(true);
        stubAllRoles();

        BusinessException tooLong = assertThrows(BusinessException.class,
                () -> service.workload("2026-01-01", "2026-12-31"));
        assertTrue(tooLong.getMessage().contains("92"), tooLong.getMessage());

        BusinessException reversed = assertThrows(BusinessException.class,
                () -> service.workload("2026-11-01", "2026-10-19"));
        assertTrue(reversed.getMessage().contains("不能晚於"), reversed.getMessage());
    }

    @Test
    @DisplayName("研发任务计划工时摊到工作日，负载率 = 计划工时 / 可用容量")
    void computesLoadRateFromSpreadHours() {
        when(accessGuard.canSeeAll(any())).thenReturn(true);
        // 只有一名研发，10-19~10-23（5 个工作日）摊 40h，区间容量 80h → 50%
        when(projectMemberMapper.selectList(any())).thenReturn(List.of(member(10L, "dev")));
        when(taskMapper.selectList(any())).thenReturn(List.of(task(10L, "backend", "40", "doing")));
        when(requirementMapper.selectList(any())).thenReturn(List.of());
        when(testBatchMapper.selectList(any())).thenReturn(List.of());
        when(userMapper.selectBatchIds(any())).thenReturn(List.of(user(10L, "张三", "MF00010", "研发一部")));

        RdmResourceVO.Workload vo = service.workload(FROM, TO);
        RdmResourceVO.Person dev = vo.getPeople().get(0);

        assertEquals(0, dev.getTotalCapacity().compareTo(new BigDecimal("80.0")), "10 个工作日 × 8h = 80h");
        assertEquals(0, dev.getTotalPlanned().compareTo(new BigDecimal("40.0")), "计划工时 40h 全部落在区间内");
        assertEquals(50, dev.getLoadRate(), "40 / 80 = 50%");
        assertEquals(RdmResourceVO.LOAD_AVAILABLE, dev.getLoadStatus(), "50% < 60% 属有余量");
    }

    @Test
    @DisplayName("名册纳入的人即使无任何在途单据也出现在负载视图（B-2 名册价值：看得见不忙的人）")
    void includesRosterMemberWithoutDocuments() {
        when(accessGuard.canSeeAll(any())).thenReturn(true);
        // 名册有一个无任何单据的人（user 20）；项目成员/任务/需求/批次全空
        RdmResourceMember roster = new RdmResourceMember();
        roster.setUserId(20L);
        roster.setStatus(1);
        when(resourceMemberMapper.selectList(any())).thenReturn(List.of(roster));
        when(projectMemberMapper.selectList(any())).thenReturn(List.of());
        when(taskMapper.selectList(any())).thenReturn(List.of());
        when(requirementMapper.selectList(any())).thenReturn(List.of());
        when(testBatchMapper.selectList(any())).thenReturn(List.of());
        when(userMapper.selectBatchIds(any())).thenReturn(List.of(user(20L, "王名册", "MF00020", "研发一部")));

        RdmResourceVO.Workload vo = service.workload(FROM, TO);

        assertEquals(1, vo.getPeople().size(), "名册人员即使无单据也应出现");
        RdmResourceVO.Person p = vo.getPeople().get(0);
        assertEquals(20L, p.getUserId());
        assertEquals(0, p.getProductReqs());
        assertEquals(0, p.getDevTasks());
        // 无任何在途工作 + 有容量 → 有余量（正是“看得见不忙的人”）
        assertEquals(RdmResourceVO.LOAD_AVAILABLE, p.getLoadStatus());
    }

    /* ==================== 待分配工作聚合（阶段 B-3.1） ==================== */

    private static RdmWorkTask unassignedTask(Long id, Long reqId, String taskType, String hours) {
        RdmWorkTask t = new RdmWorkTask();
        t.setId(id);
        t.setReqId(reqId);
        t.setTaskNo("RT" + id);
        t.setTitle("任务" + id);
        t.setTaskType(taskType);
        t.setStatus("todo");
        t.setPlanHours(hours == null ? null : new BigDecimal(hours));
        // ownerUserId 留空 = 未指派
        return t;
    }

    @Test
    @DisplayName("待分配聚合：需求池/未指派任务(design 归设计、其余归研发)/待接收批次正确分桶并回填需求标题")
    void aggregatesUnassignedSourcesIntoBuckets() {
        when(accessGuard.canDispatch(any())).thenReturn(true);
        // pool 需求 id=100（无产品经理）既作为待分配需求，又作为任务/批次的需求标题源（同一次 selectList 复用）
        RdmRequirement poolReq = new RdmRequirement();
        poolReq.setId(100L);
        poolReq.setReqNo("XQ20261019001");
        poolReq.setTitle("會員積分兌換");
        poolReq.setStatus("pool");
        when(requirementMapper.selectList(any())).thenReturn(List.of(poolReq));
        when(taskMapper.selectList(any())).thenReturn(List.of(
                unassignedTask(200L, 100L, "backend", "16"),
                unassignedTask(201L, 100L, "design", null)));
        RdmTestBatch pendingBatch = new RdmTestBatch();
        pendingBatch.setId(300L);
        pendingBatch.setReqId(100L);
        pendingBatch.setBatchNo("TB20261019001");
        pendingBatch.setStatus("pending");
        pendingBatch.setTestLeadUserId(5L);
        pendingBatch.setTestLeadUserName("赵六");
        when(testBatchMapper.selectList(any())).thenReturn(List.of(pendingBatch));

        RdmResourceVO.Unassigned vo = service.unassigned();

        assertTrue(vo.getCanDispatch());
        assertEquals(1, vo.getRequirements().size(), "需求池计 1");
        assertEquals("requirement", vo.getRequirements().get(0).getSource());
        assertEquals(100L, vo.getRequirements().get(0).getItemId());

        assertEquals(1, vo.getDevTasks().size(), "backend 未指派任务归研发桶");
        RdmResourceVO.UnassignedItem dev = vo.getDevTasks().get(0);
        assertEquals(200L, dev.getItemId());
        assertEquals("會員積分兌換", dev.getReqTitle(), "回填所属需求标题");
        assertEquals(0, dev.getPlanHours().compareTo(new BigDecimal("16")));

        assertEquals(1, vo.getDesignTasks().size(), "design 未指派任务归设计桶");
        assertEquals(201L, vo.getDesignTasks().get(0).getItemId());
        assertTrue(vo.getDesignTasks().get(0).getPlanHours() == null, "未估时任务 planHours 为空，前端标待估");

        assertEquals(1, vo.getTestBatches().size(), "pending 批次归测试桶");
        assertEquals("赵六", vo.getTestBatches().get(0).getCurrentOwner(), "批次当前负责人为测试负责人");
    }

    @Test
    @DisplayName("无分派权的人：待分配聚合返回 canDispatch=false 且各桶为空（前端隐藏不是边界）")
    void emptyUnassignedWithoutDispatchRight() {
        when(accessGuard.canDispatch(any())).thenReturn(false);
        when(accessGuard.canSeeAll(any())).thenReturn(false);

        RdmResourceVO.Unassigned vo = service.unassigned();

        assertFalse(vo.getCanDispatch());
        assertTrue(vo.getRequirements().isEmpty());
        assertTrue(vo.getDevTasks().isEmpty());
        assertTrue(vo.getDesignTasks().isEmpty());
        assertTrue(vo.getTestBatches().isEmpty());
    }

    @Test
    @DisplayName("分派写回：测试批次来源委托测试域 assignExecutors（pending-only+@Version 守卫在测试域内）")
    void assignDelegatesBatchToAssignExecutors() {
        when(idempotentService.stableRequestHash(any())).thenReturn("hash");
        when(idempotentService.executeOnce(any(), any(), any()))
                .thenAnswer(inv -> ((Supplier<?>) inv.getArgument(1)).get());
        RdmResourceDTO.Assign req = new RdmResourceDTO.Assign();
        req.setSource("test_batch");
        req.setItemId(300L);
        req.setAssigneeUserId(20L);
        req.setExpectedPlanVersion(0);

        RdmResourceVO.AssignResult r = service.assign(req);

        assertTrue(r.isSuccess());
        assertEquals("test_batch", r.getSource());
        // current user id = 10L（setUp）；指派执行人 20L
        verify(testBatchService).assignExecutors(300L, List.of(20L), 0, 10L);
    }

    @Test
    @DisplayName("分派写回：未知来源被拒")
    void assignRejectsUnknownSource() {
        RdmResourceDTO.Assign req = new RdmResourceDTO.Assign();
        req.setSource("ghost");
        req.setItemId(1L);
        req.setAssigneeUserId(10L);
        BusinessException ex = assertThrows(BusinessException.class, () -> service.assign(req));
        assertTrue(ex.getMessage().contains("未知的分派來源"), ex.getMessage());
    }

    @Test
    @DisplayName("分派写回：需求来源委托需求域 batchAssign（幂等 executeOnce 内），不重造状态机")
    void assignDelegatesRequirementToBatchAssign() {
        // executeOnce 直接执行传入的 supplier，模拟幂等事务边界
        when(idempotentService.stableRequestHash(any())).thenReturn("hash");
        when(idempotentService.executeOnce(any(), any(), any()))
                .thenAnswer(inv -> ((Supplier<?>) inv.getArgument(1)).get());
        when(requirementService.batchAssign(any(), eq(20L))).thenReturn(1);
        RdmResourceDTO.Assign req = new RdmResourceDTO.Assign();
        req.setSource("requirement");
        req.setItemId(100L);
        req.setAssigneeUserId(20L);

        RdmResourceVO.AssignResult r = service.assign(req);

        assertTrue(r.isSuccess());
        assertEquals("requirement", r.getSource());
        verify(requirementService).batchAssign(List.of(100L), 20L);
    }

    /** 内置三桶兑底（与 RdmTaskTypeServiceImpl.legacyCategoryOf 同语义），供 taskTypeService stub 用 */
    private static String builtinCategoryOf(String code) {
        return switch (code == null ? "" : code) {
            case RdmTaskTypeConfig.CATEGORY_DESIGN -> RdmTaskTypeConfig.CATEGORY_DESIGN;
            case RdmTaskTypeConfig.CATEGORY_QA -> RdmTaskTypeConfig.CATEGORY_QA;
            default -> RdmTaskTypeConfig.CATEGORY_DEV;
        };
    }
}
