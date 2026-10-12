package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.AttendanceScheduleSaveRequest;
import com.mftb.admin.dto.AttendanceScheduleVO;
import com.mftb.admin.entity.AttGroup;
import com.mftb.admin.entity.AttGroupMember;
import com.mftb.admin.entity.AttSchedule;
import com.mftb.admin.entity.AttShift;
import com.mftb.admin.mapper.AttGroupMapper;
import com.mftb.admin.mapper.AttGroupMemberMapper;
import com.mftb.admin.mapper.AttScheduleMapper;
import com.mftb.admin.mapper.AttShiftMapper;
import com.mftb.admin.service.AttendanceScheduleService;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 排班服务实现。
 * <p>
 * 三条口径：
 * ① 周视图的成员归属按「该周区间」过滤，不是按今天在册的人——补排上周时若用今天的名单，
 *    已调走的人会被静默漏掉；
 * ② 排班唯一键是 {@code (user_id, work_date)} 全局一条，不是「组内一条」：
 *    一人同时只能属于一个考勤组，跨组两条排班会让日报双计；
 * ③ 保存按条目 upsert，未提及的格子不动，避免并发编辑互相覆盖。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AttendanceScheduleServiceImpl implements AttendanceScheduleService {

    private static final String STATUS_ENABLED = "enabled";
    private static final int SOURCE_MANUAL = 1;
    private static final int SOURCE_COPY = 2;

    private final AttGroupMapper groupMapper;
    private final AttGroupMemberMapper memberMapper;
    private final AttScheduleMapper scheduleMapper;
    private final AttShiftMapper shiftMapper;
    private final OperatorResolver operatorResolver;

    @Override
    public AttendanceScheduleVO week(Long groupId, LocalDate weekStart) {
        AttGroup group = requireGroup(groupId);
        LocalDate start = weekStart == null ? LocalDate.now().minusDays(LocalDate.now().getDayOfWeek().getValue() - 1) : weekStart;
        LocalDate end = start.plusDays(6);
        List<String> days = dates(start, end);

        List<AttGroupMember> members = membersInRange(groupId, start, end);
        Map<String, AttSchedule> byUserDate = loadSchedules(members, start, end);
        Map<Long, AttShift> shifts = loadShifts(byUserDate.values());

        AttendanceScheduleVO vo = new AttendanceScheduleVO();
        vo.setGroupId(group.getId());
        vo.setGroupName(group.getGroupName());
        vo.setWeekStart(start.toString());
        vo.setWeekEnd(end.toString());
        List<AttendanceScheduleVO.Row> rows = new ArrayList<>();
        long unscheduled = 0;
        for (AttGroupMember member : members) {
            AttendanceScheduleVO.Row row = new AttendanceScheduleVO.Row();
            row.setUserId(member.getUserId());
            row.setEmpNo(member.getEmpNo());
            row.setEmpName(member.getEmpName());
            row.setDeptName(member.getDeptName());
            Map<String, AttendanceScheduleVO.Cell> cells = new LinkedHashMap<>();
            boolean anyScheduled = false;
            for (String day : days) {
                AttSchedule schedule = byUserDate.get(member.getUserId() + "|" + day);
                cells.put(day, toCell(schedule, shifts));
                if (schedule != null && schedule.getShiftId() != null) {
                    anyScheduled = true;
                }
            }
            row.setCells(cells);
            if (!anyScheduled) {
                unscheduled++;
            }
            rows.add(row);
        }
        vo.setRows(rows);
        vo.setUnscheduledCount(unscheduled);
        return vo;
    }

    @Override
    @Transactional
    public Map<String, Object> save(AttendanceScheduleSaveRequest request) {
        AttGroup group = requireGroup(request == null ? null : request.getGroupId());
        List<AttendanceScheduleSaveRequest.Entry> entries = request.getEntries();
        if (entries == null || entries.isEmpty()) {
            throw new BusinessException("請至少提交一條排班");
        }
        String operator = operatorResolver.currentOperatorName();
        Map<Long, AttShift> shiftCache = new HashMap<>();
        int saved = 0;
        int rest = 0;
        for (AttendanceScheduleSaveRequest.Entry entry : entries) {
            if (entry.getUserId() == null || entry.getWorkDate() == null) {
                throw new BusinessException("排班條目缺少員工或日期");
            }
            requireMemberOnDate(group.getId(), entry.getUserId(), entry.getWorkDate());
            AttShift shift = resolveShift(entry.getShiftId(), shiftCache);
            if (shift != null && !STATUS_ENABLED.equals(shift.getStatus())) {
                throw new BusinessException("班次「" + shift.getShiftName() + "」已停用，不能排入新班表");
            }
            // 全局按 (userId, workDate) 定位：一人一天只能有一条排班结论
            AttSchedule existing = scheduleMapper.selectOne(new LambdaQueryWrapper<AttSchedule>()
                    .eq(AttSchedule::getUserId, entry.getUserId())
                    .eq(AttSchedule::getWorkDate, entry.getWorkDate())
                    .last("LIMIT 1"));
            if (existing == null) {
                AttSchedule schedule = new AttSchedule();
                schedule.setGroupId(group.getId());
                schedule.setUserId(entry.getUserId());
                schedule.setWorkDate(entry.getWorkDate());
                schedule.setShiftId(entry.getShiftId());
                schedule.setSource(SOURCE_MANUAL);
                fillSnapshot(schedule, entry.getUserId());
                schedule.setCreatedBy(operator);
                schedule.setUpdatedBy(operator);
                scheduleMapper.insert(schedule);
            } else {
                existing.setGroupId(group.getId());
                existing.setShiftId(entry.getShiftId());
                existing.setSource(SOURCE_MANUAL);
                existing.setUpdatedBy(operator);
                scheduleMapper.updateById(existing);
            }
            saved++;
            if (entry.getShiftId() == null) {
                rest++;
            }
        }
        log.info("排班已保存: group={}, 条数={}, 其中排休={}", group.getGroupName(), saved, rest);
        return summary(saved, rest);
    }

    @Override
    @Transactional
    public Map<String, Object> copyWeek(Long groupId, LocalDate sourceWeekStart, LocalDate targetWeekStart) {
        AttGroup group = requireGroup(groupId);
        if (sourceWeekStart == null || targetWeekStart == null) {
            throw new BusinessException("請選擇來源週與目標週");
        }
        if (sourceWeekStart.equals(targetWeekStart)) {
            throw new BusinessException("來源週與目標週不能相同");
        }
        LocalDate sourceEnd = sourceWeekStart.plusDays(6);
        List<AttSchedule> source = scheduleMapper.selectList(new LambdaQueryWrapper<AttSchedule>()
                .eq(AttSchedule::getGroupId, group.getId())
                .between(AttSchedule::getWorkDate, sourceWeekStart, sourceEnd));
        if (source.isEmpty()) {
            throw new BusinessException("來源週沒有排班記錄");
        }
        // 目标周只覆盖「源周里有的人」，其余人的既有排班保持不动
        Map<String, AttSchedule> target = loadSchedules(
                source.stream().map(s -> memberStub(s.getUserId())).toList(),
                targetWeekStart, targetWeekStart.plusDays(6));
        String operator = operatorResolver.currentOperatorName();
        int copied = 0;
        int rest = 0;
        for (AttSchedule from : source) {
            LocalDate targetDate = targetWeekStart.plusDays(from.getWorkDate().toEpochDay() - sourceWeekStart.toEpochDay());
            AttSchedule existing = target.get(from.getUserId() + "|" + targetDate);
            if (existing == null) {
                AttSchedule schedule = new AttSchedule();
                schedule.setGroupId(group.getId());
                schedule.setUserId(from.getUserId());
                schedule.setEmpNo(from.getEmpNo());
                schedule.setEmpName(from.getEmpName());
                schedule.setWorkDate(targetDate);
                schedule.setShiftId(from.getShiftId());
                schedule.setSource(SOURCE_COPY);
                schedule.setCreatedBy(operator);
                schedule.setUpdatedBy(operator);
                scheduleMapper.insert(schedule);
            } else {
                existing.setGroupId(group.getId());
                existing.setShiftId(from.getShiftId());
                existing.setSource(SOURCE_COPY);
                existing.setUpdatedBy(operator);
                scheduleMapper.updateById(existing);
            }
            copied++;
            if (from.getShiftId() == null) {
                rest++;
            }
        }
        return summary(copied, rest);
    }

    @Override
    public Map<String, Object> stats(Long groupId, LocalDate weekStart) {
        AttendanceScheduleVO week = week(groupId, weekStart);
        int scheduled = 0;
        int rest = 0;
        for (AttendanceScheduleVO.Row row : week.getRows()) {
            for (AttendanceScheduleVO.Cell cell : row.getCells().values()) {
                if (cell == null) {
                    continue;
                }
                if (cell.isRest()) {
                    rest++;
                } else {
                    scheduled++;
                }
            }
        }
        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("staff", week.getRows().size());
        stats.put("scheduled", scheduled);
        stats.put("rest", rest);
        stats.put("unscheduled", week.getUnscheduledCount());
        return stats;
    }

    /* ==================== 内部 ==================== */

    private Map<String, Object> summary(int saved, int rest) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("saved", saved);
        result.put("rest", rest);
        return result;
    }

    private AttendanceScheduleVO.Cell toCell(AttSchedule schedule, Map<Long, AttShift> shifts) {
        if (schedule == null) {
            return null;
        }
        AttendanceScheduleVO.Cell cell = new AttendanceScheduleVO.Cell();
        cell.setId(schedule.getId());
        cell.setShiftId(schedule.getShiftId());
        cell.setRest(schedule.getShiftId() == null);
        cell.setSource(schedule.getSource());
        AttShift shift = schedule.getShiftId() == null ? null : shifts.get(schedule.getShiftId());
        if (shift != null) {
            cell.setShiftCode(shift.getShiftCode());
            cell.setShiftName(shift.getShiftName());
        }
        return cell;
    }

    /** 按人 + 日期区间批量取排班，避免整周一格一次查询 */
    private Map<String, AttSchedule> loadSchedules(List<AttGroupMember> members, LocalDate start, LocalDate end) {
        List<Long> userIds = members.stream().map(AttGroupMember::getUserId).filter(Objects::nonNull).distinct().toList();
        if (userIds.isEmpty()) {
            return Map.of();
        }
        List<AttSchedule> rows = scheduleMapper.selectList(new LambdaQueryWrapper<AttSchedule>()
                .in(AttSchedule::getUserId, userIds)
                .between(AttSchedule::getWorkDate, start, end));
        Map<String, AttSchedule> byUserDate = new HashMap<>();
        for (AttSchedule row : rows) {
            byUserDate.put(row.getUserId() + "|" + row.getWorkDate(), row);
        }
        return byUserDate;
    }

    private Map<Long, AttShift> loadShifts(Iterable<AttSchedule> schedules) {
        Set<Long> ids = new HashSet<>();
        for (AttSchedule schedule : schedules) {
            if (schedule.getShiftId() != null) {
                ids.add(schedule.getShiftId());
            }
        }
        if (ids.isEmpty()) {
            return Map.of();
        }
        return shiftMapper.selectBatchIds(ids).stream()
                .collect(Collectors.toMap(AttShift::getId, s -> s));
    }

    /** 该周区间内的成员：按生效区间过滤，而不是按今天在册 */
    private List<AttGroupMember> membersInRange(Long groupId, LocalDate start, LocalDate end) {
        return memberMapper.selectList(new LambdaQueryWrapper<AttGroupMember>()
                .eq(AttGroupMember::getGroupId, groupId)
                .le(AttGroupMember::getValidFrom, end)
                .and(w -> w.isNull(AttGroupMember::getValidTo).or().ge(AttGroupMember::getValidTo, start))
                .orderByAsc(AttGroupMember::getEmpNo));
    }

    private void requireMemberOnDate(Long groupId, Long userId, LocalDate date) {
        Long count = memberMapper.selectCount(new LambdaQueryWrapper<AttGroupMember>()
                .eq(AttGroupMember::getGroupId, groupId)
                .eq(AttGroupMember::getUserId, userId)
                .le(AttGroupMember::getValidFrom, date)
                .and(w -> w.isNull(AttGroupMember::getValidTo).or().ge(AttGroupMember::getValidTo, date)));
        if (count == null || count == 0) {
            throw new BusinessException("員工不屬於該考勤組（或未在該日期生效），請先在考勤組維護成員");
        }
    }

    private void fillSnapshot(AttSchedule schedule, Long userId) {
        AttGroupMember member = memberMapper.selectOne(new LambdaQueryWrapper<AttGroupMember>()
                .eq(AttGroupMember::getUserId, userId)
                .isNull(AttGroupMember::getValidTo)
                .last("LIMIT 1"));
        schedule.setEmpNo(member == null || member.getEmpNo() == null ? "" : member.getEmpNo());
        schedule.setEmpName(member == null || member.getEmpName() == null ? "" : member.getEmpName());
    }

    private AttShift resolveShift(Long shiftId, Map<Long, AttShift> cache) {
        if (shiftId == null) {
            return null;
        }
        return cache.computeIfAbsent(shiftId, id -> {
            AttShift shift = shiftMapper.selectById(id);
            if (shift == null) {
                throw new BusinessException("班次不存在");
            }
            return shift;
        });
    }

    private AttGroup requireGroup(Long groupId) {
        AttGroup group = groupId == null ? null : groupMapper.selectById(groupId);
        if (group == null) {
            throw new BusinessException("考勤組不存在或已刪除");
        }
        return group;
    }

    /** 复制场景只需要 userId 与日期做键，其余字段留空 */
    private AttGroupMember memberStub(Long userId) {
        AttGroupMember member = new AttGroupMember();
        member.setUserId(userId);
        return member;
    }

    private List<String> dates(LocalDate start, LocalDate end) {
        List<String> days = new ArrayList<>();
        for (LocalDate cursor = start; !cursor.isAfter(end); cursor = cursor.plusDays(1)) {
            days.add(cursor.toString());
        }
        return days;
    }
}
