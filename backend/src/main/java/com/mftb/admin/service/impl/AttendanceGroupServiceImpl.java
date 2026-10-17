package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.AttendanceGroupVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.AttGroup;
import com.mftb.admin.entity.AttGroupMember;
import com.mftb.admin.entity.AttSchedule;
import com.mftb.admin.entity.AttShift;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.AttGroupMapper;
import com.mftb.admin.mapper.AttGroupMemberMapper;
import com.mftb.admin.mapper.AttScheduleMapper;
import com.mftb.admin.mapper.AttShiftMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.AttendanceGroupService;
import com.mftb.admin.util.AttendanceWriteGuard;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 考勤组服务实现。
 * <p>
 * 三条不能让步的口径：
 * ① 编号由服务端生成（{@code AG+YYYYMM+4}），前端传值一律忽略——稳定身份不能由客户端决定；
 * ② 成员维护走「闭合旧期间 + 开启新期间」，不物理删除，否则历史月份重算会拿到今天的归属；
 * ③ 一人同时只能属于一个考勤组，否则同一次打卡会被两个组各算一遍，日报与月报直接双计。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AttendanceGroupServiceImpl implements AttendanceGroupService {

    private static final String STATUS_ENABLED = "enabled";
    private static final String STATUS_DISABLED = "disabled";

    private final AttGroupMapper groupMapper;
    private final AttGroupMemberMapper memberMapper;
    private final AttShiftMapper shiftMapper;
    private final AttScheduleMapper scheduleMapper;
    private final SysUserMapper sysUserMapper;
    private final BizSeqService bizSeqService;
    private final OperatorResolver operatorResolver;

    @Override
    public PageResult<AttendanceGroupVO> list(long page, long size, String keyword, Integer groupType, String status) {
        Page<AttGroup> result = groupMapper.selectPage(
                new Page<>(PageResult.normalizePage(page), PageResult.normalizeSize(size)),
                filter(keyword, groupType, status).orderByAsc(AttGroup::getId));
        List<AttGroup> rows = result.getRecords();
        if (rows.isEmpty()) {
            return new PageResult<>(List.of(), result.getTotal());
        }
        // 批量装配班次名与成员数：逐行回查会让一页 20 条打出 40 条 SQL
        Map<Long, String> shiftNames = loadShiftNames(rows);
        Map<Long, Long> memberCounts = loadMemberCounts(rows.stream().map(AttGroup::getId).filter(Objects::nonNull).toList());
        List<AttendanceGroupVO> records = rows.stream()
                .map(g -> AttendanceGroupVO.of(g, g.getShiftId() == null ? null : shiftNames.get(g.getShiftId()),
                        memberCounts.getOrDefault(g.getId(), 0L)))
                .toList();
        return new PageResult<>(records, result.getTotal());
    }

    /**
     * 与列表同口径的统计（总数 / 启用 / 覆盖人数 / 未绑班次）。
     * <p>覆盖人数只算「当前生效」成员，与列表的 memberCount 同一口径；
     * 把历史期间的人也算进来会让“停用组还占着多少人”看不出来。
     */
    @Override
    public Map<String, Object> stats(String keyword, Integer groupType, String status) {
        List<AttGroup> rows = groupMapper.selectList(filter(keyword, groupType, status));
        long enabled = 0;
        long noShift = 0;
        List<Long> ids = new ArrayList<>();
        for (AttGroup row : rows) {
            if (STATUS_ENABLED.equals(row.getStatus())) {
                enabled++;
            }
            // 自由工时本就不绑班次，计入「未绑」会把正常配置报成异常
            if (row.getShiftId() == null && !Objects.equals(row.getGroupType(), AttGroup.TYPE_FLEX)) {
                noShift++;
            }
            if (row.getId() != null) {
                ids.add(row.getId());
            }
        }
        long members = ids.isEmpty() ? 0L
                : loadMemberCounts(ids).values().stream().mapToLong(Long::longValue).sum();
        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("total", rows.size());
        stats.put("enabled", enabled);
        stats.put("members", members);
        stats.put("noShift", noShift);
        return stats;
    }

    /** 列表与统计共用的条件构造器，口径不可能漂移 */
    private LambdaQueryWrapper<AttGroup> filter(String keyword, Integer groupType, String status) {
        LambdaQueryWrapper<AttGroup> wrapper = new LambdaQueryWrapper<>();
        if (groupType != null) {
            wrapper.eq(AttGroup::getGroupType, groupType);
        }
        if (StringUtils.hasText(status)) {
            wrapper.eq(AttGroup::getStatus, status);
        }
        if (StringUtils.hasText(keyword)) {
            String kw = keyword.trim();
            wrapper.and(w -> w.like(AttGroup::getGroupName, kw).or().like(AttGroup::getGroupNo, kw)
                    .or().like(AttGroup::getWorkPlace, kw).or().like(AttGroup::getScopeText, kw));
        }
        return wrapper;
    }

    @Override
    public AttendanceGroupVO detail(Long id) {
        AttGroup group = requireGroup(id);
        String shiftName = group.getShiftId() == null ? null : shiftName(group.getShiftId());
        long count = memberMapper.selectCount(new LambdaQueryWrapper<AttGroupMember>()
                .eq(AttGroupMember::getGroupId, id)
                .isNull(AttGroupMember::getValidTo));
        return AttendanceGroupVO.of(group, shiftName, count);
    }

    @Override
    @Transactional
    public AttGroup save(AttGroup group) {
        // 实体直接当请求体收：先清掉 deleted 与审计字段，否则提交 deleted:1 会长出一条
        // 列表查不到、却占住软删感知唯一键的「隐形考勤组」，后续同名新增全部撞键
        AttendanceWriteGuard.strip(group);
        validate(group);
        String operator = operatorResolver.currentOperatorName();
        if (group.getId() == null) {
            requireNameUnique(group.getGroupName(), null);
            group.setGroupNo(bizSeqService.next(BizSeqService.RULE_ATTENDANCE_GROUP));
            // 新建允许直接选择启用/停用（先建规则暂不启用是真实场景），仅非法值回退为启用
            group.setStatus(isValidStatus(group.getStatus()) ? group.getStatus() : STATUS_ENABLED);
            group.setCreatedBy(operator);
            group.setUpdatedBy(operator);
            groupMapper.insert(group);
        } else {
            AttGroup existing = requireGroup(group.getId());
            requireNameUnique(group.getGroupName(), group.getId());
            // 编号是稳定身份，不接受编辑请求改写；status 未传时保留原值（表单可改状态，启停接口是快捷入口）
            group.setGroupNo(existing.getGroupNo());
            if (!isValidStatus(group.getStatus())) {
                group.setStatus(existing.getStatus());
            }
            group.setCreatedBy(existing.getCreatedBy());
            group.setUpdatedBy(operator);
            groupMapper.updateById(group);
        }
        return groupMapper.selectById(group.getId());
    }

    @Override
    @Transactional
    public AttGroup changeStatus(Long id, String status) {
        if (!STATUS_ENABLED.equals(status) && !STATUS_DISABLED.equals(status)) {
            throw new BusinessException("狀態只能為 enabled 或 disabled");
        }
        AttGroup group = requireGroup(id);
        group.setStatus(status);
        group.setUpdatedBy(operatorResolver.currentOperatorName());
        groupMapper.updateById(group);
        return group;
    }

    @Override
    @Transactional
    public void delete(Long id) {
        requireGroup(id);
        Long members = memberMapper.selectCount(new LambdaQueryWrapper<AttGroupMember>().eq(AttGroupMember::getGroupId, id));
        if (members != null && members > 0) {
            // 历史口径曾写「請先停用」，但停用并不能让删除通过（本方法只看成员/排班记录，与状态无关），
            // 用户照做后再删仍被同样文案拒绝 → 自相矛盾。停用是这类有归属追溯的考勤组的终态，
            // 文案统一指向「請改用停用」，如实说明阻塞原因是成员记录而非启用状态。
            throw new BusinessException("該考勤組已有成員記錄，刪除會切斷歷史歸屬追溯，請改用停用");
        }
        Long schedules = scheduleMapper.selectCount(new LambdaQueryWrapper<AttSchedule>().eq(AttSchedule::getGroupId, id));
        if (schedules != null && schedules > 0) {
            throw new BusinessException("該考勤組已存在排班記錄，請改用停用");
        }
        groupMapper.deleteById(id);
    }

    @Override
    public List<AttGroupMember> currentMembers(Long groupId) {
        requireGroup(groupId);
        return memberMapper.selectList(new LambdaQueryWrapper<AttGroupMember>()
                .eq(AttGroupMember::getGroupId, groupId)
                .isNull(AttGroupMember::getValidTo)
                .orderByAsc(AttGroupMember::getEmpNo));
    }

    @Override
    @Transactional
    public Map<String, Object> syncMembers(Long groupId, List<Long> userIds) {
        AttGroup group = requireGroup(groupId);
        LocalDate today = LocalDate.now();
        Set<Long> target = new LinkedHashSet<>(userIds == null ? List.of() : userIds);
        if (target.contains(null)) {
            throw new BusinessException("成員清單存在空值");
        }

        List<AttGroupMember> current = currentMembers(groupId);
        Set<Long> currentIds = current.stream().map(AttGroupMember::getUserId).collect(Collectors.toSet());

        // 关闭：当前生效但不在目标集合里的人，把生效止闭合到昨天，保留历史归属
        int closed = 0;
        for (AttGroupMember member : current) {
            if (!target.contains(member.getUserId())) {
                member.setValidTo(today.minusDays(1));
                member.setUpdatedBy(operatorResolver.currentOperatorName());
                memberMapper.updateById(member);
                closed++;
            }
        }

        int added = 0;
        List<Long> toAdd = target.stream().filter(id -> !currentIds.contains(id)).toList();
        if (!toAdd.isEmpty()) {
            requireNotInOtherGroup(toAdd, groupId);
            List<SysUser> users = sysUserMapper.selectBatchIds(toAdd);
            Map<Long, SysUser> byId = users.stream().collect(Collectors.toMap(SysUser::getId, u -> u));
            String operator = operatorResolver.currentOperatorName();
            for (Long userId : toAdd) {
                SysUser user = byId.get(userId);
                if (user == null) {
                    throw new BusinessException("員工不存在或已離職：" + userId);
                }
                AttGroupMember member = new AttGroupMember();
                member.setGroupId(group.getId());
                member.setUserId(userId);
                member.setEmpNo(user.getEmpId() == null ? "" : user.getEmpId());
                member.setEmpName(user.getName() == null ? "" : user.getName());
                member.setDeptId(user.getDepartmentId());
                member.setDeptName(user.getDepartment() == null ? "" : user.getDepartment());
                // 新期间从今天起，不改写历史行
                member.setValidFrom(today);
                member.setCreatedBy(operator);
                member.setUpdatedBy(operator);
                memberMapper.insert(member);
                added++;
            }
        }
        log.info("考勤组成员差量维护: group={}, 新增={}, 闭合={}", group.getGroupName(), added, closed);
        Map<String, Object> summary = new HashMap<>();
        summary.put("added", added);
        summary.put("closed", closed);
        summary.put("total", target.size());
        return summary;
    }

    /* ==================== 校验 ==================== */

    private void validate(AttGroup group) {
        if (!StringUtils.hasText(group.getGroupName())) {
            throw new BusinessException("考勤組名稱為必填");
        }
        if (StringUtils.hasText(group.getStatus()) && !isValidStatus(group.getStatus())) {
            throw new BusinessException("狀態只能為 enabled 或 disabled");
        }
        if (group.getGroupType() == null || group.getGroupType() < AttGroup.TYPE_FIXED || group.getGroupType() > AttGroup.TYPE_FLEX) {
            throw new BusinessException("考勤制度不合法");
        }
        if (!StringUtils.hasText(group.getWorkPlace())) {
            throw new BusinessException("考勤地為必填：多門店場景不能靠部門樹推導歸屬");
        }
        if (group.getGroupType() == AttGroup.TYPE_FIXED && group.getShiftId() == null) {
            throw new BusinessException("固定班制必須關聯班次");
        }
        if (group.getShiftId() != null) {
            AttShift shift = shiftMapper.selectById(group.getShiftId());
            if (shift == null) {
                throw new BusinessException("關聯班次不存在");
            }
            if (!STATUS_ENABLED.equals(shift.getStatus())) {
                throw new BusinessException("關聯班次「" + shift.getShiftName() + "」已停用，請先啟用或改選");
            }
        }
        if (group.getLateGraceMin() == null || group.getLateGraceMin() < 0 || group.getLateGraceMin() > 120
                || group.getEarlyGraceMin() == null || group.getEarlyGraceMin() < 0 || group.getEarlyGraceMin() > 120) {
            throw new BusinessException("遲到/早退寬限需在 0~120 分鐘之間");
        }
        if (!StringUtils.hasText(group.getPunchSources())) {
            throw new BusinessException("至少開通一種打卡來源");
        }
        for (String source : group.getPunchSources().split(",")) {
            String trimmed = source.trim();
            if (!trimmed.equals(String.valueOf(AttGroup.SOURCE_DINGTALK)) && !trimmed.equals(String.valueOf(AttGroup.SOURCE_IMPORT))) {
                throw new BusinessException("打卡來源不合法：" + trimmed);
            }
        }
    }

    private static boolean isValidStatus(String status) {
        return STATUS_ENABLED.equals(status) || STATUS_DISABLED.equals(status);
    }

    private AttGroup requireGroup(Long id) {
        AttGroup group = id == null ? null : groupMapper.selectById(id);
        if (group == null) {
            throw new BusinessException("考勤組不存在或已刪除");
        }
        return group;
    }

    private void requireNameUnique(String name, Long excludeId) {
        Long dup = groupMapper.selectCount(new LambdaQueryWrapper<AttGroup>()
                .eq(AttGroup::getGroupName, name)
                .ne(excludeId != null, AttGroup::getId, excludeId));
        if (dup != null && dup > 0) {
            throw new BusinessException("考勤組名稱「" + name + "」已存在");
        }
    }

    /**
     * 一人同时只能属于一个考勤组。
     * <p>不做这个约束，同一次打卡会被两个组各算一遍，日报与月报直接双计；
     * 报错必须点名是谁和哪个组，否则管理员无法从界面上定位冲突。
     */
    private void requireNotInOtherGroup(List<Long> userIds, Long selfGroupId) {
        List<AttGroupMember> conflicts = memberMapper.selectList(new LambdaQueryWrapper<AttGroupMember>()
                .in(AttGroupMember::getUserId, userIds)
                .isNull(AttGroupMember::getValidTo)
                .ne(AttGroupMember::getGroupId, selfGroupId));
        if (conflicts.isEmpty()) {
            return;
        }
        Map<Long, String> groupNames = new HashMap<>();
        for (AttGroupMember conflict : conflicts) {
            groupNames.computeIfAbsent(conflict.getGroupId(), gid -> {
                AttGroup g = groupMapper.selectById(gid);
                return g == null ? String.valueOf(gid) : g.getGroupName();
            });
        }
        String detail = conflicts.stream()
                .map(c -> c.getEmpName() + "→" + groupNames.get(c.getGroupId()))
                .distinct()
                .collect(Collectors.joining("、"));
        throw new BusinessException("以下員工已屬於其他考勤組，請先從原組移出：" + detail);
    }

    /* ==================== 批量装配 ==================== */

    private Map<Long, String> loadShiftNames(List<AttGroup> groups) {
        List<Long> shiftIds = groups.stream().map(AttGroup::getShiftId).filter(Objects::nonNull).distinct().toList();
        if (shiftIds.isEmpty()) {
            return Map.of();
        }
        return shiftMapper.selectBatchIds(shiftIds).stream()
                .collect(Collectors.toMap(AttShift::getId, AttShift::getShiftName));
    }

    private Map<Long, Long> loadMemberCounts(List<Long> groupIds) {
        if (groupIds.isEmpty()) {
            return Map.of();
        }
        // 一条 GROUP BY 出全部计数，替代逐行 selectCount
        List<Map<String, Object>> rows = memberMapper.selectMaps(new QueryWrapper<AttGroupMember>()
                .select("group_id AS groupId", "COUNT(*) AS cnt")
                .isNull("valid_to")
                .eq("deleted", 0)
                .in("group_id", groupIds)
                .groupBy("group_id"));
        Map<Long, Long> counts = new HashMap<>();
        for (Map<String, Object> row : rows) {
            Object gid = row.get("groupId");
            Object cnt = row.get("cnt");
            if (gid instanceof Number g && cnt instanceof Number c) {
                counts.put(g.longValue(), c.longValue());
            }
        }
        return counts;
    }

    private String shiftName(Long shiftId) {
        AttShift shift = shiftMapper.selectById(shiftId);
        return shift == null ? null : shift.getShiftName();
    }
}
