package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.RdmScheduleDTO;
import com.mftb.admin.dto.RdmScheduleVO;
import com.mftb.admin.entity.RdmMilestone;
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
import com.mftb.admin.service.RdmScheduleService;
import com.mftb.admin.util.DateTimeUtils;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 排程实现（阶段 5）。
 *
 * <p>三件容易做错的事，这里按可辩护的口径处理：
 * <ol>
 *   <li><b>环</b>：写入时做 DFS 检测直接拒绝；读取排程时再兜一次，发现历史脏数据成环
 *       就不给关键路径结论（画一条假的最长路径比说"算不出"更危险）。</li>
 *   <li><b>工作日</b>：工期按 8 人时/工作日折算，跳过周末与该人的请假日、允许加班日；
 *       推演起点不早于今天，否则算出的完工日一定偏乐观。</li>
 *   <li><b>负载</b>：把任务计划工时摊到该人区间内的工作日上，超过当天可用容量即过载；
 *       无全量数据范围的人只能看自己，负载数据不能变成互相打探的工具。</li>
 * </ol>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RdmScheduleServiceImpl implements RdmScheduleService {

    /** 一个标准工作日的工时（人时） */
    private static final BigDecimal HOURS_PER_DAY = RdmWorkCalendar.DEFAULT_DAY_HOURS;

    /** 负载视图默认与最大跨度（天）：不设上限会让一次查询摊平几年的任务 */
    private static final int DEFAULT_WORKLOAD_DAYS = 28;
    private static final int MAX_WORKLOAD_DAYS = 92;

    private final RdmTaskDependencyMapper dependencyMapper;
    private final RdmWorkCalendarMapper calendarMapper;
    private final RdmWorkTaskMapper taskMapper;
    private final RdmRequirementMapper requirementMapper;
    private final RdmMilestoneMapper milestoneMapper;
    private final SysUserMapper userMapper;
    private final RdmAccessGuard accessGuard;
    private final OperatorResolver operatorResolver;
    private final JdbcTemplate jdbcTemplate;

    /* ==================== 依赖 ==================== */

    @Override
    public List<RdmScheduleVO.Dependency> listDependencies(Long reqId) {
        accessGuard.requireVisible(reqId, "查看任務依賴");
        return dependencyMapper.selectList(new LambdaQueryWrapper<RdmTaskDependency>()
                        .eq(RdmTaskDependency::getReqId, reqId).orderByAsc(RdmTaskDependency::getId))
                .stream().map(this::toDependencyVO).toList();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public RdmScheduleVO.Dependency addDependency(RdmScheduleDTO.Dependency dto) {
        if (dto == null || dto.getReqId() == null || dto.getPredTaskId() == null || dto.getSuccTaskId() == null) {
            throw new BusinessException("請選擇前置任務與後續任務");
        }
        if (dto.getPredTaskId().equals(dto.getSuccTaskId())) {
            throw new BusinessException("任務不能依賴自己");
        }
        accessGuard.requireDeliveryWriter(dto.getReqId(), "維護任務依賴");
        RdmWorkTask pred = requireTask(dto.getPredTaskId(), dto.getReqId());
        RdmWorkTask succ = requireTask(dto.getSuccTaskId(), dto.getReqId());

        /*
         * 两端都必须属于这条需求：跨需求依赖会把两个需求的排程互相拽动，
         * 而需求之间的关系本来就该由 parentReqId / 变更单显式表达。
         */
        if (!dto.getReqId().equals(pred.getReqId()) || !dto.getReqId().equals(succ.getReqId())) {
            throw new BusinessException("依賴的兩個任務必須同屬一條需求");
        }
        Long exists = dependencyMapper.selectCount(new LambdaQueryWrapper<RdmTaskDependency>()
                .eq(RdmTaskDependency::getPredTaskId, pred.getId())
                .eq(RdmTaskDependency::getSuccTaskId, succ.getId()));
        if (exists != null && exists > 0) {
            throw new BusinessException("該依賴已存在");
        }

        RdmTaskDependency edge = new RdmTaskDependency();
        edge.setReqId(dto.getReqId());
        edge.setPredTaskId(pred.getId());
        edge.setSuccTaskId(succ.getId());
        edge.setDepType(RdmTaskDependency.TYPE_FS);
        edge.setLagDays(clampLag(dto.getLagDays()));
        String signature = operatorResolver.operatorSignature(operatorResolver.currentUser());
        edge.setCreatedBy(signature);
        edge.setUpdatedBy(signature);
        dependencyMapper.insert(edge);

        // 插入后再验一次环：并发下两条边可能各自检测通过却共同成环， uk 拦不住这种情况
        List<RdmTaskDependency> edges = dependencyMapper.selectList(new LambdaQueryWrapper<RdmTaskDependency>()
                .eq(RdmTaskDependency::getReqId, dto.getReqId()));
        if (hasCycle(nodeIdsOf(edges), edges)) {
            dependencyMapper.deleteById(edge.getId());
            throw new BusinessException("新增後會形成循環依賴（A→B→…→A），排程無法收斂，已拒絕");
        }
        return toDependencyVO(edge);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void removeDependency(Long id) {
        RdmTaskDependency edge = dependencyMapper.selectById(id);
        if (edge == null) {
            return;
        }
        accessGuard.requireDeliveryWriter(edge.getReqId(), "刪除任務依賴");
        dependencyMapper.deleteById(id);
    }

    /* ==================== 关键路径与甘特 ==================== */

    @Override
    public RdmScheduleVO.Plan plan(Long reqId) {
        RdmRequirement req = accessGuard.requireVisible(reqId, "查看排程甘特");
        List<RdmWorkTask> tasks = taskMapper.selectList(new LambdaQueryWrapper<RdmWorkTask>()
                .eq(RdmWorkTask::getReqId, reqId)
                .ne(RdmWorkTask::getStatus, "cancelled")
                .orderByAsc(RdmWorkTask::getId));
        List<RdmTaskDependency> edges = dependencyMapper.selectList(new LambdaQueryWrapper<RdmTaskDependency>()
                .eq(RdmTaskDependency::getReqId, reqId));

        RdmScheduleVO.Plan plan = new RdmScheduleVO.Plan();
        plan.setReqId(reqId);
        plan.setReqNo(req.getReqNo());
        plan.setTitle(req.getTitle());
        plan.setStatus(req.getStatus());
        plan.setMilestones(milestones(reqId));
        for (RdmTaskDependency edge : edges) {
            RdmScheduleVO.Link link = new RdmScheduleVO.Link();
            link.setId(edge.getId());
            link.setPredTaskId(edge.getPredTaskId());
            link.setSuccTaskId(edge.getSuccTaskId());
            link.setDepType(edge.getDepType());
            link.setLagDays(edge.getLagDays());
            plan.getLinks().add(link);
        }
        if (tasks.isEmpty()) {
            plan.setCyclic(false);
            plan.setWorkingDays(0);
            return plan;
        }

        Map<Long, RdmWorkTask> taskById = new LinkedHashMap<>();
        tasks.forEach(t -> taskById.put(t.getId(), t));
        boolean cyclic = hasCycle(taskById.keySet(), edges);
        plan.setCyclic(cyclic);

        // 日历按任务负责人加载；无负责人时退化为默认工作日（周末不上班）
        Set<Long> owners = new LinkedHashSet<>();
        tasks.forEach(t -> {
            if (t.getOwnerUserId() != null) {
                owners.add(t.getOwnerUserId());
            }
        });
        LocalDate earliestPlan = tasks.stream().map(RdmWorkTask::getPlanStartDate)
                .filter(java.util.Objects::nonNull).min(LocalDate::compareTo).orElse(null);
        LocalDate anchor = earliestPlan == null || earliestPlan.isBefore(LocalDate.now())
                ? LocalDate.now() : earliestPlan;
        Map<Long, DayCalendar> calendars = loadCalendars(owners, anchor.minusDays(7), anchor.plusDays(180));

        Map<Long, LocalDate[]> schedule = new LinkedHashMap<>();
        Map<Long, Integer> durations = new LinkedHashMap<>();
        tasks.forEach(t -> durations.put(t.getId(), durationOf(t)));
        List<Long> topo = cyclic ? List.of() : topoOrder(taskById.keySet(), edges);
        if (!cyclic) {
            scheduleTasks(taskById, edges, durations, calendars, anchor, topo, schedule);
        }

        LocalDate windowStart = null;
        LocalDate windowEnd = null;
        for (RdmWorkTask task : tasks) {
            plan.getBars().add(toBar(task, edges, durations.get(task.getId()), schedule.get(task.getId()), cyclic, calendars));
            LocalDate[] span = schedule.get(task.getId());
            LocalDate start = span != null ? span[0] : task.getPlanStartDate();
            LocalDate end = span != null ? span[1] : task.getPlanFinishDate();
            windowStart = min(windowStart, start == null ? anchor : start);
            windowEnd = max(windowEnd, end == null ? anchor : end);
        }
        for (RdmScheduleVO.Milestone ms : plan.getMilestones()) {
            windowEnd = max(windowEnd, parseOrNull(ms.getForecastDate()));
            windowEnd = max(windowEnd, parseOrNull(ms.getActualDate()));
        }
        plan.setWindowStart(DateTimeUtils.format(windowStart));
        plan.setWindowEnd(DateTimeUtils.format(windowEnd));
        DayCalendar any = new DayCalendar(Map.of());
        plan.setWorkingDays(windowStart == null || windowEnd == null ? 0 : countWorking(windowStart, windowEnd, any));

        // 关键路径 = 松弛为 0 的任务，按最早开始排序；成环时不给结论
        if (!cyclic) {
            List<Long> critical = plan.getBars().stream()
                    .filter(b -> Boolean.TRUE.equals(b.getCritical()))
                    .sorted(java.util.Comparator.comparing(RdmScheduleVO.Bar::getEarliestStart,
                            java.util.Comparator.nullsLast(String::compareTo)))
                    .map(RdmScheduleVO.Bar::getTaskId)
                    .toList();
            plan.setCriticalPath(critical);
            plan.setForecastFinish(plan.getBars().stream()
                    .map(RdmScheduleVO.Bar::getEarliestFinish)
                    .filter(StringUtils::hasText)
                    .max(String::compareTo).orElse(null));
        }
        return plan;
    }

    /* ==================== 资源负载 ==================== */

    @Override
    public RdmScheduleVO.Workload workload(String from, String to, Long userId) {
        SysUser current = operatorResolver.currentUser();
        boolean unrestricted = accessGuard.canSeeAll(current);
        LocalDate start = parseOrNull(from);
        LocalDate end = parseOrNull(to);
        if (end == null || start == null) {
            end = LocalDate.now().plusDays(DEFAULT_WORKLOAD_DAYS - 1);
            start = end.minusDays(DEFAULT_WORKLOAD_DAYS - 1);
        }
        if (start.isAfter(end)) {
            throw new BusinessException("開始日期不能晚於結束日期");
        }
        if (start.plusDays(MAX_WORKLOAD_DAYS).isBefore(end)) {
            throw new BusinessException("負載查詢最多覆蓋 " + MAX_WORKLOAD_DAYS + " 天");
        }

        RdmScheduleVO.Workload vo = new RdmScheduleVO.Workload();
        vo.setFrom(start.toString());
        vo.setTo(end.toString());

        Long target = userId;
        if (!unrestricted) {
            // 无全量数据范围的人只能看自己：负载数据不能变成互相打探绩效的工具
            target = current == null ? null : current.getId();
            vo.setSelfOnly(true);
            if (target == null) {
                throw new BusinessException("登錄狀態失效，請重新登錄");
            }
        } else {
            vo.setSelfOnly(false);
        }

        LambdaQueryWrapper<RdmWorkTask> wrapper = new LambdaQueryWrapper<RdmWorkTask>()
                .ne(RdmWorkTask::getStatus, "cancelled")
                .isNotNull(RdmWorkTask::getOwnerUserId)
                .le(RdmWorkTask::getPlanStartDate, end)
                .ge(RdmWorkTask::getPlanFinishDate, start);
        if (target != null) {
            wrapper.eq(RdmWorkTask::getOwnerUserId, target);
        }
        List<RdmWorkTask> tasks = taskMapper.selectList(wrapper);
        if (tasks.isEmpty()) {
            return vo;
        }

        Set<Long> owners = new LinkedHashSet<>();
        tasks.forEach(t -> owners.add(t.getOwnerUserId()));
        Map<Long, DayCalendar> calendars = loadCalendars(owners, start, end);
        Map<String, BigDecimal> actualByDay = actualHoursByDay(owners, start, end);
        Map<Long, SysUser> users = loadUsers(owners);

        for (Long ownerId : owners) {
            SysUser user = users.get(ownerId);
            DayCalendar calendar = calendars.getOrDefault(ownerId, new DayCalendar(Map.of()));
            Map<LocalDate, BigDecimal> planned = new LinkedHashMap<>();
            Set<Long> reqIds = new HashSet<>();
            for (RdmWorkTask task : tasks) {
                if (!ownerId.equals(task.getOwnerUserId())) {
                    continue;
                }
                reqIds.add(task.getReqId());
                spread(task, start, end, calendar, planned);
            }
            vo.getPeople().add(toPerson(ownerId, user, calendar, start, end, planned, actualByDay, reqIds.size()));
        }
        vo.getPeople().sort((a, b) -> Integer.compare(nz(b.getUtilization()), nz(a.getUtilization())));
        return vo;
    }

    /** 把任务计划工时摊到区间内的工作日上（均摊，尾差落在最后一个工作日） */
    private static void spread(RdmWorkTask task, LocalDate start, LocalDate end,
                               DayCalendar calendar, Map<LocalDate, BigDecimal> planned) {
        BigDecimal hours = task.getPlanHours() == null ? BigDecimal.ZERO : task.getPlanHours();
        if (hours.signum() <= 0) {
            return;
        }
        List<LocalDate> days = new ArrayList<>();
        LocalDate taskStart = max(task.getPlanStartDate(), start);
        LocalDate taskEnd = min(task.getPlanFinishDate(), end);
        if (taskStart == null || taskEnd == null || taskStart.isAfter(taskEnd)) {
            // 没填计划起止时按今天起摊，至少让"还有多少活没排进去"可见
            taskStart = max(LocalDate.now(), start);
            taskEnd = taskStart.plusDays(6);
        }
        for (LocalDate d = taskStart; !d.isAfter(taskEnd); d = d.plusDays(1)) {
            if (calendar.isWorking(d)) {
                days.add(d);
            }
        }
        if (days.isEmpty()) {
            return;
        }
        BigDecimal per = hours.divide(BigDecimal.valueOf(days.size()), 2, RoundingMode.DOWN);
        BigDecimal assigned = BigDecimal.ZERO;
        for (int i = 0; i < days.size(); i++) {
            BigDecimal share = i == days.size() - 1 ? hours.subtract(assigned) : per;
            assigned = assigned.add(share);
            planned.merge(days.get(i), share, BigDecimal::add);
        }
    }

    private RdmScheduleVO.Person toPerson(Long userId, SysUser user, DayCalendar calendar, LocalDate start,
                                          LocalDate end, Map<LocalDate, BigDecimal> planned,
                                          Map<String, BigDecimal> actualByDay, int reqCount) {
        RdmScheduleVO.Person person = new RdmScheduleVO.Person();
        person.setUserId(userId);
        person.setUserName(user == null ? ("#" + userId) : user.getName());
        person.setEmpNo(user == null ? null : user.getEmpId());
        person.setReqCount(reqCount);
        BigDecimal capacityTotal = BigDecimal.ZERO;
        BigDecimal plannedTotal = BigDecimal.ZERO;
        BigDecimal actualTotal = BigDecimal.ZERO;
        int overloaded = 0;
        for (LocalDate d = start; !d.isAfter(end); d = d.plusDays(1)) {
            BigDecimal capacity = calendar.capacity(d);
            BigDecimal load = planned.getOrDefault(d, BigDecimal.ZERO);
            BigDecimal actual = actualByDay.getOrDefault(userId + "|" + d, BigDecimal.ZERO);
            RdmScheduleVO.DayLoad day = new RdmScheduleVO.DayLoad();
            day.setDay(d.toString());
            day.setCapacity(capacity);
            day.setPlanned(load);
            day.setActual(actual);
            day.setWeekend(calendar.isWeekend(d));
            day.setLeave(calendar.isLeave(d));
            day.setOverloaded(capacity.signum() > 0 && load.compareTo(capacity) > 0);
            if (Boolean.TRUE.equals(day.getOverloaded())) {
                overloaded++;
            }
            capacityTotal = capacityTotal.add(capacity);
            plannedTotal = plannedTotal.add(load);
            actualTotal = actualTotal.add(actual);
            person.getDays().add(day);
        }
        person.setTotalCapacity(capacityTotal.setScale(1, RoundingMode.HALF_UP));
        person.setTotalPlanned(plannedTotal.setScale(1, RoundingMode.HALF_UP));
        person.setTotalActual(actualTotal.setScale(1, RoundingMode.HALF_UP));
        person.setOverloadedDays(overloaded);
        person.setUtilization(capacityTotal.signum() == 0 ? 0
                : plannedTotal.multiply(BigDecimal.valueOf(100)).divide(capacityTotal, 0, RoundingMode.HALF_UP).intValue());
        return person;
    }

    /** 已填报的实际工时（按人按日汇总） */
    private Map<String, BigDecimal> actualHoursByDay(Set<Long> userIds, LocalDate start, LocalDate end) {
        Map<String, BigDecimal> map = new HashMap<>();
        if (userIds.isEmpty()) {
            return map;
        }
        String placeholders = String.join(",", java.util.Collections.nCopies(userIds.size(), "?"));
        List<Object> args = new ArrayList<>(userIds);
        args.add(start);
        args.add(end);
        jdbcTemplate.query(
                "SELECT user_id, work_date, SUM(hours) AS total FROM rdm_work_log "
                        + "WHERE deleted = 0 AND user_id IN (" + placeholders + ") AND work_date BETWEEN ? AND ? "
                        + "GROUP BY user_id, work_date",
                rs -> {
                    map.put(rs.getLong("user_id") + "|" + rs.getDate("work_date").toLocalDate(),
                            rs.getBigDecimal("total"));
                },
                args.toArray());
        return map;
    }

    private Map<Long, SysUser> loadUsers(Set<Long> ids) {
        if (ids.isEmpty()) {
            return Map.of();
        }
        Map<Long, SysUser> map = new LinkedHashMap<>();
        userMapper.selectBatchIds(ids).forEach(u -> map.put(u.getId(), u));
        return map;
    }

    /* ==================== 工作日历 ==================== */

    @Override
    public List<RdmScheduleVO.CalendarItem> calendar(Long userId) {
        SysUser current = operatorResolver.currentUser();
        Long target = accessGuard.canSeeAll(current) && userId != null
                ? userId : (current == null ? null : current.getId());
        if (target == null) {
            throw new BusinessException("登錄狀態失效，請重新登錄");
        }
        return calendarMapper.selectList(new LambdaQueryWrapper<RdmWorkCalendar>()
                        .eq(RdmWorkCalendar::getUserId, target).orderByAsc(RdmWorkCalendar::getDay))
                .stream().map(row -> {
                    RdmScheduleVO.CalendarItem item = new RdmScheduleVO.CalendarItem();
                    item.setId(row.getId());
                    item.setUserId(row.getUserId());
                    item.setUserName(rowUserName(row.getUserId()));
                    item.setDay(DateTimeUtils.format(row.getDay()));
                    item.setDayType(row.getDayType());
                    item.setAvailableHours(row.getAvailableHours());
                    item.setReason(row.getReason());
                    return item;
                }).toList();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public List<RdmScheduleVO.CalendarItem> saveCalendar(RdmScheduleDTO.Calendar dto) {
        SysUser current = operatorResolver.currentUser();
        if (current == null) {
            throw new BusinessException("登錄狀態失效，請重新登錄");
        }
        Long target = dto == null || dto.getUserId() == null ? current.getId() : dto.getUserId();
        // 别人的日历只有管理岗能改：请假是排程输入，被代改一次当天的可用工时就被清了
        if (!target.equals(current.getId()) && !accessGuard.canSeeAll(current)) {
            throw new BusinessException("僅可維護本人的工作日历");
        }
        SysUser owner = userMapper.selectById(target);
        if (owner == null) {
            throw new BusinessException("人員不存在或已停用");
        }
        String signature = operatorResolver.operatorSignature(current);
        if (dto.getRemoveDays() != null) {
            for (String raw : dto.getRemoveDays()) {
                LocalDate day = parseOrNull(raw);
                if (day == null) {
                    continue;
                }
                calendarMapper.delete(new LambdaQueryWrapper<RdmWorkCalendar>()
                        .eq(RdmWorkCalendar::getUserId, target).eq(RdmWorkCalendar::getDay, day));
            }
        }
        if (dto.getDays() != null) {
            for (RdmScheduleDTO.CalendarDay item : dto.getDays()) {
                if (item == null) {
                    continue;
                }
                LocalDate day = parseOrNull(item.getDay());
                if (day == null) {
                    throw new BusinessException("日曆日期格式不正確，應為 yyyy-MM-dd");
                }
                if (day.isAfter(LocalDate.now().plusYears(1))) {
                    throw new BusinessException("日曆只需登記未來一年內的例外");
                }
                String type = StringUtils.hasText(item.getDayType()) ? item.getDayType().trim() : RdmWorkCalendar.TYPE_LEAVE;
                if (!List.of(RdmWorkCalendar.TYPE_LEAVE, RdmWorkCalendar.TYPE_OVERTIME, RdmWorkCalendar.TYPE_CUSTOM).contains(type)) {
                    throw new BusinessException("不支援的日曆類型: " + type);
                }
                BigDecimal hours = item.getAvailableHours();
                if (RdmWorkCalendar.TYPE_LEAVE.equals(type)) {
                    hours = BigDecimal.ZERO;
                } else if (hours == null) {
                    hours = HOURS_PER_DAY;
                }
                if (hours.signum() < 0 || hours.compareTo(new BigDecimal("16")) > 0) {
                    throw new BusinessException("當日可用工時必須在 0-16 之間");
                }
                if (RdmWorkCalendar.TYPE_LEAVE.equals(type) && !StringUtils.hasText(item.getReason())) {
                    throw new BusinessException("登記休假必須寫明原因，排程要能解釋為什麼這天沒排活");
                }
                RdmWorkCalendar existing = calendarMapper.selectOne(new LambdaQueryWrapper<RdmWorkCalendar>()
                        .eq(RdmWorkCalendar::getUserId, target).eq(RdmWorkCalendar::getDay, day).last("LIMIT 1"));
                RdmWorkCalendar row = existing == null ? new RdmWorkCalendar() : existing;
                row.setUserId(target);
                row.setDay(day);
                row.setDayType(type);
                row.setAvailableHours(hours);
                row.setReason(StringUtils.hasText(item.getReason()) ? item.getReason().trim() : null);
                if (row.getId() == null) {
                    row.setCreatedBy(signature);
                    row.setUpdatedBy(signature);
                    calendarMapper.insert(row);
                } else {
                    row.setUpdatedBy(signature);
                    calendarMapper.updateById(row);
                }
            }
        }
        return calendar(target);
    }

    private String rowUserName(Long userId) {
        SysUser user = userId == null ? null : userMapper.selectById(userId);
        return user == null ? null : user.getName();
    }

    /* ==================== 排程算法 ==================== */

    /** 工期：8 人时/工作日向上取整，至少 1 天；没估工时但有计划起止时按起止天数 */
    private static int durationOf(RdmWorkTask task) {
        if (task.getPlanHours() != null && task.getPlanHours().signum() > 0) {
            return Math.max(1, task.getPlanHours().divide(HOURS_PER_DAY, 0, RoundingMode.CEILING).intValue());
        }
        if (task.getPlanStartDate() != null && task.getPlanFinishDate() != null) {
            return Math.max(1, (int) countWorking(task.getPlanStartDate(), task.getPlanFinishDate(), new DayCalendar(Map.of())));
        }
        return 1;
    }

    /** Kahn 拓扑排序；返回的列表长度不足说明有环 */
    private static List<Long> topoOrder(Set<Long> nodes, List<RdmTaskDependency> edges) {
        Map<Long, Integer> indegree = new LinkedHashMap<>();
        Map<Long, List<Long>> adjacency = new LinkedHashMap<>();
        nodes.forEach(id -> {
            indegree.put(id, 0);
            adjacency.put(id, new ArrayList<>());
        });
        for (RdmTaskDependency edge : edges) {
            if (!indegree.containsKey(edge.getPredTaskId()) || !indegree.containsKey(edge.getSuccTaskId())) {
                continue;
            }
            adjacency.get(edge.getPredTaskId()).add(edge.getSuccTaskId());
            indegree.merge(edge.getSuccTaskId(), 1, Integer::sum);
        }
        Deque<Long> queue = new ArrayDeque<>();
        indegree.forEach((id, deg) -> {
            if (deg == 0) {
                queue.add(id);
            }
        });
        List<Long> order = new ArrayList<>();
        while (!queue.isEmpty()) {
            Long id = queue.poll();
            order.add(id);
            for (Long next : adjacency.getOrDefault(id, List.of())) {
                if (indegree.merge(next, -1, Integer::sum) == 0) {
                    queue.add(next);
                }
            }
        }
        return order.size() == nodes.size() ? order : List.of();
    }

    /** DFS 三色环检测（写入时拒绝成环，读取时兜住历史脏数据） */
    private static boolean hasCycle(Set<Long> nodes, List<RdmTaskDependency> edges) {
        Map<Long, List<Long>> adjacency = new LinkedHashMap<>();
        nodes.forEach(id -> adjacency.put(id, new ArrayList<>()));
        for (RdmTaskDependency edge : edges) {
            if (adjacency.containsKey(edge.getPredTaskId()) && adjacency.containsKey(edge.getSuccTaskId())) {
                adjacency.get(edge.getPredTaskId()).add(edge.getSuccTaskId());
            }
        }
        Map<Long, Integer> color = new HashMap<>();
        for (Long node : nodes) {
            if (color.getOrDefault(node, 0) == 0 && dfsCycle(node, adjacency, color)) {
                return true;
            }
        }
        return false;
    }

    private static boolean dfsCycle(Long node, Map<Long, List<Long>> adjacency, Map<Long, Integer> color) {
        color.put(node, 1);
        for (Long next : adjacency.getOrDefault(node, List.of())) {
            int state = color.getOrDefault(next, 0);
            if (state == 1 || (state == 0 && dfsCycle(next, adjacency, color))) {
                return true;
            }
        }
        color.put(node, 2);
        return false;
    }

    /** 正向推最早起止、反向推最晚起止，松弛为 0 即在关键路径上 */
    private static void scheduleTasks(Map<Long, RdmWorkTask> taskById, List<RdmTaskDependency> edges,
                                      Map<Long, Integer> durations, Map<Long, DayCalendar> calendars,
                                      LocalDate anchor, List<Long> topo, Map<Long, LocalDate[]> schedule) {
        Map<Long, List<RdmTaskDependency>> incoming = new LinkedHashMap<>();
        Map<Long, List<RdmTaskDependency>> outgoing = new LinkedHashMap<>();
        taskById.keySet().forEach(id -> {
            incoming.put(id, new ArrayList<>());
            outgoing.put(id, new ArrayList<>());
        });
        for (RdmTaskDependency edge : edges) {
            if (!incoming.containsKey(edge.getSuccTaskId()) || !outgoing.containsKey(edge.getPredTaskId())) {
                continue;
            }
            incoming.get(edge.getSuccTaskId()).add(edge);
            outgoing.get(edge.getPredTaskId()).add(edge);
        }

        Map<Long, LocalDate> earliestStart = new LinkedHashMap<>();
        Map<Long, LocalDate> earliestFinish = new LinkedHashMap<>();
        for (Long id : topo) {
            DayCalendar calendar = calendarOf(taskById.get(id), calendars);
            LocalDate start = anchor;
            for (RdmTaskDependency edge : incoming.get(id)) {
                LocalDate predFinish = earliestFinish.get(edge.getPredTaskId());
                if (predFinish == null) {
                    continue;
                }
                /*
                 * FS 语义下后继最早只能在「前驱完成日的下一个工作日」开始，
                 * EF 是含首尾的最后工作日，所以额外 +1；否则两张任务会算成同一天交付。
                 */
                LocalDate ready = shift(predFinish, 1 + (edge.getLagDays() == null ? 0 : edge.getLagDays()), calendar);
                start = max(start, ready);
            }
            start = nextWorking(start, calendar);
            LocalDate finish = nthWorking(start, durations.getOrDefault(id, 1), calendar);
            earliestStart.put(id, start);
            earliestFinish.put(id, finish);
        }

        LocalDate projectEnd = earliestFinish.values().stream().max(LocalDate::compareTo).orElse(anchor);
        Map<Long, LocalDate> latestStart = new LinkedHashMap<>();
        Map<Long, LocalDate> latestFinish = new LinkedHashMap<>();
        List<Long> reverse = new ArrayList<>(topo);
        java.util.Collections.reverse(reverse);
        for (Long id : reverse) {
            DayCalendar calendar = calendarOf(taskById.get(id), calendars);
            LocalDate finish = projectEnd;
            for (RdmTaskDependency edge : outgoing.get(id)) {
                LocalDate succLatest = latestStart.get(edge.getSuccTaskId());
                if (succLatest == null) {
                    continue;
                }
                LocalDate allowed = shift(succLatest, -(edge.getLagDays() == null ? 0 : edge.getLagDays()) - 1, calendar);
                finish = min(finish, allowed);
            }
            finish = prevWorking(finish, calendar);
            LocalDate start = nthWorkingBack(finish, durations.getOrDefault(id, 1), calendar);
            latestFinish.put(id, finish);
            latestStart.put(id, start);
        }

        for (Long id : topo) {
            schedule.put(id, new LocalDate[]{earliestStart.get(id), earliestFinish.get(id),
                    latestStart.get(id), latestFinish.get(id)});
        }
    }

    private static DayCalendar calendarOf(RdmWorkTask task, Map<Long, DayCalendar> calendars) {
        DayCalendar calendar = task.getOwnerUserId() == null ? null : calendars.get(task.getOwnerUserId());
        return calendar == null ? new DayCalendar(Map.of()) : calendar;
    }

    private RdmScheduleVO.Bar toBar(RdmWorkTask task, List<RdmTaskDependency> edges, Integer duration,
                                    LocalDate[] span, boolean cyclic, Map<Long, DayCalendar> calendars) {
        RdmScheduleVO.Bar bar = new RdmScheduleVO.Bar();
        bar.setTaskId(task.getId());
        bar.setTaskNo(task.getTaskNo());
        bar.setTitle(task.getTitle());
        bar.setTaskType(task.getTaskType());
        bar.setStatus(task.getStatus());
        bar.setProgress(task.getProgress());
        bar.setOwnerUserId(task.getOwnerUserId());
        bar.setOwnerName(task.getOwnerName());
        bar.setOwnerMissing(task.getOwnerUserId() == null);
        bar.setPlanHours(task.getPlanHours());
        bar.setActualHours(task.getActualHours());
        bar.setPlanStartDate(DateTimeUtils.format(task.getPlanStartDate()));
        bar.setPlanFinishDate(DateTimeUtils.format(task.getPlanFinishDate()));
        bar.setActualStartTime(DateTimeUtils.format(task.getActualStartTime()));
        bar.setActualFinishTime(DateTimeUtils.format(task.getActualFinishTime()));
        bar.setDurationDays(duration);
        edges.stream().filter(e -> e.getSuccTaskId().equals(task.getId()))
                .forEach(e -> bar.getPredecessors().add(e.getPredTaskId()));
        boolean done = "done".equals(task.getStatus());
        bar.setOverdue(!done && task.getPlanFinishDate() != null && task.getPlanFinishDate().isBefore(LocalDate.now()));
        if (!cyclic && span != null) {
            bar.setEarliestStart(DateTimeUtils.format(span[0]));
            bar.setEarliestFinish(DateTimeUtils.format(span[1]));
            bar.setLatestStart(DateTimeUtils.format(span[2]));
            bar.setLatestFinish(DateTimeUtils.format(span[3]));
            int slack = span[0] != null && span[2] != null
                    ? Math.max(0, countWorking(span[0], span[2], calendarOf(task, calendars)) - 1) : 0;
            bar.setSlackDays(slack);
            bar.setCritical(slack == 0);
        } else {
            bar.setCritical(false);
        }
        return bar;
    }

    private List<RdmScheduleVO.Milestone> milestones(Long reqId) {
        return milestoneMapper.selectList(new LambdaQueryWrapper<RdmMilestone>()
                        .eq(RdmMilestone::getReqId, reqId).orderByAsc(RdmMilestone::getSortOrder))
                .stream().map(row -> {
                    RdmScheduleVO.Milestone ms = new RdmScheduleVO.Milestone();
                    ms.setCode(row.getCode());
                    ms.setName(row.getName());
                    ms.setOwnerName(row.getOwnerName());
                    ms.setPreliminaryDate(DateTimeUtils.format(row.getPreliminaryDate()));
                    ms.setBaselineDate(DateTimeUtils.format(row.getBaselineDate()));
                    ms.setForecastDate(DateTimeUtils.format(row.getForecastDate()));
                    ms.setActualDate(DateTimeUtils.format(row.getActualDate()));
                    ms.setStatus(row.getStatus());
                    LocalDate base = row.getBaselineDate();
                    LocalDate real = row.getActualDate();
                    ms.setSlipDays(base != null && real != null ? (int) java.time.temporal.ChronoUnit.DAYS.between(base, real) : null);
                    return ms;
                }).toList();
    }

    private RdmScheduleVO.Dependency toDependencyVO(RdmTaskDependency edge) {
        RdmScheduleVO.Dependency vo = new RdmScheduleVO.Dependency();
        vo.setId(edge.getId());
        vo.setReqId(edge.getReqId());
        vo.setPredTaskId(edge.getPredTaskId());
        vo.setSuccTaskId(edge.getSuccTaskId());
        vo.setDepType(edge.getDepType());
        vo.setLagDays(edge.getLagDays());
        vo.setCreatedBy(edge.getCreatedBy());
        vo.setPredTaskTitle(taskTitle(edge.getPredTaskId()));
        vo.setSuccTaskTitle(taskTitle(edge.getSuccTaskId()));
        return vo;
    }

    private String taskTitle(Long taskId) {
        RdmWorkTask task = taskId == null ? null : taskMapper.selectById(taskId);
        return task == null ? null : task.getTitle();
    }

    private RdmWorkTask requireTask(Long taskId, Long reqId) {
        RdmWorkTask task = taskMapper.selectById(taskId);
        if (task == null) {
            throw new BusinessException("任務不存在（ID " + taskId + "）");
        }
        if (!reqId.equals(task.getReqId())) {
            throw new BusinessException("任務不屬於該需求（ID " + taskId + "）");
        }
        return task;
    }

    /** lag 范围收敛：±60 工作日之外已经不是排程延迟，是填错了 */
    private static Integer clampLag(Integer lag) {
        if (lag == null) {
            return 0;
        }
        if (Math.abs(lag) > 60) {
            throw new BusinessException("延遲天數範圍為 -60 至 60 個工作日");
        }
        return lag;
    }

    /* ==================== 工作日计算 ==================== */

    /**
     * 某个人的工作日历：默认周一至周五 8 小时，表里存在的日子按登记值覆盖。
     * <p>leave 使当天完全不可用；overtime/custom 只要 availableHours &gt; 0 就算可用。
     */
    private static final class DayCalendar {
        private final Map<LocalDate, RdmWorkCalendar> overrides;

        private DayCalendar(Map<LocalDate, RdmWorkCalendar> overrides) {
            this.overrides = overrides;
        }

        private boolean isWeekend(LocalDate day) {
            DayOfWeek dow = day.getDayOfWeek();
            return dow == DayOfWeek.SATURDAY || dow == DayOfWeek.SUNDAY;
        }

        private boolean isLeave(LocalDate day) {
            RdmWorkCalendar row = overrides.get(day);
            return row != null && RdmWorkCalendar.TYPE_LEAVE.equals(row.getDayType());
        }

        private boolean isWorking(LocalDate day) {
            return capacity(day).signum() > 0;
        }

        private BigDecimal capacity(LocalDate day) {
            RdmWorkCalendar row = overrides.get(day);
            if (row != null) {
                return row.getAvailableHours() == null
                        ? (RdmWorkCalendar.TYPE_LEAVE.equals(row.getDayType()) ? BigDecimal.ZERO : HOURS_PER_DAY)
                        : row.getAvailableHours();
            }
            return isWeekend(day) ? BigDecimal.ZERO : HOURS_PER_DAY;
        }
    }

    private Map<Long, DayCalendar> loadCalendars(Set<Long> userIds, LocalDate from, LocalDate to) {
        Map<Long, DayCalendar> map = new LinkedHashMap<>();
        if (userIds.isEmpty()) {
            return map;
        }
        Map<Long, Map<LocalDate, RdmWorkCalendar>> buckets = new LinkedHashMap<>();
        userIds.forEach(id -> buckets.put(id, new LinkedHashMap<>()));
        calendarMapper.selectList(new LambdaQueryWrapper<RdmWorkCalendar>()
                        .in(RdmWorkCalendar::getUserId, userIds)
                        .between(RdmWorkCalendar::getDay, from, to))
                .forEach(row -> {
                    Map<LocalDate, RdmWorkCalendar> bucket = buckets.get(row.getUserId());
                    if (bucket != null && row.getDay() != null) {
                        bucket.put(row.getDay(), row);
                    }
                });
        buckets.forEach((id, days) -> map.put(id, new DayCalendar(days)));
        return map;
    }

    private static LocalDate nextWorking(LocalDate day, DayCalendar calendar) {
        LocalDate cursor = day;
        for (int guard = 0; guard < 400 && !calendar.isWorking(cursor); guard++) {
            cursor = cursor.plusDays(1);
        }
        return cursor;
    }

    private static LocalDate prevWorking(LocalDate day, DayCalendar calendar) {
        LocalDate cursor = day;
        for (int guard = 0; guard < 400 && !calendar.isWorking(cursor); guard++) {
            cursor = cursor.minusDays(1);
        }
        return cursor;
    }

    /** 从 start（含）数第 n 个工作日 */
    private static LocalDate nthWorking(LocalDate start, int n, DayCalendar calendar) {
        LocalDate cursor = nextWorking(start, calendar);
        int counted = 1;
        while (counted < Math.max(1, n)) {
            cursor = nextWorking(cursor.plusDays(1), calendar);
            counted++;
        }
        return cursor;
    }

    /** 从 end（含）往前数第 n 个工作日 */
    private static LocalDate nthWorkingBack(LocalDate end, int n, DayCalendar calendar) {
        LocalDate cursor = prevWorking(end, calendar);
        int counted = 1;
        while (counted < Math.max(1, n)) {
            cursor = prevWorking(cursor.minusDays(1), calendar);
            counted++;
        }
        return cursor;
    }

    /** 按工作日移动（n 可为负），结果归到工作日 */
    private static LocalDate shift(LocalDate day, int n, DayCalendar calendar) {
        LocalDate cursor = day;
        if (n > 0) {
            for (int i = 0; i < n; i++) {
                cursor = nextWorking(cursor.plusDays(1), calendar);
            }
        } else if (n < 0) {
            for (int i = 0; i < -n; i++) {
                cursor = prevWorking(cursor.minusDays(1), calendar);
            }
        }
        return nextWorking(cursor, calendar);
    }

    /** 含首尾的工作日数 */
    private static int countWorking(LocalDate from, LocalDate to, DayCalendar calendar) {
        if (from == null || to == null || from.isAfter(to)) {
            return 0;
        }
        int count = 0;
        for (LocalDate cursor = from; !cursor.isAfter(to); cursor = cursor.plusDays(1)) {
            if (calendar.isWorking(cursor)) {
                count++;
            }
        }
        return count;
    }

    private static LocalDate parseOrNull(String value) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        try {
            return LocalDate.parse(value.trim().substring(0, 10));
        } catch (Exception e) {
            return null;
        }
    }

    private static LocalDate max(LocalDate a, LocalDate b) {
        if (a == null) {
            return b;
        }
        if (b == null) {
            return a;
        }
        return a.isAfter(b) ? a : b;
    }

    private static LocalDate min(LocalDate a, LocalDate b) {
        if (a == null) {
            return b;
        }
        if (b == null) {
            return a;
        }
        return a.isBefore(b) ? a : b;
    }

    private static int nz(Integer value) {
        return value == null ? 0 : value;
    }

    /** 依赖参与拓扑与环检测的节点集合 */
    private static Set<Long> nodeIdsOf(List<RdmTaskDependency> edges) {
        Set<Long> ids = new LinkedHashSet<>();
        RdmWorkTaskMapper ignored = null;
        edges.forEach(e -> {
            ids.add(e.getPredTaskId());
            ids.add(e.getSuccTaskId());
        });
        return ids;
    }
}
