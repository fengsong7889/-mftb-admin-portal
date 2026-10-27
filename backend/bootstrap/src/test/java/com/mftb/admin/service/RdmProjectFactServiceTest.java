package com.mftb.admin.service;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.RdmFactVO;
import com.mftb.admin.entity.RdmDeliveryItem;
import com.mftb.admin.entity.RdmIssue;
import com.mftb.admin.entity.RdmIssueDefer;
import com.mftb.admin.entity.RdmIssueFollowup;
import com.mftb.admin.entity.RdmProject;
import com.mftb.admin.entity.RdmProjectMember;
import com.mftb.admin.entity.RdmRequirement;
import com.mftb.admin.entity.RdmTestBatch;
import com.mftb.admin.entity.RdmWorkCalendar;
import com.mftb.admin.entity.RdmWorkTask;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.RdmDeliveryItemMapper;
import com.mftb.admin.mapper.RdmIssueDeferMapper;
import com.mftb.admin.mapper.RdmIssueFollowupMapper;
import com.mftb.admin.mapper.RdmIssueMapper;
import com.mftb.admin.mapper.RdmProjectMapper;
import com.mftb.admin.mapper.RdmProjectMemberMapper;
import com.mftb.admin.mapper.RdmRequirementMapper;
import com.mftb.admin.mapper.RdmTestBatchMapper;
import com.mftb.admin.mapper.RdmWorkCalendarMapper;
import com.mftb.admin.mapper.RdmWorkTaskMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.impl.RdmScheduleServiceImpl;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

/**
 * 任务22 A.1 / A.2 / A.5 / A.6 / A.7 —— 統一權威事實源 {@link RdmProjectFactService} 的口徑測試。
 *
 * <p>锁死十条结论：
 * <ol>
 *   <li><b>卡片 = 行级相加 = 下钻 = 导出 = 对账</b>：统计卡不是自己查一次库得来的，而是由项目事实行
 *       聚合；导出包与对账消费同一份快照。本测试对同一批夹具同时取四个入口，逐字段核对，
 *       任何一处口径漂移都会当场失败；</li>
 *   <li><b>mine 不退化全量</b>：{@code userId==null} 时 {@code authenticated=false}、{@code restricted=true}、
 *       {@code projectIds} 为空，且<b>连项目表都不查</b>（不是「查了再过滤」）；
 *       受限用户未参与任何项目时同样一条 SQL 都不发；</li>
 *   <li><b>受限范围必须落成 IN 条件</b>：绝不允许「projectIds 为空就省略 in 条件」而退化为全表；</li>
 *   <li><b>集合条件 + 空集合</b>：提测批次按 {@code req_id IN (...)} 统计，需求集合为空时
 *       <b>不发 SQL</b> 且计数为 0（旧实现对 ID 集合用 {@code eq} 单值条件，恒不命中）；</li>
 *   <li><b>不由任务状态推导测试通过、不由交付状态推导验收</b>：{@code testPassed}/{@code productAccepted}/
 *       {@code bizAccepted} 只消费任务20 的 {@link RdmTestBatchService#isTestPassed} 与
 *       {@link RdmAcceptanceRecordService}；任务全 done、交付项 status=done 都不能让它变 true；</li>
 *   <li><b>不混算历史验收</b>：验收结论按交付项<b>当前 scopeVersion</b> 逐个查询，
 *       旧版本的通过记录不会被算到新版本头上；</li>
 *   <li><b>行级待裁决 = 卡片待裁决</b>：同一条件（交付项ID集合 + 未决问题状态），
 *       且与「绕开聚合直接 selectCount」的对账路径B 相等；</li>
 *   <li><b>关闭项目 ≠ 交付完成</b>：{@code closed} 与 {@code all_delivered} 是两个互不推导的布尔，
 *       卡片与对账分列计数；</li>
 *   <li><b>原范围延期残余</b>：必须同时满足「延期已批准 + defer.scopeVersion &lt; item.scopeVersion +
 *       承接未闭环」三个条件；逐条拆解验证，并核对「行级相加 == 残余集合条数 == 对账路径B」；</li>
 *   <li><b>资源守卫</b>：未登录 / 项目不存在 / 非成员一律拒绝，且拒绝时<b>不会</b>先去查交付项明细
 *       （先鉴权后取数，不是取完数再过滤）。</li>
 * </ol>
 *
 * <p><b>待办看板用真实实现</b>（{@link RdmTodoBoardService} + {@link RdmWorkingDayCalculator}，只 mock 其
 * mapper）：因为「卡片待办数 == 看板总数 == 导出待办行数 == 各项目待办数相加」这条恒等式必须跨越
 * 事实源与看板两个类才成立，把看板 mock 掉就等于自证。
 *
 * <p><b>纯 Mockito 离线单测，不连库、不跑迁移。</b>mock 只证明聚合口径与授权收敛逻辑正确，
 * <b>不等价于真实数据库下的并发/事务证明</b>；真实 DB 下的一致性、并发与唯一约束兜底归属任务24。
 */
class RdmProjectFactServiceTest {

    private static final long VIEWER = 41L;
    private static final long OTHER = 42L;
    private static final long OTHER2 = 43L;
    private static final long PM = 51L;
    private static final long PRODUCT_OWNER = 52L;
    private static final long OUTSIDER = 99L;

    private static final long PROJECT_A = 300L;
    private static final long PROJECT_B = 400L;
    private static final long PROJECT_C = 500L;
    private static final long PROJECT_D = 600L;

    /** 事实源内部用 {@code LocalDate.now()}，因此逾期/未逾期只能用相对日期构造 */
    private static final LocalDate PAST = LocalDate.now().minusDays(10);
    private static final LocalDate FUTURE = LocalDate.now().plusDays(10);

    private RdmProjectMapper projectMapper;
    private RdmProjectMemberMapper memberMapper;
    private RdmDeliveryItemMapper deliveryItemMapper;
    private RdmRequirementMapper requirementMapper;
    private RdmWorkTaskMapper taskMapper;
    private RdmTestBatchMapper testBatchMapper;
    private RdmIssueMapper issueMapper;
    private RdmIssueDeferMapper issueDeferMapper;
    private RdmIssueFollowupMapper issueFollowupMapper;
    private SysUserMapper userMapper;
    private RdmAccessGuard accessGuard;
    private RdmScheduleServiceImpl scheduleService;
    private RdmTestBatchService testBatchService;
    private RdmAcceptanceRecordService acceptanceRecordService;
    private RdmWorkCalendarMapper calendarMapper;

    private RdmProjectFactService service;

    /* ---- 可变的“库表”夹具：每个测试直接往里塞行，mock 的 answer 读它们 ---- */
    private final List<RdmProject> projectRows = new ArrayList<>();
    private final List<RdmProjectMember> memberRows = new ArrayList<>();
    private final List<RdmDeliveryItem> itemRows = new ArrayList<>();
    private final List<RdmRequirement> requirementRows = new ArrayList<>();
    private final List<RdmTestBatch> batchRows = new ArrayList<>();
    private final List<RdmWorkTask> taskRows = new ArrayList<>();
    private final List<RdmIssue> issueRows = new ArrayList<>();
    /** 承接所指“新问题”的行（模拟 {@code in(RdmIssue::getId, activeIssueIds)} 那次查询） */
    private final List<RdmIssue> followupIssueRows = new ArrayList<>();
    private final List<RdmIssueDefer> deferRows = new ArrayList<>();
    private final List<RdmIssueFollowup> followupRows = new ArrayList<>();

    private final Set<Long> testPassedItems = new HashSet<>();
    private final Set<Long> productAcceptedItems = new HashSet<>();
    private final Set<Long> bizAcceptedItems = new HashSet<>();
    private final Map<Long, Integer> productAcceptanceVersionByItem = new HashMap<>();
    private final Map<Long, Integer> bizAcceptanceVersionByItem = new HashMap<>();
    private final Map<Long, List<RdmScheduleServiceImpl.BlockedTaskInfo>> blockedTasks = new HashMap<>();

    /** 非 null 时覆盖“对账路径B 直接查库”的待裁决数，用来验证对账真能检出不一致 */
    private Long pendingDecisionDirectOverride;
    private boolean canSeeAll;

    @BeforeAll
    static void initTableInfo() {
        MapperBuilderAssistant assistant = new MapperBuilderAssistant(new MybatisConfiguration(), "");
        // 事实源对每个实体都用 LambdaQueryWrapper 构造条件，未初始化 lambda 缓存会直接抛错
        TableInfoHelper.initTableInfo(assistant, RdmProject.class);
        TableInfoHelper.initTableInfo(assistant, RdmProjectMember.class);
        TableInfoHelper.initTableInfo(assistant, RdmDeliveryItem.class);
        TableInfoHelper.initTableInfo(assistant, RdmRequirement.class);
        TableInfoHelper.initTableInfo(assistant, RdmTestBatch.class);
        TableInfoHelper.initTableInfo(assistant, RdmWorkTask.class);
        TableInfoHelper.initTableInfo(assistant, RdmIssue.class);
        TableInfoHelper.initTableInfo(assistant, RdmIssueDefer.class);
        TableInfoHelper.initTableInfo(assistant, RdmIssueFollowup.class);
        TableInfoHelper.initTableInfo(assistant, RdmWorkCalendar.class);
    }

    @BeforeEach
    void setUp() {
        projectMapper = mock(RdmProjectMapper.class);
        memberMapper = mock(RdmProjectMemberMapper.class);
        deliveryItemMapper = mock(RdmDeliveryItemMapper.class);
        requirementMapper = mock(RdmRequirementMapper.class);
        taskMapper = mock(RdmWorkTaskMapper.class);
        testBatchMapper = mock(RdmTestBatchMapper.class);
        issueMapper = mock(RdmIssueMapper.class);
        issueDeferMapper = mock(RdmIssueDeferMapper.class);
        issueFollowupMapper = mock(RdmIssueFollowupMapper.class);
        userMapper = mock(SysUserMapper.class);
        accessGuard = mock(RdmAccessGuard.class);
        scheduleService = mock(RdmScheduleServiceImpl.class);
        testBatchService = mock(RdmTestBatchService.class);
        acceptanceRecordService = mock(RdmAcceptanceRecordService.class);
        calendarMapper = mock(RdmWorkCalendarMapper.class);

        doAnswer(inv -> {
            Collection<Object> params = paramsOf(inv.getArgument(0));
            boolean scoped = params.stream().anyMatch(v -> v instanceof Long);
            return projectRows.stream()
                    .filter(p -> p == null || p.getId() == null || !scoped || params.contains(p.getId()))
                    .collect(java.util.stream.Collectors.toList());
        }).when(projectMapper).selectList(any());
        doAnswer(inv -> projectRows.stream()
                .filter(p -> p != null && Objects.equals(p.getId(), inv.getArgument(0)))
                .findFirst().orElse(null)).when(projectMapper).selectById(any());
        // 必须按 SQL 里的 userId 条件过滤，否则“非成员被拒”这条守卫断言会假绿
        doAnswer(inv -> {
            Collection<Object> params = paramsOf(inv.getArgument(0));
            return memberRows.stream()
                    .filter(m -> m != null && m.getLeaveTime() == null && params.contains(m.getUserId()))
                    .collect(java.util.stream.Collectors.toList());
        }).when(memberMapper).selectList(any());
        // 以下 mapper 都按 SQL 里的 IN 参数过滤，真实模拟“范围收敛后只捞得到这批行”；
        // null 行与缺主键行一律放行，交由被测代码自行跳过（那才是健壮性测试的对象）
        doAnswer(inv -> filterBy(paramsOf(inv.getArgument(0)), itemRows, RdmDeliveryItem::getProjectId))
                .when(deliveryItemMapper).selectList(any());
        doAnswer(inv -> filterBy(paramsOf(inv.getArgument(0)), requirementRows, RdmRequirement::getProjectId))
                .when(requirementMapper).selectList(any());
        doAnswer(inv -> filterBy(paramsOf(inv.getArgument(0)), batchRows, RdmTestBatch::getReqId))
                .when(testBatchMapper).selectList(any());
        doAnswer(inv -> filterBy(paramsOf(inv.getArgument(0)), taskRows, RdmWorkTask::getDeliveryItemId))
                .when(taskMapper).selectList(any());
        // issueMapper.selectList 有两个调用点：按交付项ID集合取问题、按承接所指问题ID集合取状态。
        // 用 SQL 片段区分，避免两次查询互相污染。
        doAnswer(inv -> sqlOf(inv.getArgument(0)).contains("delivery_item_id")
                ? filterBy(paramsOf(inv.getArgument(0)), issueRows, RdmIssue::getDeliveryItemId)
                : filterBy(paramsOf(inv.getArgument(0)), followupIssueRows, RdmIssue::getId))
                .when(issueMapper).selectList(any());
        doAnswer(inv -> pendingDecisionDirectOverride != null
                ? pendingDecisionDirectOverride
                : issueRows.stream()
                        .filter(i -> i != null && RdmConstants.ISSUE_OPEN_STATUSES.contains(i.getStatus()))
                        .count()).when(issueMapper).selectCount(any());
        doAnswer(inv -> filterBy(paramsOf(inv.getArgument(0)), deferRows, RdmIssueDefer::getIssueId))
                .when(issueDeferMapper).selectList(any());
        // 只回有效承接：模拟 SQL 里的 eq(active, FOLLOWUP_ACTIVE)，
        // 否则“承接已失效”这个场景无法被测到
        doAnswer(inv -> filterBy(paramsOf(inv.getArgument(0)), followupRows, RdmIssueFollowup::getIssueId).stream()
                .filter(f -> Integer.valueOf(RdmConstants.FOLLOWUP_ACTIVE).equals(f.getActive()))
                .collect(java.util.stream.Collectors.toList())).when(issueFollowupMapper).selectList(any());

        doAnswer(inv -> {
            SysUser user = new SysUser();
            user.setId(inv.getArgument(0));
            return user;
        }).when(userMapper).selectById(any());
        doAnswer(inv -> canSeeAll).when(accessGuard).canSeeAll(any());
        doAnswer(inv -> blockedTasks.getOrDefault((Long) inv.getArgument(0), List.of()))
                .when(scheduleService).getBlockedTasks(any());
        doAnswer(inv -> testPassedItems.contains((Long) inv.getArgument(0)))
                .when(testBatchService).isTestPassed(any());
        doAnswer(inv -> {
            productAcceptanceVersionByItem.put(inv.getArgument(0), inv.getArgument(1));
            return productAcceptedItems.contains((Long) inv.getArgument(0));
        }).when(acceptanceRecordService).hasProductAcceptancePassed(any(), any());
        doAnswer(inv -> {
            bizAcceptanceVersionByItem.put(inv.getArgument(0), inv.getArgument(1));
            return bizAcceptedItems.contains((Long) inv.getArgument(0));
        }).when(acceptanceRecordService).hasBizAcceptancePassed(any(), any());
        doAnswer(inv -> new ArrayList<RdmWorkCalendar>()).when(calendarMapper).selectList(any());

        service = new RdmProjectFactService(projectMapper, memberMapper, deliveryItemMapper, requirementMapper,
                taskMapper, testBatchMapper, issueMapper, issueDeferMapper, issueFollowupMapper, userMapper,
                accessGuard, scheduleService, testBatchService, acceptanceRecordService,
                new RdmTodoBoardService(new RdmWorkingDayCalculator(calendarMapper)));
    }

    /* ==================== 夹具 ==================== */

    private static String sqlOf(Object wrapper) {
        String sql = ((com.baomidou.mybatisplus.core.conditions.Wrapper<?>) wrapper).getSqlSegment();
        return sql == null ? "" : sql;
    }

    /** 必须先渲染 SQL 片段，MyBatis-Plus 的参数注册是延迟的，否则 paramNameValuePairs 为空 */
    private static Collection<Object> paramsOf(Object wrapper) {
        LambdaQueryWrapper<?> w = (LambdaQueryWrapper<?>) wrapper;
        w.getSqlSegment();
        return w.getParamNameValuePairs().values();
    }

    /** 按 IN 参数过滤行，模拟 mapper 真实行为；null 行与缺主键行放行（由被测代码负责跳过） */
    private static <T> List<T> filterBy(Collection<Object> params, List<T> rows,
                                       java.util.function.Function<T, Long> keyGetter) {
        List<T> result = new ArrayList<>();
        for (T row : rows) {
            if (row == null) {
                result.add(row);
                continue;
            }
            Long key = keyGetter.apply(row);
            if (key == null || params.contains(key)) {
                result.add(row);
            }
        }
        return result;
    }

    private RdmProject project(long id, String status) {
        RdmProject p = new RdmProject();
        p.setId(id);
        p.setProjectNo("P-" + id);
        p.setName("項目" + id);
        p.setStatus(status);
        p.setPmUserId(PM);
        p.setPmUserName("PM");
        p.setProductOwnerUserId(PRODUCT_OWNER);
        p.setProductOwnerUserName("PO");
        p.setPlanStartDate(PAST);
        p.setPlanEndDate(FUTURE);
        p.setPausedFlag(0);
        p.setRiskFlag(0);
        p.setOverdueFlag(0);
        p.setVersion(8);
        p.setCreatedAt(LocalDateTime.now());
        p.setUpdatedAt(LocalDateTime.now());
        return p;
    }

    private RdmProjectMember member(long projectId, long userId) {
        RdmProjectMember m = new RdmProjectMember();
        m.setProjectId(projectId);
        m.setUserId(userId);
        m.setUserName("成員" + userId);
        return m;
    }

    private RdmDeliveryItem item(long id, long projectId, String status, Integer scopeVersion) {
        RdmDeliveryItem it = new RdmDeliveryItem();
        it.setId(id);
        it.setItemNo("DI-" + id);
        it.setTitle("交付項" + id);
        it.setProjectId(projectId);
        it.setReqId(700L + id);
        it.setStatus(status);
        it.setScopeVersion(scopeVersion);
        it.setVersion(7);
        it.setCoordinatorUserId(VIEWER);
        it.setCoordinatorUserName("協調人");
        it.setPlanStartDate(PAST);
        it.setPlanEndDate(FUTURE);
        it.setBlockedFlag(0);
        return it;
    }

    private RdmRequirement requirement(long id, long projectId) {
        RdmRequirement r = new RdmRequirement();
        r.setId(id);
        r.setReqNo("RQ-" + id);
        r.setTitle("需求" + id);
        r.setProjectId(projectId);
        return r;
    }

    private RdmTestBatch batch(long id, Long reqId) {
        RdmTestBatch b = new RdmTestBatch();
        b.setId(id);
        b.setBatchNo("TB-" + id);
        b.setReqId(reqId);
        b.setStatus(RdmConstants.TB_PASSED);
        return b;
    }

    private RdmWorkTask task(long id, long itemId, String status) {
        RdmWorkTask t = new RdmWorkTask();
        t.setId(id);
        t.setTaskNo("T-" + id);
        t.setDeliveryItemId(itemId);
        t.setStatus(status);
        t.setTitle("任務" + id);
        return t;
    }

    private RdmIssue issue(long id, Long itemId, String status, String severity) {
        RdmIssue i = new RdmIssue();
        i.setId(id);
        i.setIssueNo("IS-" + id);
        i.setTitle("問題" + id);
        i.setDeliveryItemId(itemId);
        i.setScopeVersion(1);
        i.setStatus(status);
        i.setSeverity(severity);
        i.setOwnerUserId(OTHER);
        i.setOwnerUserName("負責人");
        i.setVersion(4);
        return i;
    }

    private RdmIssueDefer defer(long id, long issueId, String status, Integer scopeVersion) {
        RdmIssueDefer d = new RdmIssueDefer();
        d.setId(id);
        d.setIssueId(issueId);
        d.setStatus(status);
        d.setScopeVersion(scopeVersion);
        d.setReason("原範圍延期" + id);
        d.setOwnerUserId(OTHER);
        d.setOwnerUserName("承接人");
        d.setDueAt(PAST);
        d.setVersion(6);
        return d;
    }

    private RdmIssueFollowup followup(long id, long issueId, Long activeIssueId, int active) {
        RdmIssueFollowup f = new RdmIssueFollowup();
        f.setId(id);
        f.setIssueId(issueId);
        f.setActiveIssueId(activeIssueId);
        f.setActive(active);
        f.setVersion(1);
        return f;
    }

    private RdmScheduleServiceImpl.BlockedTaskInfo blocked(long taskId) {
        RdmScheduleServiceImpl.BlockedTaskInfo info = new RdmScheduleServiceImpl.BlockedTaskInfo();
        info.setTaskId(taskId);
        info.setTaskTitle("被阻斷任務" + taskId);
        return info;
    }

    private RdmFactVO.FactQuery query() {
        return new RdmFactVO.FactQuery();
    }

    private void viewerIsMemberOfAll() {
        memberRows.add(member(PROJECT_A, VIEWER));
        memberRows.add(member(PROJECT_B, VIEWER));
        memberRows.add(member(PROJECT_C, VIEWER));
        memberRows.add(member(PROJECT_D, VIEWER));
    }

    /**
     * 一份「四种项目状态 + 六种交付项状态 + 问题/延期/承接/任务/需求/批次」都齐的夹具，
     * 用来做「卡片 = 行级 = 下钻 = 导出 = 对账」的一致性核对。
     */
    private void givenRichFixture() {
        projectRows.add(project(PROJECT_A, RdmConstants.PROJECT_IN_PROGRESS));
        projectRows.add(project(PROJECT_B, RdmConstants.PROJECT_PARTIAL_DELIVERED));
        projectRows.add(project(PROJECT_C, RdmConstants.PROJECT_CLOSED));
        projectRows.add(project(PROJECT_D, RdmConstants.PROJECT_ALL_DELIVERED));
        viewerIsMemberOfAll();

        RdmDeliveryItem i11 = item(11L, PROJECT_A, RdmConstants.DI_DEVELOPING, 1);
        i11.setPlanEndDate(PAST);          // 逾期
        i11.setBlockedFlag(1);             // 阻塞
        RdmDeliveryItem i12 = item(12L, PROJECT_A, RdmConstants.DI_PENDING_ACCEPTANCE, 2);
        i12.setCoordinatorUserId(OTHER);
        i12.setProductAcceptorUserId(VIEWER);
        i12.setProductAcceptorUserName("產品驗收人");
        i12.setBizAcceptorUserId(OTHER2);
        i12.setBizAcceptorUserName("業務驗收人");
        RdmDeliveryItem i13 = item(13L, PROJECT_B, RdmConstants.DI_DONE, 1);
        i13.setPlanEndDate(PAST);
        RdmDeliveryItem i14 = item(14L, PROJECT_B, RdmConstants.DI_TESTING, 3);
        i14.setCoordinatorUserId(null);    // 未指派
        i14.setPlanEndDate(PAST);
        RdmDeliveryItem i15 = item(15L, PROJECT_C, RdmConstants.DI_DEVELOPING, 1);
        i15.setCoordinatorUserId(OTHER);
        RdmDeliveryItem i16 = item(16L, PROJECT_D, RdmConstants.DI_DONE, 1);
        i16.setPlanEndDate(PAST);
        itemRows.add(i11);
        itemRows.add(i12);
        itemRows.add(i13);
        itemRows.add(i14);
        itemRows.add(i15);
        itemRows.add(i16);

        requirementRows.add(requirement(701L, PROJECT_A));
        requirementRows.add(requirement(702L, PROJECT_A));
        requirementRows.add(requirement(703L, PROJECT_B));
        batchRows.add(batch(801L, 701L));
        batchRows.add(batch(802L, 701L));
        batchRows.add(batch(803L, 703L));

        taskRows.add(task(901L, 11L, "done"));
        taskRows.add(task(902L, 11L, "done"));
        taskRows.add(task(903L, 11L, "doing"));
        taskRows.add(task(904L, 13L, "doing"));

        issueRows.add(issue(21L, 11L, RdmConstants.ISSUE_OPEN, RdmConstants.SEV_CRITICAL));
        issueRows.add(issue(22L, 11L, RdmConstants.ISSUE_PROCESSING, RdmConstants.SEV_MAJOR));
        issueRows.add(issue(23L, 12L, RdmConstants.ISSUE_RESOLVED, RdmConstants.SEV_MINOR));
        RdmIssue unassignedIssue = issue(24L, 14L, RdmConstants.ISSUE_OPEN, RdmConstants.SEV_MAJOR);
        unassignedIssue.setOwnerUserId(null);
        unassignedIssue.setOwnerUserName(null);
        issueRows.add(unassignedIssue);
        issueRows.add(issue(25L, 15L, RdmConstants.ISSUE_PENDING_VERIFY, RdmConstants.SEV_CRITICAL));

        // 已批准 + 属于旧范围（defer.scopeVersion=0 < item.scopeVersion=1）+ 无承接 → 残余
        deferRows.add(defer(31L, 21L, RdmConstants.DEFER_EFFECTIVE, 0));
        // 未批准（pending_product）→ 不构成残余
        deferRows.add(defer(32L, 23L, RdmConstants.DEFER_PENDING_PRODUCT, 0));

        testPassedItems.add(13L);
        testPassedItems.add(16L);
        productAcceptedItems.add(13L);
        productAcceptedItems.add(16L);
        bizAcceptedItems.add(16L);
        blockedTasks.put(11L, List.of(blocked(901L), blocked(902L)));
    }

    private static RdmFactVO.ItemFact itemOf(List<RdmFactVO.ItemFact> facts, long itemId) {
        return facts.stream().filter(f -> Long.valueOf(itemId).equals(f.getItemId())).findFirst().orElseThrow();
    }

    private static RdmFactVO.ProjectFact projectOf(List<RdmFactVO.ProjectFact> facts, long projectId) {
        return facts.stream().filter(f -> Long.valueOf(projectId).equals(f.getProjectId()))
                .findFirst().orElseThrow();
    }

    /* ==================== A.1 / A.7 统一事实源：卡片 = 行级 = 下钻 = 导出 = 对账 ==================== */

    @Test
    @DisplayName("A.1 卡片每个计数都等于项目事实行相加（卡片没有自己的查询条件，不可能与行级漂移）")
    void cardsEqualSumOfProjectFactRows() {
        givenRichFixture();

        RdmFactVO.CardSummary cards = service.cards(query(), VIEWER);
        List<RdmFactVO.ProjectFact> rows = service.projectFacts(query(), VIEWER);

        assertEquals(4, rows.size());
        assertEquals(rows.size(), cards.getTotalProjects());
        assertEquals(sum(rows, RdmFactVO.ProjectFact::getDeliveryItemTotal), cards.getTotalDeliveryItems());
        assertEquals(sum(rows, RdmFactVO.ProjectFact::getDeliveryItemCompleted), cards.getDeliveredItems());
        assertEquals(sum(rows, RdmFactVO.ProjectFact::getDeliveryItemBlocked), cards.getBlockedCount());
        assertEquals(sum(rows, RdmFactVO.ProjectFact::getTestPassedItemCount), cards.getTestPassedItemCount());
        assertEquals(sum(rows, RdmFactVO.ProjectFact::getProductAcceptedItemCount),
                cards.getProductAcceptedItemCount());
        assertEquals(sum(rows, RdmFactVO.ProjectFact::getBizAcceptedItemCount), cards.getBizAcceptedItemCount());
        assertEquals(sum(rows, RdmFactVO.ProjectFact::getIssueOpen), cards.getIssueOpen());
        assertEquals(sum(rows, RdmFactVO.ProjectFact::getIssueCritical), cards.getIssueCritical());
        assertEquals(sum(rows, RdmFactVO.ProjectFact::getPendingDecisionCount), cards.getPendingDecisionCount());
        assertEquals(sum(rows, RdmFactVO.ProjectFact::getDeferResidualCount), cards.getDeferResidualCount());
        assertEquals(sum(rows, RdmFactVO.ProjectFact::getTodoTotal), cards.getTodoTotal());
        assertEquals(sum(rows, RdmFactVO.ProjectFact::getTodoMineCount), cards.getTodoMineCount());
        assertEquals(sum(rows, RdmFactVO.ProjectFact::getTodoWaitingOthersCount), cards.getTodoWaitingOthersCount());
        assertEquals(sum(rows, RdmFactVO.ProjectFact::getTodoUnassignedCount), cards.getTodoUnassignedCount());
        // 几个绝对值兜底，防止“两边都是 0 所以相等”这种假绿
        assertEquals(6, cards.getTotalDeliveryItems());
        assertEquals(4, cards.getPendingDecisionCount());
        assertEquals(1, cards.getDeferResidualCount());
        assertEquals(2, cards.getTestPassedItemCount());
    }

    private static int sum(List<RdmFactVO.ProjectFact> rows,
                           java.util.function.ToIntFunction<RdmFactVO.ProjectFact> getter) {
        return rows.stream().mapToInt(getter).sum();
    }

    @Test
    @DisplayName("A.1 行级待裁决=卡片待裁决=对账路径B直接查库（三个数同源同条件，旧实现行级恒为0）")
    void pendingDecisionIsSameNumberEverywhere() {
        givenRichFixture();

        List<RdmFactVO.ItemFact> items = service.itemFacts(PROJECT_A, VIEWER);
        RdmFactVO.CardSummary cards = service.cards(query(), VIEWER);
        RdmFactVO.Reconciliation recon = service.reconcile(query(), VIEWER);

        RdmFactVO.ItemFact i11 = itemOf(items, 11L);
        assertEquals(2, i11.getOpenIssueCount(), "21 open + 22 processing");
        assertEquals(i11.getOpenIssueCount(), i11.getPendingDecisionCount(), "行级两个字段必须同条件");
        assertEquals(0, itemOf(items, 12L).getPendingDecisionCount(), "23 已 resolved，不计入");

        assertEquals(4, cards.getPendingDecisionCount());
        assertEquals(4, recon.getPendingDecisionSum());
        assertEquals(4, recon.getPendingDecisionDirect());
        assertTrue(recon.isConsistent(), "对账应一致，实际=" + recon.getMismatches());
    }

    @Test
    @DisplayName("A.7 导出包与卡片/行级/看板逐项一致（供任务23 前端 ExcelJS 消费同一份数据）")
    void exportBundleIsConsistentWithCardsRowsAndBoard() {
        givenRichFixture();

        RdmFactVO.ExportBundle bundle = service.exportBundle(query(), VIEWER);
        RdmFactVO.CardSummary cards = service.cards(query(), VIEWER);
        RdmFactVO.TodoBoard board = service.todoBoard(null, VIEWER);

        assertNotNull(bundle.getScope());
        assertEquals(VIEWER, bundle.getScope().getUserId());
        assertTrue(bundle.getScope().isAuthenticated());
        assertEquals(cards.getTotalProjects(), bundle.getCards().getTotalProjects());
        assertEquals(cards.getPendingDecisionCount(), bundle.getCards().getPendingDecisionCount());
        assertEquals(cards.getTodoTotal(), bundle.getCards().getTodoTotal());
        assertEquals(bundle.getProjects().size(), bundle.getCards().getTotalProjects());
        // 全量语义：交付项明细行数 == 各项目 deliveryItemTotal 相加，不是当前页
        assertEquals(sum(bundle.getProjects(), RdmFactVO.ProjectFact::getDeliveryItemTotal),
                bundle.getItems().size());
        assertEquals(6, bundle.getItems().size());
        assertEquals(board.getTotal(), bundle.getTodos().size());
        assertEquals(board.getTotal(), bundle.getReconciliation().getTodoTotal());
        assertTrue(bundle.getReconciliation().isConsistent(),
                "导出包自带对账结论，必须一致：" + bundle.getReconciliation().getMismatches());
        assertNotNull(bundle.getComputedAt());
    }

    @Test
    @DisplayName("A.1 单项目下钻与导出包里同一项目的数字完全相同（下钻不是另一套口径）")
    void drilldownMatchesExportForSameProject() {
        givenRichFixture();

        RdmFactVO.ProjectFact drilled = service.projectFact(PROJECT_A, VIEWER);
        RdmFactVO.ExportBundle bundle = service.exportBundle(query(), VIEWER);
        RdmFactVO.ProjectFact exported = projectOf(bundle.getProjects(), PROJECT_A);

        assertNotNull(drilled);
        assertEquals(exported.getDeliveryItemTotal(), drilled.getDeliveryItemTotal());
        assertEquals(exported.getDeliveryItemCompleted(), drilled.getDeliveryItemCompleted());
        assertEquals(exported.getDeliveryItemBlocked(), drilled.getDeliveryItemBlocked());
        assertEquals(exported.getDeliveryItemOverdue(), drilled.getDeliveryItemOverdue());
        assertEquals(exported.getPendingDecisionCount(), drilled.getPendingDecisionCount());
        assertEquals(exported.getDeferResidualCount(), drilled.getDeferResidualCount());
        assertEquals(exported.getTestPassedItemCount(), drilled.getTestPassedItemCount());
        assertEquals(exported.getRequirementTotal(), drilled.getRequirementTotal());
        assertEquals(exported.getTestBatchTotal(), drilled.getTestBatchTotal());
        assertEquals(exported.getTaskTotal(), drilled.getTaskTotal());
        assertEquals(exported.getBlockedTaskCount(), drilled.getBlockedTaskCount());
        assertEquals(2, drilled.getRequirementTotal());
        assertEquals(2, drilled.getTestBatchTotal());
        assertEquals(2, drilled.getBlockedTaskCount());

        // 下钻的交付项明细行数 == 下钻卡片里的交付项总数（全量语义，不是当前页）
        List<RdmFactVO.ItemFact> drilledItems = service.itemFacts(PROJECT_A, VIEWER);
        assertEquals(drilled.getDeliveryItemTotal(), drilledItems.size());
        assertEquals(2, drilledItems.size());
        assertEquals(List.of(11L, 12L),
                drilledItems.stream().map(RdmFactVO.ItemFact::getItemId).sorted().toList());
        assertEquals(drilled.getDeliveryItemTotal(),
                bundle.getItems().stream()
                        .filter(i -> Long.valueOf(PROJECT_A).equals(i.getProjectId())).count());
    }

    @Test
    @DisplayName("A.7 对账不一致会被检出并逐条写明（不是同义反复的 x==x）")
    void reconciliationDetectsPendingDecisionDrift() {
        givenRichFixture();
        pendingDecisionDirectOverride = 999L;

        RdmFactVO.Reconciliation recon = service.reconcile(query(), VIEWER);

        assertFalse(recon.isConsistent());
        assertEquals(4, recon.getPendingDecisionSum());
        assertEquals(999, recon.getPendingDecisionDirect());
        assertTrue(recon.getMismatches().stream().anyMatch(m -> m.contains("待裁決數不一致")),
                "应写明是哪一项对不上，实际=" + recon.getMismatches());
    }

    @Test
    @DisplayName("A.7 对账自检：待办总数=明细行数=三桶相加，去重前命中次数≥去重后总数")
    void reconciliationChecksTodoDeduplication() {
        givenRichFixture();

        RdmFactVO.Reconciliation recon = service.reconcile(query(), VIEWER);

        assertTrue(recon.getTodoTotal() > 0, "夹具应产生待办，否则本断言无意义");
        assertEquals(recon.getTodoTotal(), recon.getTodoRowCount());
        assertEquals(recon.getTodoTotal(), recon.getTodoBucketSum());
        assertTrue(recon.getTodoRawReasonHits() >= recon.getTodoTotal());
        assertTrue(recon.getMismatches().stream().noneMatch(m -> m.contains("待辦")),
                "实际=" + recon.getMismatches());
    }

    @Test
    @DisplayName("A.7 分页total是全量事实行数而非当前页条数（卡片按全量算、列表按页算就会出现两个数字）")
    void pageTotalIsFullRowCountNotPageSize() {
        for (int i = 0; i < 25; i++) {
            long id = 1000L + i;
            projectRows.add(project(id, RdmConstants.PROJECT_IN_PROGRESS));
            memberRows.add(member(id, VIEWER));
            itemRows.add(item(2000L + i, id, RdmConstants.DI_DEVELOPING, 1));
        }

        Page<RdmFactVO.ProjectFact> first = service.projectFactPage(query(), VIEWER, 1, 10);
        Page<RdmFactVO.ProjectFact> third = service.projectFactPage(query(), VIEWER, 3, 10);

        assertEquals(25, first.getTotal());
        assertEquals(10, first.getRecords().size());
        assertEquals(25, third.getTotal());
        assertEquals(5, third.getRecords().size());
        assertEquals(25, service.cards(query(), VIEWER).getTotalProjects());
        assertEquals(25, service.projectFacts(query(), VIEWER).size());

        Page<RdmFactVO.ProjectFact> defaulted = service.projectFactPage(query(), VIEWER, null, null);
        assertEquals(1, defaulted.getCurrent());
        assertEquals(20, defaulted.getSize());
        Page<RdmFactVO.ProjectFact> capped = service.projectFactPage(query(), VIEWER, 1, 5000);
        assertEquals(200, capped.getSize(), "单页上限 200，防止前端一把拉爆");
    }

    /* ==================== A.2 数据范围 fail-closed（mine 不退化全量） ==================== */

    @Test
    @DisplayName("A.2 userId为null→未认证+受限+可见项目为空，且连项目表都不查（绝不退化为全量）")
    void nullUserIdNeverDegradesToAll() {
        projectRows.add(project(PROJECT_A, RdmConstants.PROJECT_IN_PROGRESS));
        itemRows.add(item(11L, PROJECT_A, RdmConstants.DI_DEVELOPING, 1));

        RdmFactVO.Scope scope = service.resolveScope(null);
        assertFalse(scope.isAuthenticated());
        assertFalse(scope.isCanSeeAll());
        assertTrue(scope.isRestricted());
        assertTrue(scope.getProjectIds().isEmpty());
        assertNull(scope.getUserId());

        RdmFactVO.CardSummary cards = service.cards(query(), null);
        assertEquals(0, cards.getTotalProjects());
        assertEquals(0, cards.getTotalDeliveryItems());
        assertEquals(0, cards.getTodoTotal());
        assertTrue(service.projectFacts(query(), null).isEmpty());
        verify(projectMapper, never()).selectList(any());
        verify(deliveryItemMapper, never()).selectList(any());
    }

    @Test
    @DisplayName("A.2 受限用户未参与任何项目→一条明细SQL都不发，事实全为0")
    void restrictedUserWithoutProjectsQueriesNothing() {
        projectRows.add(project(PROJECT_A, RdmConstants.PROJECT_IN_PROGRESS));
        itemRows.add(item(11L, PROJECT_A, RdmConstants.DI_DEVELOPING, 1));

        RdmFactVO.Scope scope = service.resolveScope(OUTSIDER);
        assertTrue(scope.isAuthenticated());
        assertTrue(scope.isRestricted());
        assertTrue(scope.getProjectIds().isEmpty());

        assertEquals(0, service.cards(query(), OUTSIDER).getTotalProjects());
        assertTrue(service.projectFacts(query(), OUTSIDER).isEmpty());
        verify(projectMapper, never()).selectList(any());
        verify(deliveryItemMapper, never()).selectList(any());
    }

    @Test
    @DisplayName("A.2 受限范围必须落成 id IN (...) 条件，且只含我参与的项目（省略in就是全表）")
    void restrictedScopeIsAppliedAsInCondition() {
        projectRows.add(project(PROJECT_A, RdmConstants.PROJECT_IN_PROGRESS));
        projectRows.add(project(PROJECT_B, RdmConstants.PROJECT_IN_PROGRESS));
        memberRows.add(member(PROJECT_A, VIEWER));

        service.projectFacts(query(), VIEWER);

        ArgumentCaptor<LambdaQueryWrapper<RdmProject>> captor =
                ArgumentCaptor.forClass(LambdaQueryWrapper.class);
        verify(projectMapper).selectList(captor.capture());
        String sql = captor.getValue().getSqlSegment();
        assertTrue(sql.contains("id IN"), "必须带 IN 收敛条件，实际 SQL=" + sql);
        Collection<Object> params = paramsOf(captor.getValue());
        assertTrue(params.contains(PROJECT_A), "可见集合应含我参与的项目");
        assertFalse(params.contains(PROJECT_B), "绝不能把未参与的项目带进条件");
    }

    @Test
    @DisplayName("A.2 全量授权者不受成员收敛，且不再查成员表（授权口径沿用任务19 RdmAccessGuard）")
    void canSeeAllSkipsMemberRestriction() {
        canSeeAll = true;
        projectRows.add(project(PROJECT_A, RdmConstants.PROJECT_IN_PROGRESS));

        RdmFactVO.Scope scope = service.resolveScope(OUTSIDER);
        assertTrue(scope.isCanSeeAll());
        assertFalse(scope.isRestricted());
        verify(memberMapper, never()).selectList(any());

        service.projectFacts(query(), OUTSIDER);
        ArgumentCaptor<LambdaQueryWrapper<RdmProject>> captor =
                ArgumentCaptor.forClass(LambdaQueryWrapper.class);
        verify(projectMapper).selectList(captor.capture());
        assertFalse(captor.getValue().getSqlSegment().contains("id IN"), "全量授权者不加成员收敛条件");
    }

    @Test
    @DisplayName("A.2 產品負責人與計劃日期都是 SQL 側條件，不是記憶體過濾（否則分頁 total 与卡片都会错）")
    void newFiltersAreAppliedInSqlNotInMemory() {
        canSeeAll = true;
        projectRows.add(project(PROJECT_A, RdmConstants.PROJECT_IN_PROGRESS));

        RdmFactVO.FactQuery q = query();
        q.setProductOwnerUserId(PRODUCT_OWNER);
        q.setPlanDateFrom("2026-01-01");
        q.setPlanDateTo("2026-12-31");
        service.projectFacts(q, OUTSIDER);

        ArgumentCaptor<LambdaQueryWrapper<RdmProject>> captor =
                ArgumentCaptor.forClass(LambdaQueryWrapper.class);
        verify(projectMapper).selectList(captor.capture());
        String sql = captor.getValue().getSqlSegment();
        Collection<Object> params = paramsOf(captor.getValue());

        assertTrue(sql.contains("product_owner_user_id ="), sql);
        // overlap 口径：计划止 >= 所选起 且 计划起 <= 所选止。两个日期列都可空，
        // NULL 参与比较恒为 unknown，所以两侧都必须配 IS NOT NULL，否则未填计划的项目会被反向放进结果集。
        assertTrue(sql.contains("plan_end_date IS NOT NULL"), sql);
        assertTrue(sql.contains("plan_end_date >="), sql);
        assertTrue(sql.contains("plan_start_date IS NOT NULL"), sql);
        assertTrue(sql.contains("plan_start_date <="), sql);
        assertTrue(params.contains(PRODUCT_OWNER), params.toString());
        assertTrue(params.contains(java.time.LocalDate.of(2026, 1, 1)), params.toString());
        assertTrue(params.contains(java.time.LocalDate.of(2026, 12, 31)), params.toString());
    }

    @Test
    @DisplayName("A.2 非法計劃日期必须报错，不能静默丢条件退化成全量")
    void malformedPlanDateIsRejected() {
        canSeeAll = true;
        projectRows.add(project(PROJECT_A, RdmConstants.PROJECT_IN_PROGRESS));

        RdmFactVO.FactQuery q = query();
        q.setPlanDateFrom("2026/01/01");

        BusinessException ex = assertThrows(BusinessException.class, () -> service.projectFacts(q, OUTSIDER));
        assertTrue(ex.getMessage().contains("計劃日期起"), ex.getMessage());
        // 报错前不得发项目查询：丢条件发 SQL 就是拿全量当结果给用户
        verify(projectMapper, never()).selectList(any());
    }

    @Test
    @DisplayName("A.2 我的工作台跨项目待办：未登录恒空看板，登录后才是真实待办")
    void todoBoardIsFailClosedForAnonymous() {
        givenRichFixture();

        RdmFactVO.TodoBoard anonymous = service.todoBoard(null, null);
        assertFalse(anonymous.isAuthenticated());
        assertEquals(0, anonymous.getTotal());
        assertTrue(anonymous.getTodos().isEmpty());

        RdmFactVO.TodoBoard authed = service.todoBoard(null, VIEWER);
        assertTrue(authed.isAuthenticated());
        assertTrue(authed.getTotal() > 0);
        assertEquals(authed.getTotal(),
                authed.getMineCount() + authed.getWaitingOthersCount() + authed.getUnassignedCount());
    }

    /* ==================== A.6 资源守卫 ==================== */

    @Test
    @DisplayName("A.6 资源守卫：项目ID为空/未登录/项目不存在/非成员 四类一律拒绝")
    void guardRejectsEveryUnauthorizedCase() {
        projectRows.add(project(PROJECT_A, RdmConstants.PROJECT_IN_PROGRESS));
        memberRows.add(member(PROJECT_A, VIEWER));

        assertEquals("項目ID不能為空",
                assertThrows(BusinessException.class, () -> service.requireProjectVisible(null, VIEWER)).getMessage());
        assertTrue(assertThrows(BusinessException.class,
                () -> service.requireProjectVisible(PROJECT_A, null)).getMessage().contains("未取得登錄身份"));
        assertTrue(assertThrows(BusinessException.class,
                () -> service.requireProjectVisible(123456L, VIEWER)).getMessage().contains("項目不存在"));
        assertTrue(assertThrows(BusinessException.class,
                () -> service.requireProjectVisible(PROJECT_A, OUTSIDER)).getMessage().contains("不是該項目成員"));
    }

    @Test
    @DisplayName("A.6 资源守卫放行：成员本人 / 项目经理 / 产品负责人 / 全量授权者")
    void guardAllowsMemberPmProductOwnerAndAdmin() {
        projectRows.add(project(PROJECT_A, RdmConstants.PROJECT_IN_PROGRESS));
        memberRows.add(member(PROJECT_A, VIEWER));

        assertEquals(PROJECT_A, service.requireProjectVisible(PROJECT_A, VIEWER).getId());
        // PM / 产品负责人即使没有成员行也放行：他们是该项目责任人，锁在外面等于项目无人可管
        assertEquals(PROJECT_A, service.requireProjectVisible(PROJECT_A, PM).getId());
        assertEquals(PROJECT_A, service.requireProjectVisible(PROJECT_A, PRODUCT_OWNER).getId());
        canSeeAll = true;
        assertEquals(PROJECT_A, service.requireProjectVisible(PROJECT_A, OUTSIDER).getId());
    }

    @Test
    @DisplayName("A.6 越权时先拒绝后取数：三个下钻入口都不会先去查交付项明细")
    void guardRunsBeforeAnyDetailQuery() {
        projectRows.add(project(PROJECT_A, RdmConstants.PROJECT_IN_PROGRESS));
        itemRows.add(item(11L, PROJECT_A, RdmConstants.DI_DEVELOPING, 1));

        assertThrows(BusinessException.class, () -> service.projectFact(PROJECT_A, OUTSIDER));
        assertThrows(BusinessException.class, () -> service.itemFacts(PROJECT_A, OUTSIDER));
        assertThrows(BusinessException.class, () -> service.todoBoard(PROJECT_A, OUTSIDER));

        verify(deliveryItemMapper, never()).selectList(any());
        verify(issueMapper, never()).selectList(any());
        verify(taskMapper, never()).selectList(any());
    }

    @Test
    @DisplayName("A.6 单项目下钻的范围只含该项目，不会顺带把别人项目的数据带进来")
    void drilldownScopeIsLimitedToThatProject() {
        projectRows.add(project(PROJECT_A, RdmConstants.PROJECT_IN_PROGRESS));
        projectRows.add(project(PROJECT_B, RdmConstants.PROJECT_IN_PROGRESS));
        itemRows.add(item(11L, PROJECT_A, RdmConstants.DI_DEVELOPING, 1));
        itemRows.add(item(12L, PROJECT_B, RdmConstants.DI_DEVELOPING, 1));
        memberRows.add(member(PROJECT_A, VIEWER));
        memberRows.add(member(PROJECT_B, VIEWER));

        List<RdmFactVO.ItemFact> facts = service.itemFacts(PROJECT_A, VIEWER);

        ArgumentCaptor<LambdaQueryWrapper<RdmProject>> captor =
                ArgumentCaptor.forClass(LambdaQueryWrapper.class);
        verify(projectMapper, org.mockito.Mockito.atLeastOnce()).selectList(captor.capture());
        Collection<Object> params = paramsOf(captor.getValue());
        assertTrue(params.contains(PROJECT_A));
        assertFalse(params.contains(PROJECT_B), "下钻A项目时不得把B项目放进范围");
        // mapper 已按 IN 参数过滤，因此下钻只能看到 A 项目的交付项
        assertEquals(1, facts.size());
        assertEquals(11L, facts.get(0).getItemId());
    }

    /* ==================== A.5 口径修复：集合条件 + 空集合 ==================== */

    @Test
    @DisplayName("A.5 提测批次按需求ID集合 IN 统计（旧实现对集合用 eq 单值条件，恒不命中）")
    void testBatchCountUsesCollectionCondition() {
        projectRows.add(project(PROJECT_A, RdmConstants.PROJECT_IN_PROGRESS));
        memberRows.add(member(PROJECT_A, VIEWER));
        itemRows.add(item(11L, PROJECT_A, RdmConstants.DI_DEVELOPING, 1));
        requirementRows.add(requirement(701L, PROJECT_A));
        requirementRows.add(requirement(702L, PROJECT_A));
        batchRows.add(batch(801L, 701L));
        batchRows.add(batch(802L, 701L));
        batchRows.add(batch(803L, 702L));
        batchRows.add(batch(804L, 999L));   // 不属于本项目需求

        RdmFactVO.ProjectFact fact = service.projectFact(PROJECT_A, VIEWER);

        assertEquals(3, fact.getTestBatchTotal());
        ArgumentCaptor<LambdaQueryWrapper<RdmTestBatch>> captor =
                ArgumentCaptor.forClass(LambdaQueryWrapper.class);
        verify(testBatchMapper).selectList(captor.capture());
        String sql = captor.getValue().getSqlSegment();
        assertTrue(sql.contains("req_id IN"), "必须是集合条件，实际 SQL=" + sql);
        assertFalse(sql.contains("req_id ="), "绝不允许对 ID 集合用 eq 单值条件");
        Collection<Object> params = paramsOf(captor.getValue());
        assertTrue(params.contains(701L) && params.contains(702L));
    }

    @Test
    @DisplayName("A.5 需求集合为空→不发提测批次SQL且计数为0（空IN会退化为全表命中）")
    void emptyRequirementCollectionSkipsTestBatchQuery() {
        projectRows.add(project(PROJECT_A, RdmConstants.PROJECT_IN_PROGRESS));
        memberRows.add(member(PROJECT_A, VIEWER));
        itemRows.add(item(11L, PROJECT_A, RdmConstants.DI_DEVELOPING, 1));

        RdmFactVO.ProjectFact fact = service.projectFact(PROJECT_A, VIEWER);

        assertEquals(0, fact.getRequirementTotal());
        assertEquals(0, fact.getTestBatchTotal());
        verify(testBatchMapper, never()).selectList(any());
    }

    @Test
    @DisplayName("A.5 交付项集合为空→任务/问题/延期/承接四类明细SQL一条都不发")
    void emptyItemCollectionSkipsAllDetailQueries() {
        projectRows.add(project(PROJECT_A, RdmConstants.PROJECT_IN_PROGRESS));
        memberRows.add(member(PROJECT_A, VIEWER));

        RdmFactVO.ProjectFact fact = service.projectFact(PROJECT_A, VIEWER);

        assertEquals(0, fact.getDeliveryItemTotal());
        assertEquals(0, fact.getPendingDecisionCount());
        assertEquals(0, fact.getDeferResidualCount());
        verify(taskMapper, never()).selectList(any());
        verify(issueMapper, never()).selectList(any());
        verify(issueDeferMapper, never()).selectList(any());
        verify(issueFollowupMapper, never()).selectList(any());
    }

    @Test
    @DisplayName("A.5 任务查询在SQL层排除已取消任务（不让取消的任务参与完成度统计）")
    void cancelledTasksAreExcludedAtQueryLevel() {
        projectRows.add(project(PROJECT_A, RdmConstants.PROJECT_IN_PROGRESS));
        memberRows.add(member(PROJECT_A, VIEWER));
        itemRows.add(item(11L, PROJECT_A, RdmConstants.DI_DEVELOPING, 1));

        service.projectFact(PROJECT_A, VIEWER);

        ArgumentCaptor<LambdaQueryWrapper<RdmWorkTask>> captor =
                ArgumentCaptor.forClass(LambdaQueryWrapper.class);
        verify(taskMapper).selectList(captor.capture());
        String sql = captor.getValue().getSqlSegment();
        assertTrue(sql.contains("delivery_item_id IN"), sql);
        assertTrue(sql.contains("status <>"), "应带 ne(cancelled) 条件，实际 SQL=" + sql);
        assertTrue(paramsOf(captor.getValue()).contains("cancelled"));
    }

    /* ==================== A.5 口径修复：不由状态推导测试/验收、不混算历史验收 ==================== */

    @Test
    @DisplayName("A.5 测试通过只认任务20 isTestPassed：任务全done也不能推导出测试通过")
    void testPassedIsNotDerivedFromTaskStatus() {
        projectRows.add(project(PROJECT_A, RdmConstants.PROJECT_IN_PROGRESS));
        memberRows.add(member(PROJECT_A, VIEWER));
        itemRows.add(item(11L, PROJECT_A, RdmConstants.DI_TESTING, 1));
        taskRows.add(task(901L, 11L, "done"));
        taskRows.add(task(902L, 11L, "done"));

        RdmFactVO.ItemFact denied = itemOf(service.itemFacts(PROJECT_A, VIEWER), 11L);
        assertEquals(2, denied.getTaskTotal());
        assertEquals(2, denied.getTaskCompleted());
        assertFalse(denied.isTestPassed(), "任务全完成 ≠ 测试通过");
        assertEquals(0, service.projectFact(PROJECT_A, VIEWER).getTestPassedItemCount());

        testPassedItems.add(11L);
        assertTrue(itemOf(service.itemFacts(PROJECT_A, VIEWER), 11L).isTestPassed());
        assertEquals(1, service.projectFact(PROJECT_A, VIEWER).getTestPassedItemCount());
        // 上面共触发了 4 次快照载入（itemFacts/projectFact 各两次），每次都只按交付项查一次权威事实
        verify(testBatchService, times(4)).isTestPassed(11L);
    }

    @Test
    @DisplayName("A.5 验收只认任务20：交付项status=done也不能推导出产品/业务验收通过")
    void acceptanceIsNotDerivedFromDeliveryStatus() {
        projectRows.add(project(PROJECT_A, RdmConstants.PROJECT_ALL_DELIVERED));
        memberRows.add(member(PROJECT_A, VIEWER));
        itemRows.add(item(11L, PROJECT_A, RdmConstants.DI_DONE, 2));

        RdmFactVO.ItemFact fact = itemOf(service.itemFacts(PROJECT_A, VIEWER), 11L);
        assertTrue(fact.isDelivered(), "交付完成这一事实本身成立");
        assertFalse(fact.isProductAccepted(), "但交付完成 ≠ 产品验收通过");
        assertFalse(fact.isBizAccepted(), "交付完成 ≠ 业务验收通过");

        RdmFactVO.ProjectFact project = service.projectFact(PROJECT_A, VIEWER);
        assertEquals(1, project.getDeliveryItemCompleted());
        assertEquals(0, project.getProductAcceptedItemCount());
        assertEquals(0, project.getBizAcceptedItemCount());

        productAcceptedItems.add(11L);
        bizAcceptedItems.add(11L);
        assertEquals(1, service.projectFact(PROJECT_A, VIEWER).getProductAcceptedItemCount());
        assertEquals(1, service.projectFact(PROJECT_A, VIEWER).getBizAcceptedItemCount());
    }

    @Test
    @DisplayName("A.5 不混算历史验收：验收结论按交付项当前scopeVersion逐个查询，版本号原样传递")
    void acceptanceIsQueriedAtCurrentScopeVersionOnly() {
        projectRows.add(project(PROJECT_A, RdmConstants.PROJECT_IN_PROGRESS));
        memberRows.add(member(PROJECT_A, VIEWER));
        itemRows.add(item(11L, PROJECT_A, RdmConstants.DI_PENDING_ACCEPTANCE, 1));
        itemRows.add(item(12L, PROJECT_A, RdmConstants.DI_PENDING_ACCEPTANCE, 3));
        RdmDeliveryItem nullVersion = item(13L, PROJECT_A, RdmConstants.DI_PENDING_ACCEPTANCE, null);
        itemRows.add(nullVersion);
        productAcceptedItems.add(11L);

        List<RdmFactVO.ItemFact> facts = service.itemFacts(PROJECT_A, VIEWER);

        assertEquals(1, productAcceptanceVersionByItem.get(11L), "旧范围项按版本1查");
        assertEquals(3, productAcceptanceVersionByItem.get(12L), "范围改过两次后按当前版本3查，不采信历史结论");
        assertNull(productAcceptanceVersionByItem.get(13L), "存量无版本号时原样传 null，不伪装成 0");
        assertEquals(1, bizAcceptanceVersionByItem.get(11L));
        assertEquals(3, bizAcceptanceVersionByItem.get(12L));
        // 每个交付项各查一次，事实源自己不额外 count(conclusion=pass)
        verify(acceptanceRecordService, times(3)).hasProductAcceptancePassed(any(), any());
        verify(acceptanceRecordService, times(3)).hasBizAcceptancePassed(any(), any());
        assertEquals(0, itemOf(facts, 13L).getScopeVersion(), "对外事实行的 scopeVersion 空值归 0");
        assertEquals(1, service.projectFact(PROJECT_A, VIEWER).getProductAcceptedItemCount());
    }

    /* ==================== A.5 口径修复：关闭项目 ≠ 交付完成 ==================== */

    @Test
    @DisplayName("A.5 关闭项目≠交付完成：closed与all_delivered是两个互不推导的布尔，卡片分列")
    void closedProjectIsNotAllDelivered() {
        projectRows.add(project(PROJECT_C, RdmConstants.PROJECT_CLOSED));
        projectRows.add(project(PROJECT_D, RdmConstants.PROJECT_ALL_DELIVERED));
        projectRows.add(project(PROJECT_A, RdmConstants.PROJECT_IN_PROGRESS));
        viewerIsMemberOfAll();

        List<RdmFactVO.ProjectFact> rows = service.projectFacts(query(), VIEWER);
        RdmFactVO.ProjectFact closed = projectOf(rows, PROJECT_C);
        RdmFactVO.ProjectFact delivered = projectOf(rows, PROJECT_D);
        assertTrue(closed.isClosed());
        assertFalse(closed.isAllDelivered(), "归档不等于交付完成");
        assertTrue(delivered.isAllDelivered());
        assertFalse(delivered.isClosed());

        RdmFactVO.CardSummary cards = service.cards(query(), VIEWER);
        assertEquals(1, cards.getClosedProjects());
        assertEquals(1, cards.getAllDeliveredProjects());
        assertEquals(3, cards.getTotalProjects());
        assertEquals(2, cards.getActiveProjects(), "in_progress 与 all_delivered 属于活跃，closed 不属于");

        RdmFactVO.Reconciliation recon = service.reconcile(query(), VIEWER);
        assertEquals(1, recon.getClosedProjectCount());
        assertEquals(1, recon.getAllDeliveredProjectCount());
        assertTrue(recon.isConsistent(), "实际=" + recon.getMismatches());
        assertTrue(recon.getMismatches().stream().noneMatch(m -> m.contains("混算")));
    }

    @Test
    @DisplayName("A.5 关闭项目的交付项不被算作交付完成（项目状态不参与交付项口径）")
    void closedProjectItemsAreNotCountedAsDelivered() {
        projectRows.add(project(PROJECT_C, RdmConstants.PROJECT_CLOSED));
        memberRows.add(member(PROJECT_C, VIEWER));
        itemRows.add(item(11L, PROJECT_C, RdmConstants.DI_DEVELOPING, 1));
        itemRows.add(item(12L, PROJECT_C, RdmConstants.DI_DONE, 1));

        RdmFactVO.ProjectFact fact = service.projectFact(PROJECT_C, VIEWER);

        assertTrue(fact.isClosed());
        assertFalse(fact.isAllDelivered());
        assertEquals(2, fact.getDeliveryItemTotal());
        assertEquals(1, fact.getDeliveryItemCompleted(), "只认交付项自身 status=done");
        assertEquals(1, service.cards(query(), VIEWER).getDeliveredItems());
        assertEquals(0, service.cards(query(), VIEWER).getAllDeliveredProjects());
    }

    /* ==================== A.5 口径修复：原范围延期残余 ==================== */

    @Test
    @DisplayName("A.5 原范围延期残余三条件齐备才算（已批准 + 旧范围 + 承接未闭环）")
    void deferResidualRequiresAllThreeConditions() {
        projectRows.add(project(PROJECT_A, RdmConstants.PROJECT_IN_PROGRESS));
        memberRows.add(member(PROJECT_A, VIEWER));
        itemRows.add(item(11L, PROJECT_A, RdmConstants.DI_DEVELOPING, 3));
        issueRows.add(issue(21L, 11L, RdmConstants.ISSUE_DEFERRED, RdmConstants.SEV_MAJOR));
        deferRows.add(defer(31L, 21L, RdmConstants.DEFER_EFFECTIVE, 1));

        assertEquals(1, itemOf(service.itemFacts(PROJECT_A, VIEWER), 11L).getDeferResidualCount(),
                "已批准 + defer范围1 < 交付项范围3 + 无承接 → 残余");
    }

    @Test
    @DisplayName("A.5 延期未获批准（待产品/待业务/被拒）不算残余：未批先延是任务21 明确禁止的口径")
    void unapprovedDeferIsNotResidual() {
        for (String status : List.of(RdmConstants.DEFER_PENDING_PRODUCT, RdmConstants.DEFER_PENDING_BIZ,
                RdmConstants.DEFER_REJECTED)) {
            setUpFresh();
            projectRows.add(project(PROJECT_A, RdmConstants.PROJECT_IN_PROGRESS));
            memberRows.add(member(PROJECT_A, VIEWER));
            itemRows.add(item(11L, PROJECT_A, RdmConstants.DI_DEVELOPING, 3));
            issueRows.add(issue(21L, 11L, RdmConstants.ISSUE_DEFERRED, RdmConstants.SEV_MAJOR));
            deferRows.add(defer(31L, 21L, status, 1));

            assertEquals(0, itemOf(service.itemFacts(PROJECT_A, VIEWER), 11L).getDeferResidualCount(),
                    "status=" + status + " 不应算残余");
        }
    }

    @Test
    @DisplayName("A.5 同一范围内的延期不算“原范围残余”（defer.scopeVersion≥item.scopeVersion或为空）")
    void sameScopeDeferIsNotResidual() {
        projectRows.add(project(PROJECT_A, RdmConstants.PROJECT_IN_PROGRESS));
        memberRows.add(member(PROJECT_A, VIEWER));
        itemRows.add(item(11L, PROJECT_A, RdmConstants.DI_DEVELOPING, 2));
        issueRows.add(issue(21L, 11L, RdmConstants.ISSUE_DEFERRED, RdmConstants.SEV_MAJOR));
        issueRows.add(issue(22L, 11L, RdmConstants.ISSUE_DEFERRED, RdmConstants.SEV_MAJOR));
        issueRows.add(issue(23L, 11L, RdmConstants.ISSUE_DEFERRED, RdmConstants.SEV_MAJOR));
        deferRows.add(defer(31L, 21L, RdmConstants.DEFER_EFFECTIVE, 2));    // 同范围
        deferRows.add(defer(32L, 22L, RdmConstants.DEFER_EFFECTIVE, 5));    // 更新的“范围”
        deferRows.add(defer(33L, 23L, RdmConstants.DEFER_EFFECTIVE, null)); // 存量无版本号

        assertEquals(0, itemOf(service.itemFacts(PROJECT_A, VIEWER), 11L).getDeferResidualCount(),
                "只有旧范围的延期才是残余，同范围/新范围/无版本号都不算");
        assertEquals(0, service.reconcile(query(), VIEWER).getDeferResidualDirect());
    }

    @Test
    @DisplayName("A.5 承接已闭环（新问题已解决/取消/合并）不再是欠帐；未闭环仍算残余")
    void closedFollowupClearsResidual() {
        for (String closedStatus : List.of(RdmConstants.ISSUE_RESOLVED, RdmConstants.ISSUE_CANCELLED,
                RdmConstants.ISSUE_MERGED)) {
            setUpFresh();
            givenResidualBaseFixture();
            followupRows.add(followup(41L, 21L, 22L, RdmConstants.FOLLOWUP_ACTIVE));
            followupIssueRows.add(issue(22L, null, closedStatus, RdmConstants.SEV_MAJOR));

            assertEquals(0, itemOf(service.itemFacts(PROJECT_A, VIEWER), 11L).getDeferResidualCount(),
                    "承接所指新问题已 " + closedStatus + "，欠帐已清");
        }

        setUpFresh();
        givenResidualBaseFixture();
        followupRows.add(followup(41L, 21L, 22L, RdmConstants.FOLLOWUP_ACTIVE));
        followupIssueRows.add(issue(22L, null, RdmConstants.ISSUE_OPEN, RdmConstants.SEV_MAJOR));
        assertEquals(1, itemOf(service.itemFacts(PROJECT_A, VIEWER), 11L).getDeferResidualCount(),
                "承接所指新问题仍未关闭 → 残余仍在");

        setUpFresh();
        givenResidualBaseFixture();
        followupRows.add(followup(41L, 21L, null, RdmConstants.FOLLOWUP_ACTIVE));
        assertEquals(1, itemOf(service.itemFacts(PROJECT_A, VIEWER), 11L).getDeferResidualCount(),
                "已批准但承接未绑定新问题 → 欠帐仍在");

        setUpFresh();
        givenResidualBaseFixture();
        followupRows.add(followup(41L, 21L, 22L, RdmConstants.FOLLOWUP_INACTIVE));
        followupIssueRows.add(issue(22L, null, RdmConstants.ISSUE_RESOLVED, RdmConstants.SEV_MAJOR));
        assertEquals(1, itemOf(service.itemFacts(PROJECT_A, VIEWER), 11L).getDeferResidualCount(),
                "承接已失效（active=0）等于没有承接，不能被它洗白");
    }

    private void givenResidualBaseFixture() {
        projectRows.add(project(PROJECT_A, RdmConstants.PROJECT_IN_PROGRESS));
        memberRows.add(member(PROJECT_A, VIEWER));
        itemRows.add(item(11L, PROJECT_A, RdmConstants.DI_DEVELOPING, 3));
        issueRows.add(issue(21L, 11L, RdmConstants.ISSUE_DEFERRED, RdmConstants.SEV_MAJOR));
        deferRows.add(defer(31L, 21L, RdmConstants.DEFER_EFFECTIVE, 1));
    }

    /** 循环内重建 mock 与 service（Mockito 的 @BeforeEach 不会在参数化循环里重跑） */
    private void setUpFresh() {
        projectRows.clear();
        memberRows.clear();
        itemRows.clear();
        requirementRows.clear();
        batchRows.clear();
        taskRows.clear();
        issueRows.clear();
        followupIssueRows.clear();
        deferRows.clear();
        followupRows.clear();
        testPassedItems.clear();
        productAcceptedItems.clear();
        bizAcceptedItems.clear();
        productAcceptanceVersionByItem.clear();
        bizAcceptanceVersionByItem.clear();
        blockedTasks.clear();
        pendingDecisionDirectOverride = null;
        canSeeAll = false;
    }

    @Test
    @DisplayName("A.5/A.7 残余延期数：行级相加 == 残余集合条数 == 对账路径B == 卡片")
    void deferResidualCountIsConsistentEverywhere() {
        projectRows.add(project(PROJECT_A, RdmConstants.PROJECT_IN_PROGRESS));
        memberRows.add(member(PROJECT_A, VIEWER));
        itemRows.add(item(11L, PROJECT_A, RdmConstants.DI_DEVELOPING, 3));
        itemRows.add(item(12L, PROJECT_A, RdmConstants.DI_DEVELOPING, 3));
        issueRows.add(issue(21L, 11L, RdmConstants.ISSUE_DEFERRED, RdmConstants.SEV_MAJOR));
        issueRows.add(issue(22L, 11L, RdmConstants.ISSUE_DEFERRED, RdmConstants.SEV_CRITICAL));
        issueRows.add(issue(23L, 12L, RdmConstants.ISSUE_DEFERRED, RdmConstants.SEV_MAJOR));
        deferRows.add(defer(31L, 21L, RdmConstants.DEFER_EFFECTIVE, 1));
        // pending_bind（待建立承接）也属于已批准，且 2 < 3 → 同样算残余
        deferRows.add(defer(32L, 21L, RdmConstants.DEFER_PENDING_BIND, 2));
        deferRows.add(defer(33L, 22L, RdmConstants.DEFER_EFFECTIVE, 0));
        deferRows.add(defer(34L, 23L, RdmConstants.DEFER_EFFECTIVE, 3));   // 同范围，不算

        List<RdmFactVO.ItemFact> items = service.itemFacts(PROJECT_A, VIEWER);
        assertEquals(3, itemOf(items, 11L).getDeferResidualCount());
        assertEquals(0, itemOf(items, 12L).getDeferResidualCount(), "同范围的延期不算原范围残余");

        RdmFactVO.ProjectFact project = service.projectFact(PROJECT_A, VIEWER);
        RdmFactVO.Reconciliation recon = service.reconcile(query(), VIEWER);
        RdmFactVO.CardSummary cards = service.cards(query(), VIEWER);
        assertEquals(3, project.getDeferResidualCount());
        assertEquals(3, recon.getDeferResidualSum());
        assertEquals(3, recon.getDeferResidualDirect());
        assertEquals(3, cards.getDeferResidualCount());
        assertTrue(recon.getMismatches().stream().noneMatch(m -> m.contains("延期殘餘")),
                "实际=" + recon.getMismatches());
    }

    /* ==================== A.5 其它口径 / 健壮性 ==================== */

    @Test
    @DisplayName("A.5 行级事实：逾期只算未完成项、阻塞只认blockedFlag、阻断任务数复用调度侧口径")
    void itemFactRowLevelDefinitions() {
        projectRows.add(project(PROJECT_A, RdmConstants.PROJECT_IN_PROGRESS));
        memberRows.add(member(PROJECT_A, VIEWER));
        RdmDeliveryItem overdueDone = item(11L, PROJECT_A, RdmConstants.DI_DONE, 1);
        overdueDone.setPlanEndDate(PAST);
        RdmDeliveryItem overdueActive = item(12L, PROJECT_A, RdmConstants.DI_DEVELOPING, 1);
        overdueActive.setPlanEndDate(PAST);
        overdueActive.setBlockedFlag(1);
        RdmDeliveryItem future = item(13L, PROJECT_A, RdmConstants.DI_PENDING_ACCEPTANCE, 1);
        itemRows.add(overdueDone);
        itemRows.add(overdueActive);
        itemRows.add(future);
        blockedTasks.put(12L, List.of(blocked(1L), blocked(2L), blocked(3L)));

        List<RdmFactVO.ItemFact> facts = service.itemFacts(PROJECT_A, VIEWER);
        assertFalse(itemOf(facts, 11L).isOverdue(), "已交付完成就不再算逾期");
        assertTrue(itemOf(facts, 11L).isDelivered());
        assertTrue(itemOf(facts, 12L).isOverdue());
        assertTrue(itemOf(facts, 12L).isBlocked());
        assertEquals(3, itemOf(facts, 12L).getBlockedTaskCount());
        assertFalse(itemOf(facts, 13L).isOverdue());
        assertTrue(RdmTodoBoardService.isReachedAcceptanceStage(itemOf(facts, 13L)));

        RdmFactVO.ProjectFact project = service.projectFact(PROJECT_A, VIEWER);
        assertEquals(1, project.getDeliveryItemCompleted());
        assertEquals(1, project.getDeliveryItemOverdue());
        assertEquals(1, project.getDeliveryItemBlocked());
        assertEquals(1, project.getDeliveryItemPendingAcceptance());
        assertEquals(2, project.getDeliveryItemInProgress(), "developing 与 pending_acceptance 都算未完成且在推进");
        assertEquals(3, project.getBlockedTaskCount());
    }

    @Test
    @DisplayName("A.5 已取消任务不计入总数（SQL 层排除），done/doing 分计")
    void taskCountersSplitDoneAndDoing() {
        projectRows.add(project(PROJECT_A, RdmConstants.PROJECT_IN_PROGRESS));
        memberRows.add(member(PROJECT_A, VIEWER));
        itemRows.add(item(11L, PROJECT_A, RdmConstants.DI_DEVELOPING, 1));
        taskRows.add(task(901L, 11L, "done"));
        taskRows.add(task(902L, 11L, "doing"));
        taskRows.add(task(903L, 11L, "todo"));
        taskRows.add(task(904L, 11L, null));

        RdmFactVO.ItemFact fact = itemOf(service.itemFacts(PROJECT_A, VIEWER), 11L);
        assertEquals(4, fact.getTaskTotal());
        assertEquals(1, fact.getTaskCompleted());
        assertEquals(1, fact.getTaskInProgress());
        assertEquals(4, service.projectFact(PROJECT_A, VIEWER).getTaskTotal());
    }

    @Test
    @DisplayName("B.2 交付项并发版本随事实行带出，作为通知去重 event_version 的 VERSION:<n> 来源")
    void versionIsCarriedForNotifyDeduplication() {
        projectRows.add(project(PROJECT_A, RdmConstants.PROJECT_IN_PROGRESS));
        memberRows.add(member(PROJECT_A, VIEWER));
        RdmDeliveryItem withVersion = item(11L, PROJECT_A, RdmConstants.DI_DEVELOPING, 1);
        withVersion.setVersion(7);
        RdmDeliveryItem withoutVersion = item(12L, PROJECT_A, RdmConstants.DI_DEVELOPING, 1);
        withoutVersion.setVersion(null);
        itemRows.add(withVersion);
        itemRows.add(withoutVersion);

        List<RdmFactVO.ItemFact> facts = service.itemFacts(PROJECT_A, VIEWER);
        assertEquals(7, itemOf(facts, 11L).getVersion());
        assertNull(itemOf(facts, 12L).getVersion(), "存量未启用乐观锁列时保持 null，通知侧退化为 VERSION:0");
        assertEquals(8, service.projectFact(PROJECT_A, VIEWER).getVersion());
    }

    @Test
    @DisplayName("A.4 事实行的 actionUrl 全部是前端已注册路由（下钻用项目详情、明细用交付项页）")
    void actionUrlsAreRegisteredRoutes() {
        givenRichFixture();

        RdmFactVO.ExportBundle bundle = service.exportBundle(query(), VIEWER);
        assertEquals(RdmConstants.projectDetailRoute(PROJECT_A),
                projectOf(bundle.getProjects(), PROJECT_A).getActionUrl());
        assertEquals(RdmConstants.deliveryItemRoute(11L), itemOf(bundle.getItems(), 11L).getActionUrl());
        for (RdmFactVO.Todo todo : bundle.getTodos()) {
            assertNotNull(todo.getActionUrl());
            assertFalse(todo.getActionUrl().contains("/rdm/project/delivery"),
                    "不得出现未注册路由：" + todo.getActionUrl());
        }
    }

    @Test
    @DisplayName("健壮性：结果集里的 null 行与缺主键行被跳过，不抛异常也不虚增计数")
    void nullAndIdLessRowsAreSkipped() {
        projectRows.add(null);
        projectRows.add(project(PROJECT_A, RdmConstants.PROJECT_IN_PROGRESS));
        RdmProject noId = project(0L, RdmConstants.PROJECT_IN_PROGRESS);
        noId.setId(null);
        projectRows.add(noId);
        memberRows.add(member(PROJECT_A, VIEWER));
        itemRows.add(null);
        RdmDeliveryItem noIdItem = item(0L, PROJECT_A, RdmConstants.DI_DEVELOPING, 1);
        noIdItem.setId(null);
        itemRows.add(noIdItem);
        itemRows.add(item(11L, PROJECT_A, RdmConstants.DI_DEVELOPING, 1));
        issueRows.add(null);
        issueRows.add(issue(21L, 11L, RdmConstants.ISSUE_OPEN, RdmConstants.SEV_MAJOR));

        RdmFactVO.ExportBundle bundle = service.exportBundle(query(), VIEWER);

        assertEquals(1, bundle.getProjects().size());
        assertEquals(1, bundle.getItems().size());
        assertEquals(1, bundle.getCards().getPendingDecisionCount());
        assertTrue(bundle.getReconciliation().isConsistent(),
                "实际=" + bundle.getReconciliation().getMismatches());
    }

    @Test
    @DisplayName("健壮性：查询条件为 null 时按默认查询处理，不抛 NPE")
    void nullQueryIsNormalized() {
        projectRows.add(project(PROJECT_A, RdmConstants.PROJECT_IN_PROGRESS));
        memberRows.add(member(PROJECT_A, VIEWER));
        itemRows.add(item(11L, PROJECT_A, RdmConstants.DI_DEVELOPING, 1));

        assertEquals(1, service.cards(null, VIEWER).getTotalProjects());
        assertEquals(1, service.projectFacts(null, VIEWER).size());
        assertTrue(service.reconcile(null, VIEWER).isConsistent());
        assertEquals(1, service.exportBundle(null, VIEWER).getProjects().size());
    }

    @Test
    @DisplayName("A.1 待办只算一次看板再按项目切分：Σ各项目待办 == 看板总数（逐项目建看板会重复计数）")
    void todoCountsAreSplitFromSingleBoard() {
        givenRichFixture();

        RdmFactVO.TodoBoard board = service.todoBoard(null, VIEWER);
        List<RdmFactVO.ProjectFact> rows = service.projectFacts(query(), VIEWER);

        assertTrue(board.getTotal() > 0);
        assertEquals(board.getTotal(), sum(rows, RdmFactVO.ProjectFact::getTodoTotal));
        assertEquals(board.getMineCount(), sum(rows, RdmFactVO.ProjectFact::getTodoMineCount));
        assertEquals(board.getWaitingOthersCount(), sum(rows, RdmFactVO.ProjectFact::getTodoWaitingOthersCount));
        assertEquals(board.getUnassignedCount(), sum(rows, RdmFactVO.ProjectFact::getTodoUnassignedCount));
        assertEquals(board.getTotal(),
                board.getMineCount() + board.getWaitingOthersCount() + board.getUnassignedCount());
        assertEquals(board.getTotal(), board.getTodos().size());
        assertEquals(board.getTodos().stream().map(RdmFactVO.Todo::getKey).distinct().count(),
                board.getTodos().size(), "去重键不得重复");
    }

    @Test
    @DisplayName("A.1 项目下钻看板与跨项目看板对同一项目给出同一批待办（不是两套口径）")
    void projectScopedBoardMatchesCrossProjectBoard() {
        givenRichFixture();

        RdmFactVO.TodoBoard crossProject = service.todoBoard(null, VIEWER);
        RdmFactVO.TodoBoard scoped = service.todoBoard(PROJECT_A, VIEWER);

        Set<String> expected = new HashSet<>();
        for (RdmFactVO.Todo todo : crossProject.getTodos()) {
            if (Long.valueOf(PROJECT_A).equals(todo.getProjectId())) {
                expected.add(todo.getKey());
            }
        }
        Set<String> actual = new HashSet<>();
        scoped.getTodos().forEach(t -> actual.add(t.getKey()));
        assertEquals(expected, actual);
        assertEquals(scoped.getTotal(), scoped.getTodos().size());
    }

    @Test
    @DisplayName("A.7 空范围（未登录/未参与项目）时导出包与对账仍可用且全为0，不发多余SQL")
    void emptyScopeStillProducesUsableExportBundle() {
        projectRows.add(project(PROJECT_A, RdmConstants.PROJECT_IN_PROGRESS));
        itemRows.add(item(11L, PROJECT_A, RdmConstants.DI_DEVELOPING, 1));

        RdmFactVO.ExportBundle bundle = service.exportBundle(query(), OUTSIDER);

        assertNotNull(bundle);
        assertEquals(0, bundle.getCards().getTotalProjects());
        assertTrue(bundle.getProjects().isEmpty());
        assertTrue(bundle.getItems().isEmpty());
        assertTrue(bundle.getTodos().isEmpty());
        assertEquals(0, bundle.getReconciliation().getProjectCount());
        assertTrue(bundle.getReconciliation().isConsistent());
        assertNotNull(bundle.getComputedAt());
        verify(deliveryItemMapper, never()).selectList(any());
    }
}
