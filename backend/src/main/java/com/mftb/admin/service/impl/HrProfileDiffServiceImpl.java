package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.constant.BuiltinAccounts;
import com.mftb.admin.constant.HrOperationCode;
import com.mftb.admin.constant.HrProfileDiff;
import com.mftb.admin.dto.ProfileDiffItemVO;
import com.mftb.admin.dto.ProfileDiffReportVO;
import com.mftb.admin.entity.EmpPositionRecord;
import com.mftb.admin.entity.HrEmploymentPeriod;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.HrAssignmentQuery;
import com.mftb.admin.service.HrEmploymentPeriodService;
import com.mftb.admin.service.HrProfileDiffService;
import com.mftb.admin.service.OrgScopeService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

/**
 * 差异报告实现：三份事实源各读一次（批量，不一人三查询），逐人比对并只打类别码。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class HrProfileDiffServiceImpl implements HrProfileDiffService {

    /** 明细返回上限：报告默认按严重度倒序，被截断的都是低风险行；计数仍按全量 */
    private static final int MAX_ITEMS = 500;

    private final SysUserMapper sysUserMapper;
    private final HrAssignmentQuery hrAssignmentQuery;
    private final HrEmploymentPeriodService employmentPeriodService;
    private final OrgScopeService orgScopeService;

    @Override
    public ProfileDiffReportVO report(LocalDate asOf) {
        LocalDate date = asOf == null ? LocalDate.now() : asOf;
        ProfileDiffReportVO report = new ProfileDiffReportVO();
        report.setAsOf(date);
        report.setGeneratedAt(LocalDateTime.now());

        List<SysUser> users = scopedUsers();
        report.setScannedUsers(users.size());
        if (users.isEmpty()) {
            return report;
        }
        List<Long> userIds = users.stream().map(SysUser::getId).toList();
        Map<Long, EmpPositionRecord> asOfRecord = hrAssignmentQuery.asOfRecords(userIds, date);
        Map<Long, List<EmpPositionRecord>> history = hrAssignmentQuery.historyOf(userIds);
        Map<Long, List<HrEmploymentPeriod>> periods = employmentPeriodService.listByUsers(userIds);

        Map<String, Long> counts = new LinkedHashMap<>();
        List<ProfileDiffItemVO> rows = new ArrayList<>();
        int registerable = 0;
        for (SysUser user : users) {
            List<EmpPositionRecord> records = history.getOrDefault(user.getId(), List.of());
            ProfileDiffItemVO item = inspect(user, records, asOfRecord.get(user.getId()),
                    periods.getOrDefault(user.getId(), List.of()), date);
            if (item.getCodes().isEmpty()) {
                continue;
            }
            rows.add(item);
            for (String code : item.getCodes()) {
                counts.merge(code, 1L, Long::sum);
            }
            if (item.getCodes().contains(HrProfileDiff.PERIOD_NOT_REGISTERED)) {
                registerable++;
            }
        }
        rows.sort(Comparator
                .comparingInt((ProfileDiffItemVO r) -> HrProfileDiff.severityRank(r.getSeverity())).reversed()
                .thenComparing(r -> r.getName() == null ? "" : r.getName()));

        report.setDiffUsers(rows.size());
        report.setRegisterableUsers(registerable);
        report.setCountsByCategory(sortCounts(counts));
        report.setTruncated(rows.size() > MAX_ITEMS);
        report.setItems(rows.size() > MAX_ITEMS ? new ArrayList<>(rows.subList(0, MAX_ITEMS)) : rows);
        log.info("雇佣数据差异报告: asOf={}, 扫描 {} 人, 差异 {} 人", date, report.getScannedUsers(), rows.size());
        return report;
    }

    /** 逐人比对：只打码不修数，任何「修数」都必须由 HR 判定后走显式登记动作 */
    private ProfileDiffItemVO inspect(SysUser user, List<EmpPositionRecord> records,
                                      EmpPositionRecord effective, List<HrEmploymentPeriod> registered,
                                      LocalDate asOf) {
        ProfileDiffItemVO item = new ProfileDiffItemVO();
        item.setUserId(user.getId());
        item.setEmpId(user.getEmpId());
        item.setName(user.getName());
        item.setAccountStatus(user.getStatus());
        item.setSnapshotDept(user.getDepartment());
        item.setSnapshotPosition(user.getPosition());

        Set<String> codes = new TreeSet<>();
        boolean resigned = effective != null
                && HrOperationCode.isResigned(effective.getOperationCode(), effective.getOperation());
        item.setEmploymentStatus(resigned ? HrAssignmentQuery.STATUS_RESIGNED
                : HrAssignmentQuery.STATUS_ACTIVE);

        if (records.isEmpty()) {
            codes.add(HrProfileDiff.NO_POSITION_RECORD);
        } else {
            boolean hasAnchor = records.stream()
                    .filter(r -> r.getEffectiveDate() != null && !r.getEffectiveDate().isAfter(asOf))
                    .anyMatch(r -> HrOperationCode.isEmploymentStart(r.getOperationCode(), r.getOperation()));
            if (!hasAnchor) {
                codes.add(HrProfileDiff.START_ANCHOR_MISSING);
            }
            long future = records.stream()
                    .filter(r -> r.getEffectiveDate() != null && r.getEffectiveDate().isAfter(asOf))
                    .count();
            item.setFutureAssignments((int) future);
            if (future > 0) {
                codes.add(HrProfileDiff.FUTURE_ASSIGNMENT);
            }
        }

        List<HrEmploymentPeriod> derived = HrEmploymentPeriodCalculator.derive(records, asOf);
        item.setDerivedPeriods(derived.size());
        item.setRegisteredPeriods(registered.size());
        derived.stream()
                .filter(p -> p.getStartDate() != null && !p.getStartDate().isAfter(asOf))
                .max(Comparator.comparing(HrEmploymentPeriod::getStartDate))
                .ifPresent(p -> {
                    item.setEmploymentStart(p.getStartDate());
                    item.setStartDateSource(p.getStartDateSource());
                });

        if (effective != null) {
            item.setAsOfDept(effective.getServiceDept());
            item.setAsOfPosition(effective.getPositionName());
            item.setAsOfCompany(effective.getCompany());
            if (differs(user.getDepartment(), effective.getServiceDept())) {
                codes.add(HrProfileDiff.DEPT_MISMATCH);
            }
            if (differs(user.getPosition(), effective.getPositionName())) {
                codes.add(HrProfileDiff.POSITION_MISMATCH);
            }
        }

        // 账号状态与人事在职状态是两条正交的线（方案 §7.2），但反过来对不上就是风险
        Integer accountStatus = user.getStatus();
        if (accountStatus != null) {
            if (resigned && accountStatus == 1) {
                codes.add(HrProfileDiff.RESIGNED_ACCOUNT_ACTIVE);
            }
            if (!resigned && accountStatus == 0) {
                codes.add(HrProfileDiff.ACTIVE_EMPLOYMENT_ACCOUNT_DISABLED);
            }
        }

        if (!derived.isEmpty() && registered.isEmpty()) {
            codes.add(HrProfileDiff.PERIOD_NOT_REGISTERED);
        } else if (!registered.isEmpty() && registered.size() != derived.size()) {
            codes.add(HrProfileDiff.PERIOD_COUNT_MISMATCH);
        }
        boolean endUnknown = registered.stream()
                .anyMatch(p -> HrEmploymentPeriodCalculator.END_REASON_MISSING_DIMISSION.equals(p.getEndReason()));
        if (endUnknown) {
            codes.add(HrProfileDiff.PERIOD_END_DATE_UNKNOWN);
        }

        item.setCodes(new ArrayList<>(codes));
        item.setSeverity(HrProfileDiff.highestSeverity(codes));
        return item;
    }

    /**
     * 快照与事实是否不一致。
     * <p>两边都空 = 一致（没填的东西不构成冲突）；一边有一边空 = 不一致 —— 后者容易被当成
     * 「历史记录本来就没有部门」而长期留在库里，正是投影回写漏掉的那一类。
     */
    private boolean differs(String snapshot, String fact) {
        String left = snapshot == null ? "" : snapshot.trim();
        String right = fact == null ? "" : fact.trim();
        return !left.equals(right) && (!left.isEmpty() || !right.isEmpty());
    }

    /** 待确认人数最多的、严重度高的类别排前面，界面汇总条不用再排序 */
    private Map<String, Long> sortCounts(Map<String, Long> counts) {
        List<Map.Entry<String, Long>> entries = new ArrayList<>(counts.entrySet());
        entries.sort(Comparator
                .comparingInt((Map.Entry<String, Long> e) ->
                        HrProfileDiff.severityRank(HrProfileDiff.SEVERITIES.get(e.getKey()))).reversed()
                .thenComparing(Map.Entry::getValue, Comparator.reverseOrder()));
        Map<String, Long> sorted = new LinkedHashMap<>();
        entries.forEach(e -> sorted.put(e.getKey(), e.getValue()));
        return sorted;
    }

    /** 扫描对象：可见范围内、非系统服务账号的账号（方案 §7.1「系统服务账号不得自动计为员工」） */
    private List<SysUser> scopedUsers() {
        Set<Long> visible = orgScopeService.resolveVisibleUserIds();
        if (visible != null && visible.isEmpty()) {
            return List.of();
        }
        LambdaQueryWrapper<SysUser> wrapper = new LambdaQueryWrapper<SysUser>()
                .orderByAsc(SysUser::getEmpId);
        if (visible != null) {
            wrapper.in(SysUser::getId, visible);
        }
        return sysUserMapper.selectList(wrapper).stream()
                .filter(u -> !BuiltinAccounts.isSystemAccount(u.getUsername()))
                .toList();
    }
}
