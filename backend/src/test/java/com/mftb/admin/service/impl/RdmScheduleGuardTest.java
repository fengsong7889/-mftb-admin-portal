package com.mftb.admin.service.impl;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.RdmScheduleDTO;
import com.mftb.admin.dto.RdmScheduleVO;
import com.mftb.admin.entity.RdmRequirement;
import com.mftb.admin.entity.RdmTaskDependency;
import com.mftb.admin.entity.RdmWorkCalendar;
import com.mftb.admin.entity.RdmWorkTask;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.RdmMilestoneMapper;
import com.mftb.admin.mapper.RdmRequirementMapper;
import com.mftb.admin.mapper.RdmTaskDependencyMapper;
import com.mftb.admin.mapper.RdmWorkCalendarMapper;
import com.mftb.admin.mapper.RdmWorkTaskMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.RdmAccessGuard;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.math.BigDecimal;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 排程守卫测试（阶段 5）。
 * <p>锁死两类结论：
 * <ol>
 *   <li>依赖图必须是有向无环图，且两端同属一条需求——否则关键路径算出来是假的；</li>
 *   <li>工期按工作日与该人的日历推演，负载超容量必须被标出来而不是被平均值盖住。</li>
 * </ol>
 */
class RdmScheduleGuardTest {

    private RdmTaskDependencyMapper dependencyMapper;
    private RdmWorkCalendarMapper calendarMapper;
    private RdmWorkTaskMapper taskMapper;
    private RdmMilestoneMapper milestoneMapper;
    private SysUserMapper userMapper;
    private RdmAccessGuard accessGuard;
    private OperatorResolver operatorResolver;
    private JdbcTemplate jdbcTemplate;
    private RdmScheduleServiceImpl service;

    private static final long OWNER = 41L;

    @BeforeEach
    void setUp() {
        dependencyMapper = mock(RdmTaskDependencyMapper.class);
        calendarMapper = mock(RdmWorkCalendarMapper.class);
        taskMapper = mock(RdmWorkTaskMapper.class);
        milestoneMapper = mock(RdmMilestoneMapper.class);
        userMapper = mock(SysUserMapper.class);
        accessGuard = mock(RdmAccessGuard.class);
        operatorResolver = mock(OperatorResolver.class);
        jdbcTemplate = mock(JdbcTemplate.class);
        RdmRequirementMapper requirementMapper = mock(RdmRequirementMapper.class);
        // 日历保存会先确认人存在（排程输入不能指向一个不存在的人）
        SysUser owner = new SysUser();
        owner.setId(OWNER);
        owner.setEmpId("MF00041");
        owner.setName("李四");
        owner.setStatus(1);
        when(userMapper.selectById(any())).thenReturn(owner);
        service = new RdmScheduleServiceImpl(dependencyMapper, calendarMapper, taskMapper,
                requirementMapper, milestoneMapper, userMapper,
                accessGuard, operatorResolver, jdbcTemplate);

        SysUser current = new SysUser();
        current.setId(OWNER);
        current.setEmpId("MF00041");
        current.setName("李四");
        when(operatorResolver.currentUser()).thenReturn(current);
        when(operatorResolver.operatorSignature(any())).thenReturn("MF00041|李四");
        when(accessGuard.canSeeAll(any())).thenReturn(true);
        when(accessGuard.requireVisible(any(), anyString())).thenReturn(requirement());
        when(accessGuard.requireDeliveryWriter(any(), anyString())).thenReturn(requirement());
        when(dependencyMapper.selectList(any())).thenReturn(List.of());
        // 真实 insert 会回填主键：环检测失败时要靠这个 id 回滚刚写入的边
        when(dependencyMapper.insert(any(RdmTaskDependency.class))).thenAnswer(inv -> {
            inv.getArgument(0, RdmTaskDependency.class).setId(55L);
            return 1;
        });
        when(calendarMapper.selectList(any())).thenReturn(List.of());
        when(taskMapper.selectList(any())).thenReturn(List.of());
        when(milestoneMapper.selectList(any())).thenReturn(List.of());
    }

    private static RdmRequirement requirement() {
        RdmRequirement req = new RdmRequirement();
        req.setId(1L);
        req.setReqNo("XQ202610060001");
        req.setTitle("門店自營活動報名後台");
        req.setStatus("developing");
        req.setSubmitterUserId(11L);
        req.setAssigneePmUserId(21L);
        return req;
    }

    private static RdmWorkTask task(long id, String title, String hours) {
        RdmWorkTask task = new RdmWorkTask();
        task.setId(id);
        task.setReqId(1L);
        task.setTaskNo("TK" + id);
        task.setTitle(title);
        task.setTaskType("backend");
        task.setStatus("todo");
        task.setProgress(0);
        task.setOwnerUserId(OWNER);
        task.setOwnerName("李四");
        task.setPlanHours(new BigDecimal(hours));
        return task;
    }

    private static RdmTaskDependency edge(long pred, long succ) {
        RdmTaskDependency edge = new RdmTaskDependency();
        edge.setReqId(1L);
        edge.setPredTaskId(pred);
        edge.setSuccTaskId(succ);
        edge.setDepType(RdmTaskDependency.TYPE_FS);
        edge.setLagDays(0);
        return edge;
    }

    private static RdmScheduleDTO.Dependency dep(Long pred, Long succ) {
        RdmScheduleDTO.Dependency dto = new RdmScheduleDTO.Dependency();
        dto.setReqId(1L);
        dto.setPredTaskId(pred);
        dto.setSuccTaskId(succ);
        return dto;
    }

    /** 下一个工作日（跳过周末），用于按天断言排程结果 */
    private static LocalDate nextWorkDay(LocalDate from) {
        LocalDate cursor = from.plusDays(1);
        while (cursor.getDayOfWeek() == DayOfWeek.SATURDAY || cursor.getDayOfWeek() == DayOfWeek.SUNDAY) {
            cursor = cursor.plusDays(1);
        }
        return cursor;
    }

    @Test
    @DisplayName("任务不能依赖自己，也不能跨需求建依赖")
    void selfAndCrossRequirementDependencyRejected() {
        BusinessException self = assertThrows(BusinessException.class, () -> service.addDependency(dep(7L, 7L)));
        assertTrue(self.getMessage().contains("依賴自己"), self.getMessage());

        when(taskMapper.selectById(7L)).thenReturn(task(7L, "報名接口", "8"));
        RdmWorkTask other = task(8L, "別的需求任務", "8");
        other.setReqId(99L);
        when(taskMapper.selectById(8L)).thenReturn(other);

        BusinessException cross = assertThrows(BusinessException.class, () -> service.addDependency(dep(7L, 8L)));
        // requireTask 会先报“任务不属于该需求”，同需求校验报“必须同属一条需求”：两者都是跨需求拦截
        assertTrue(cross.getMessage().contains("需求"), cross.getMessage());
    }

    @Test
    @DisplayName("重复依赖被拒绝，成环的依赖写入后回滚")
    void duplicateAndCyclicDependencyRejected() {
        when(taskMapper.selectById(7L)).thenReturn(task(7L, "報名接口", "8"));
        when(taskMapper.selectById(8L)).thenReturn(task(8L, "活動頁", "8"));
        when(dependencyMapper.selectCount(any())).thenReturn(1L);

        BusinessException dup = assertThrows(BusinessException.class, () -> service.addDependency(dep(7L, 8L)));
        assertTrue(dup.getMessage().contains("已存在"), dup.getMessage());

        // 去掉重复判定，改为写入后共同成环（B→A 已存在，新增 A→B）
        when(dependencyMapper.selectCount(any())).thenReturn(0L);
        when(dependencyMapper.selectList(any())).thenReturn(List.of(edge(8L, 7L), edge(7L, 8L)));
        BusinessException cycle = assertThrows(BusinessException.class, () -> service.addDependency(dep(7L, 8L)));
        assertTrue(cycle.getMessage().contains("循環依賴"), cycle.getMessage());
        verify(dependencyMapper).deleteById(any(Long.class));
    }

    @Test
    @DisplayName("串行依赖推演：后继只能在前驱完成后的下一个工作日开工")
    void dependencyChainSchedulesSequentially() {
        when(taskMapper.selectList(any())).thenReturn(List.of(task(7L, "報名接口", "8"), task(8L, "活動頁", "8")));
        when(dependencyMapper.selectList(any())).thenReturn(List.of(edge(7L, 8L)));

        RdmScheduleVO.Plan plan = service.plan(1L);

        assertFalse(plan.getCyclic());
        RdmScheduleVO.Bar first = barOf(plan, 7L);
        RdmScheduleVO.Bar second = barOf(plan, 8L);
        assertNotNull(first.getEarliestFinish());
        assertEquals(1, first.getDurationDays());
        // 串行链上两张任务都没有松弛，都是关键路径
        assertEquals(List.of(7L, 8L), plan.getCriticalPath());
        LocalDate predFinish = LocalDate.parse(first.getEarliestFinish());
        LocalDate succStart = LocalDate.parse(second.getEarliestStart());
        assertEquals(nextWorkDay(predFinish), succStart);
    }

    @Test
    @DisplayName("有松弛的并行任务不在关键路径上")
    void parallelTaskWithSlackIsNotCritical() {
        // A(4天) → C(1天)，B(1天) 独立：B 有 4 天松弛
        RdmWorkTask a = task(7L, "核心接口", "32");
        RdmWorkTask b = task(8L, "文案調整", "8");
        RdmWorkTask c = task(9L, "聯調", "8");
        when(taskMapper.selectList(any())).thenReturn(List.of(a, b, c));
        when(dependencyMapper.selectList(any())).thenReturn(List.of(edge(7L, 9L)));

        RdmScheduleVO.Plan plan = service.plan(1L);

        assertTrue(plan.getCriticalPath().contains(7L));
        assertTrue(plan.getCriticalPath().contains(9L));
        assertFalse(plan.getCriticalPath().contains(8L));
        assertTrue(barOf(plan, 8L).getSlackDays() > 0);
    }

    @Test
    @DisplayName("请假日会把后继任务推到自己真正上班的那天")
    void leaveDayPushesSuccessorForward() {
        LocalDate today = LocalDate.now();
        LocalDate blocked = nextWorkDay(today);
        RdmWorkCalendar leave = new RdmWorkCalendar();
        leave.setUserId(OWNER);
        leave.setDay(blocked);
        leave.setDayType(RdmWorkCalendar.TYPE_LEAVE);
        leave.setAvailableHours(BigDecimal.ZERO);
        when(taskMapper.selectList(any())).thenReturn(List.of(task(7L, "報名接口", "8"), task(8L, "活動頁", "8")));
        when(dependencyMapper.selectList(any())).thenReturn(List.of(edge(7L, 8L)));
        when(calendarMapper.selectList(any())).thenReturn(List.of(leave));

        RdmScheduleVO.Plan plan = service.plan(1L);
        RdmScheduleVO.Bar second = barOf(plan, 8L);

        LocalDate start = LocalDate.parse(second.getEarliestStart());
        assertTrue(start.isAfter(blocked), "后继任务不能在请假日开工，实际: " + start + " 应晚于 " + blocked);
    }

    @Test
    @DisplayName("历史脏数据成环时不给关键路径结论")
    void cyclicGraphRefusesCriticalPath() {
        when(taskMapper.selectList(any())).thenReturn(List.of(task(7L, "A", "8"), task(8L, "B", "8")));
        when(dependencyMapper.selectList(any())).thenReturn(List.of(edge(7L, 8L), edge(8L, 7L)));

        RdmScheduleVO.Plan plan = service.plan(1L);

        assertTrue(plan.getCyclic());
        assertTrue(plan.getCriticalPath().isEmpty());
        assertFalse(barOf(plan, 7L).getCritical());
    }

    @Test
    @DisplayName("负载按工作日摊派，超过当天可用容量即标过载")
    void workloadMarksOverloadedDays() {
        // 同一人同区间两条任务：40 + 20 人时挤在 5 个工作日 → 必然有过载日
        RdmWorkTask heavy = task(7L, "報名接口", "40");
        heavy.setPlanStartDate(LocalDate.now());
        heavy.setPlanFinishDate(LocalDate.now().plusDays(4));
        RdmWorkTask extra = task(8L, "臨時支援", "20");
        extra.setPlanStartDate(LocalDate.now());
        extra.setPlanFinishDate(LocalDate.now().plusDays(4));
        when(taskMapper.selectList(any())).thenReturn(List.of(heavy, extra));

        RdmScheduleVO.Workload workload = service.workload(LocalDate.now().toString(),
                LocalDate.now().plusDays(4).toString(), null);

        assertEquals(1, workload.getPeople().size());
        RdmScheduleVO.Person person = workload.getPeople().get(0);
        assertEquals(0, new BigDecimal("60").compareTo(person.getTotalPlanned()));
        assertTrue(person.getOverloadedDays() > 0, "60 人时挤进一周必然有过载日");
        assertTrue(person.getUtilization() > 100);
        assertTrue(person.getDays().stream().anyMatch(d -> Boolean.TRUE.equals(d.getOverloaded())));
    }

    @Test
    @DisplayName("无全量数据范围的人只能看自己的负载")
    void workloadFallsBackToSelfWithoutScope() {
        when(accessGuard.canSeeAll(any())).thenReturn(false);
        when(taskMapper.selectList(any())).thenReturn(List.of(task(7L, "我的任務", "8")));

        RdmScheduleVO.Workload workload = service.workload(null, null, 999L);

        assertTrue(workload.getSelfOnly());
        assertEquals(OWNER, workload.getPeople().get(0).getUserId());
    }

    @Test
    @DisplayName("休假必须写原因，可用工时不得超过 16 小时")
    void calendarRulesEnforced() {
        RdmScheduleDTO.Calendar noReason = new RdmScheduleDTO.Calendar();
        noReason.setUserId(OWNER);
        RdmScheduleDTO.CalendarDay leave = new RdmScheduleDTO.CalendarDay();
        leave.setDay(LocalDate.now().plusDays(3).toString());
        leave.setDayType(RdmWorkCalendar.TYPE_LEAVE);
        noReason.setDays(List.of(leave));
        BusinessException ex = assertThrows(BusinessException.class, () -> service.saveCalendar(noReason));
        assertTrue(ex.getMessage().contains("寫明原因"), ex.getMessage());

        RdmScheduleDTO.Calendar tooMuch = new RdmScheduleDTO.Calendar();
        tooMuch.setUserId(OWNER);
        RdmScheduleDTO.CalendarDay custom = new RdmScheduleDTO.CalendarDay();
        custom.setDay(LocalDate.now().plusDays(3).toString());
        custom.setDayType(RdmWorkCalendar.TYPE_CUSTOM);
        custom.setAvailableHours(new BigDecimal("18"));
        tooMuch.setDays(List.of(custom));
        assertThrows(BusinessException.class, () -> service.saveCalendar(tooMuch));
    }

    @Test
    @DisplayName("不能改别人的工作日历（除非有全量数据范围）")
    void otherPeopleCalendarRejected() {
        when(accessGuard.canSeeAll(any())).thenReturn(false);
        RdmScheduleDTO.Calendar dto = new RdmScheduleDTO.Calendar();
        dto.setUserId(999L);
        dto.setDays(List.of());

        BusinessException ex = assertThrows(BusinessException.class, () -> service.saveCalendar(dto));
        assertTrue(ex.getMessage().contains("本人"), ex.getMessage());
    }

    private static RdmScheduleVO.Bar barOf(RdmScheduleVO.Plan plan, long taskId) {
        return plan.getBars().stream().filter(b -> b.getTaskId() == taskId).findFirst().orElseThrow();
    }
}
