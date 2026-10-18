package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.toolkit.support.SFunction;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.AttendancePunchImportRow;
import com.mftb.admin.dto.AttendancePunchVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.AttGroup;
import com.mftb.admin.entity.AttGroupMember;
import com.mftb.admin.entity.AttPunchLog;
import com.mftb.admin.entity.AttSchedule;
import com.mftb.admin.entity.AttShift;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.AttGroupMapper;
import com.mftb.admin.mapper.AttGroupMemberMapper;
import com.mftb.admin.mapper.AttPunchLogMapper;
import com.mftb.admin.mapper.AttScheduleMapper;
import com.mftb.admin.mapper.AttShiftMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.AttendancePunchService;
import com.mftb.admin.service.OrgScopeService;
import com.mftb.admin.util.OperatorResolver;
import com.mftb.admin.util.ScopeFilters;
import com.mftb.admin.util.SortSupport;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 打卡流水服务实现。
 * <p>
 * 三处刻意的设计：
 * ① 列表与统计共用同一个 {@code filter(...)} 条件构造器，口径不可能漂移
 *    （统计卡单独发一次无条件请求是历史事故源）；
 * ② {@code work_date} 入库时定死：凌晨卡遇到前一天排了跨天夜班时归前一天，
 *    否则夜班永远算错一天；
 * ③ 这里只落「正常/外勤」，迟到早退由日汇总计算引擎按班次与宽限判定后回写——
 *    判定规则只允许存在一处，导入与同步各写一套必然对不上。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AttendancePunchServiceImpl implements AttendancePunchService {

    private static final DateTimeFormatter PUNCH_AT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    /** 凌晨几点前的卡要考虑跨天夜班归属 */
    private static final int CROSS_DAY_CUTOFF_HOUR = 6;
    /** 单次导入上限：超过 5000 行让前端拆文件，避免一次请求把连接与内存吃满 */
    private static final int MAX_IMPORT_ROWS = 5000;

    /** 打卡可服务端排序的列白名单（列key → getter） */
    private static final Map<String, SFunction<AttPunchLog, ?>> PUNCH_SORT_ALLOW = Map.of(
            "punchAt", AttPunchLog::getPunchAt,
            "workDate", AttPunchLog::getWorkDate);

    private final AttPunchLogMapper punchMapper;
    private final SysUserMapper sysUserMapper;
    private final AttGroupMapper groupMapper;
    private final AttGroupMemberMapper memberMapper;
    private final AttScheduleMapper scheduleMapper;
    private final AttShiftMapper shiftMapper;
    private final OperatorResolver operatorResolver;
    private final OrgScopeService orgScopeService;

    @Override
    public PageResult<AttendancePunchVO> page(long page, long size, LocalDate from, LocalDate to, String keyword,
                                              Long groupId, Long deptId, Integer source, Integer result,
                                              String sortField, String sortOrder) {
        LambdaQueryWrapper<AttPunchLog> wrapper = filter(from, to, keyword, groupId, deptId, source, result);
        // 白名单排序优先，再补 punchAt 降序作稳定次级序（同原默认）
        SortSupport.apply(wrapper, sortField, sortOrder, PUNCH_SORT_ALLOW);
        wrapper.orderByDesc(AttPunchLog::getPunchAt);
        Page<AttPunchLog> rows = punchMapper.selectPage(
                new Page<>(PageResult.normalizePage(page), PageResult.normalizeSize(size)), wrapper);
        List<AttPunchLog> records = rows.getRecords();
        if (records.isEmpty()) {
            return new PageResult<>(List.of(), rows.getTotal());
        }
        Map<Long, SysUser> users = loadUsers(records);
        Map<Long, String> groupNames = loadGroupNames(records);
        List<AttendancePunchVO> vos = records.stream().map(record -> {
            AttendancePunchVO vo = AttendancePunchVO.of(record);
            SysUser user = users.get(record.getUserId());
            if (user != null) {
                vo.setDeptName(user.getDepartment());
            }
            vo.setGroupName(record.getGroupId() == null ? null : groupNames.get(record.getGroupId()));
            return vo;
        }).toList();
        return new PageResult<>(vos, rows.getTotal());
    }

    @Override
    public Map<String, Object> stats(LocalDate from, LocalDate to, String keyword, Long groupId, Long deptId,
                                     Integer source, Integer result) {
        // 只取判定列做内存聚合：与列表同一套条件，且避免手写 SQL 片段带来的注入面
        List<AttPunchLog> rows = punchMapper.selectList(
                filter(from, to, keyword, groupId, deptId, source, result).select(AttPunchLog::getResult));
        long normal = 0;
        long abnormal = 0;
        long outside = 0;
        for (AttPunchLog row : rows) {
            Integer code = row.getResult();
            if (code == null || code == AttPunchLog.RESULT_NORMAL) {
                normal++;
            } else if (code == AttPunchLog.RESULT_OUTSIDE) {
                outside++;
            } else {
                abnormal++;
            }
        }
        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("total", rows.size());
        stats.put("normal", normal);
        stats.put("abnormal", abnormal);
        stats.put("outside", outside);
        return stats;
    }

    @Override
    @Transactional
    public Map<String, Object> importRows(List<AttendancePunchImportRow> rows) {
        if (rows == null || rows.isEmpty()) {
            throw new BusinessException("導入清單為空");
        }
        if (rows.size() > MAX_IMPORT_ROWS) {
            throw new BusinessException("單次導入不得超過 " + MAX_IMPORT_ROWS + " 行，請拆分檔案");
        }
        Map<String, SysUser> byEmpNo = loadUsersByEmpNo(rows);
        String operator = operatorResolver.currentOperatorName();
        // 导入是按工号写别人的打卡，属于跨人写入：必须逐个校验人员在可见范围内，
        // 否则「能看自己」的角色可以凭一份 Excel 把全公司的打卡都补进去。
        Set<Long> visibleUsers = orgScopeService.resolveVisibleUserIds();
        List<Map<String, Object>> errors = new ArrayList<>();
        List<AttPunchLog> prepared = new ArrayList<>();
        for (int index = 0; index < rows.size(); index++) {
            AttendancePunchImportRow row = rows.get(index);
            String reason = validateImportRow(row, byEmpNo);
            if (reason != null) {
                errors.add(Map.of("row", index + 1, "reason", reason));
                continue;
            }
            SysUser user = byEmpNo.get(row.getEmpNo().trim());
            if (visibleUsers != null && !visibleUsers.contains(user.getId())) {
                errors.add(Map.of("row", index + 1, "reason", "無權導入該人員的打卡記錄"));
                continue;
            }
            LocalDateTime at = LocalDateTime.parse(row.getPunchAt().trim(), PUNCH_AT);
            String location = row.getLocation() == null ? "" : row.getLocation().trim();
            AttPunchLog record = new AttPunchLog();
            record.setUserId(user.getId());
            record.setEmpNo(user.getEmpId());
            record.setEmpName(user.getName());
            record.setPunchAt(at);
            record.setPunchType(row.getPunchType());
            record.setSource(AttPunchLog.SOURCE_IMPORT);
            record.setLocation(location);
            record.setRawRef("");
            record.setResult(isOutside(location) ? AttPunchLog.RESULT_OUTSIDE : AttPunchLog.RESULT_NORMAL);
            record.setWorkDate(resolveWorkDate(user.getId(), at));
            record.setGroupId(currentGroupId(user.getId()));
            record.setCreatedBy(operator);
            record.setUpdatedBy(operator);
            prepared.add(record);
        }
        int inserted = saveGenerated(prepared);
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("total", rows.size());
        summary.put("inserted", inserted);
        summary.put("duplicated", prepared.size() - inserted);
        summary.put("failed", errors.size());
        summary.put("errors", errors);
        log.info("打卡導入完成: 提交={} 行, 入庫={}, 重複={}, 校驗失敗={}",
                rows.size(), inserted, prepared.size() - inserted, errors.size());
        return summary;
    }

    @Override
    @Transactional
    public int saveGenerated(List<AttPunchLog> logs) {
        if (logs == null || logs.isEmpty()) {
            return 0;
        }
        int inserted = 0;
        for (AttPunchLog record : logs) {
            if (record.getUserId() == null || record.getPunchAt() == null || record.getSource() == null) {
                continue;
            }
            Long exists = punchMapper.selectCount(new LambdaQueryWrapper<AttPunchLog>()
                    .eq(AttPunchLog::getUserId, record.getUserId())
                    .eq(AttPunchLog::getPunchAt, record.getPunchAt())
                    .eq(AttPunchLog::getSource, record.getSource()));
            if (exists != null && exists > 0) {
                continue;
            }
            if (record.getWorkDate() == null) {
                record.setWorkDate(resolveWorkDate(record.getUserId(), record.getPunchAt()));
            }
            try {
                punchMapper.insert(record);
                inserted++;
            } catch (DuplicateKeyException e) {
                // 并发下由唯一键兜底：重复不是错误，计入 duplicated 即可
                log.debug("打卡冪等鍵衝突，跳過: user={}, at={}", record.getUserId(), record.getPunchAt());
            }
        }
        return inserted;
    }

    /* ==================== 查询条件 ==================== */

    private LambdaQueryWrapper<AttPunchLog> filter(LocalDate from, LocalDate to, String keyword, Long groupId,
                                                   Long deptId, Integer source, Integer result) {
        LambdaQueryWrapper<AttPunchLog> wrapper = new LambdaQueryWrapper<>();
        if (from != null) {
            wrapper.ge(AttPunchLog::getWorkDate, from);
        }
        if (to != null) {
            wrapper.le(AttPunchLog::getWorkDate, to);
        }
        if (groupId != null) {
            wrapper.eq(AttPunchLog::getGroupId, groupId);
        }
        if (source != null) {
            wrapper.eq(AttPunchLog::getSource, source);
        }
        if (result != null) {
            wrapper.eq(AttPunchLog::getResult, result);
        }
        if (deptId != null) {
            List<Long> userIds = sysUserMapper.selectList(new LambdaQueryWrapper<SysUser>()
                            .eq(SysUser::getDepartmentId, deptId).select(SysUser::getId))
                    .stream().map(SysUser::getId).toList();
            // 部门下没人时用恒假条件，而不是返回全量
            wrapper.in(!userIds.isEmpty(), AttPunchLog::getUserId, userIds);
            if (userIds.isEmpty()) {
                wrapper.eq(AttPunchLog::getUserId, -1L);
            }
        }
        if (StringUtils.hasText(keyword)) {
            String kw = keyword.trim();
            wrapper.and(w -> w.like(AttPunchLog::getEmpNo, kw).or().like(AttPunchLog::getEmpName, kw)
                    .or().like(AttPunchLog::getLocation, kw));
        }
        // 组织人员数据范围：列表、统计卡、导出共用本方法，所以三处口径天然一致；
        // 只在前端隐藏列或只过滤分页都是假安全。
        ScopeFilters.applyUsers(wrapper, AttPunchLog::getUserId, orgScopeService.resolveVisibleUserIds());
        return wrapper;
    }

    /* ==================== 校验与装配 ==================== */

    private String validateImportRow(AttendancePunchImportRow row, Map<String, SysUser> byEmpNo) {
        if (row == null || !StringUtils.hasText(row.getEmpNo())) {
            return "工號為空";
        }
        if (!byEmpNo.containsKey(row.getEmpNo().trim())) {
            return "員工不存在或已離職：" + row.getEmpNo().trim();
        }
        if (!StringUtils.hasText(row.getPunchAt())) {
            return "打卡時間為空";
        }
        try {
            LocalDateTime.parse(row.getPunchAt().trim(), PUNCH_AT);
        } catch (RuntimeException e) {
            return "打卡時間格式應為 yyyy-MM-dd HH:mm:ss";
        }
        if (row.getPunchType() == null
                || (row.getPunchType() != AttPunchLog.TYPE_ON && row.getPunchType() != AttPunchLog.TYPE_OFF)) {
            return "卡別只能為 1=上班卡 或 2=下班卡";
        }
        return null;
    }

    private Map<String, SysUser> loadUsersByEmpNo(List<AttendancePunchImportRow> rows) {
        Set<String> empNos = rows.stream().filter(Objects::nonNull)
                .map(AttendancePunchImportRow::getEmpNo).filter(StringUtils::hasText)
                .map(String::trim).collect(Collectors.toSet());
        if (empNos.isEmpty()) {
            return Map.of();
        }
        return sysUserMapper.selectList(new LambdaQueryWrapper<SysUser>().in(SysUser::getEmpId, empNos))
                .stream().collect(Collectors.toMap(SysUser::getEmpId, u -> u, (a, b) -> a));
    }

    private Map<Long, SysUser> loadUsers(List<AttPunchLog> records) {
        Set<Long> ids = records.stream().map(AttPunchLog::getUserId).filter(Objects::nonNull)
                .collect(Collectors.toSet());
        if (ids.isEmpty()) {
            return Map.of();
        }
        return sysUserMapper.selectBatchIds(ids).stream().collect(Collectors.toMap(SysUser::getId, u -> u));
    }

    private Map<Long, String> loadGroupNames(List<AttPunchLog> records) {
        Set<Long> ids = records.stream().map(AttPunchLog::getGroupId).filter(Objects::nonNull)
                .collect(Collectors.toSet());
        if (ids.isEmpty()) {
            return Map.of();
        }
        Map<Long, String> names = new HashMap<>();
        for (AttGroup group : groupMapper.selectBatchIds(ids)) {
            names.put(group.getId(), group.getGroupName());
        }
        return names;
    }

    /** 当前生效考勤组；无组人员允许只存事实不出结论（groupId 为空） */
    private Long currentGroupId(Long userId) {
        AttGroupMember member = memberMapper.selectOne(new LambdaQueryWrapper<AttGroupMember>()
                .eq(AttGroupMember::getUserId, userId)
                .isNull(AttGroupMember::getValidTo)
                .orderByDesc(AttGroupMember::getValidFrom)
                .last("LIMIT 1"));
        return member == null ? null : member.getGroupId();
    }

    /** 凌晨卡 + 前一天跨天夜班 → 归前一天；其余按打卡日期 */
    LocalDate resolveWorkDate(Long userId, LocalDateTime at) {
        LocalDate date = at.toLocalDate();
        if (at.getHour() >= CROSS_DAY_CUTOFF_HOUR) {
            return date;
        }
        AttSchedule previous = scheduleMapper.selectOne(new LambdaQueryWrapper<AttSchedule>()
                .eq(AttSchedule::getUserId, userId)
                .eq(AttSchedule::getWorkDate, date.minusDays(1))
                .last("LIMIT 1"));
        if (previous == null || previous.getShiftId() == null) {
            return date;
        }
        AttShift shift = shiftMapper.selectById(previous.getShiftId());
        return shift != null && Integer.valueOf(1).equals(shift.getCrossDay()) ? date.minusDays(1) : date;
    }

    private static boolean isOutside(String location) {
        return location != null && (location.contains("外勤") || location.toUpperCase().contains("OUTSIDE"));
    }
}
