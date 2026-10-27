package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.mftb.admin.entity.EmpPositionRecord;
import com.mftb.admin.entity.HrEmploymentPeriod;
import com.mftb.admin.mapper.EmpPositionRecordMapper;
import com.mftb.admin.mapper.HrEmploymentPeriodMapper;
import com.mftb.admin.service.HrEmploymentPeriodService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.stream.Collectors;

/**
 * 雇佣期间实现：派生走纯函数，本类只负责「读事实 → 与已登记行合并 → 落库 → 反向挂稳定 ID」。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class HrEmploymentPeriodServiceImpl implements HrEmploymentPeriodService {

    private final HrEmploymentPeriodMapper periodMapper;
    private final EmpPositionRecordMapper positionRecordMapper;

    @Override
    public List<HrEmploymentPeriod> derive(Long userId, LocalDate asOf) {
        return HrEmploymentPeriodCalculator.derive(listRecords(userId), asOf);
    }

    @Override
    @Transactional
    public int syncFromRecords(Long userId, String operator) {
        List<EmpPositionRecord> records = listRecords(userId);
        List<HrEmploymentPeriod> derived = HrEmploymentPeriodCalculator.derive(records, LocalDate.now());
        if (derived.isEmpty()) {
            // 无入职锚点：宁可不物化。这里若拿 sys_user.created_at 补一个起点，
            // 就把「账号开通日」洗成了「真实入职日」，方案 §7.1 明令禁止的正是这一条。
            return 0;
        }
        Map<Integer, HrEmploymentPeriod> existingBySeq = listByUser(userId).stream()
                .collect(Collectors.toMap(HrEmploymentPeriod::getPeriodSeq, p -> p, (a, b) -> a));

        List<HrEmploymentPeriod> materialized = new ArrayList<>();
        for (HrEmploymentPeriod segment : derived) {
            HrEmploymentPeriod row = existingBySeq.get(segment.getPeriodSeq());
            if (row == null) {
                segment.setCreatedBy(operator);
                segment.setUpdatedBy(operator);
                segment.setDeleted(0);
                periodMapper.insert(segment);
                materialized.add(segment);
            } else {
                merge(row, segment, operator);
                periodMapper.updateById(row);
                materialized.add(row);
            }
        }
        if (existingBySeq.size() > materialized.size()) {
            log.warn("员工 {} 的已登记雇佣期间多于可派生段数（{} > {}），多余行保留不删",
                    userId, existingBySeq.size(), materialized.size());
        }
        linkRecordsToPeriods(userId, materialized);
        return materialized.size();
    }

    @Override
    public List<HrEmploymentPeriod> listByUser(Long userId) {
        if (userId == null) {
            return List.of();
        }
        return periodMapper.selectList(new LambdaQueryWrapper<HrEmploymentPeriod>()
                .eq(HrEmploymentPeriod::getUserId, userId)
                .orderByAsc(HrEmploymentPeriod::getPeriodSeq));
    }

    @Override
    public Optional<HrEmploymentPeriod> currentPeriod(Long userId, LocalDate asOf) {
        return listByUser(userId).stream()
                .filter(p -> p.getStartDate() != null && !p.getStartDate().isAfter(asOf))
                .filter(p -> p.getEndDate() == null || !p.getEndDate().isBefore(asOf))
                .max(Comparator.comparing(HrEmploymentPeriod::getStartDate));
    }

    @Override
    public Map<Long, List<HrEmploymentPeriod>> listByUsers(Collection<Long> userIds) {
        if (userIds == null || userIds.isEmpty()) {
            return Map.of();
        }
        List<Long> ids = userIds.stream().filter(Objects::nonNull).distinct().toList();
        if (ids.isEmpty()) {
            return Map.of();
        }
        Map<Long, List<HrEmploymentPeriod>> result = new HashMap<>();
        for (HrEmploymentPeriod period : periodMapper.selectList(
                new LambdaQueryWrapper<HrEmploymentPeriod>()
                        .in(HrEmploymentPeriod::getUserId, ids)
                        .orderByAsc(HrEmploymentPeriod::getPeriodSeq))) {
            result.computeIfAbsent(period.getUserId(), k -> new ArrayList<>()).add(period);
        }
        return result;
    }

    /** 已有行与派生段合并：派生只补空、不改写人工确认过的入职日 */
    private void merge(HrEmploymentPeriod row, HrEmploymentPeriod derived, String operator) {
        boolean manualStart = HrEmploymentPeriod.SOURCE_MANUAL.equals(row.getStartDateSource());
        if (!manualStart) {
            row.setStartDate(derived.getStartDate());
            row.setStartDateSource(derived.getStartDateSource());
        }
        row.setPeriodSeq(derived.getPeriodSeq());
        // 状态与结束信息以事实为准：离职登记后不可能还留在 ACTIVE
        row.setStatus(derived.getStatus());
        if (derived.getEndDate() != null) {
            row.setEndDate(derived.getEndDate());
        }
        if (derived.getEndReason() != null) {
            row.setEndReason(derived.getEndReason());
        }
        if (derived.getRegularDate() != null) {
            row.setRegularDate(derived.getRegularDate());
        }
        if (derived.getEmployerCompany() != null) {
            row.setEmployerCompany(derived.getEmployerCompany());
        }
        if (derived.getWorkLocation() != null) {
            row.setWorkLocation(derived.getWorkLocation());
        }
        if (derived.getEmployeeCategory() != null) {
            row.setEmployeeCategory(derived.getEmployeeCategory());
        }
        row.setUpdatedBy(operator);
    }

    /**
     * 把任职记录反向挂到所属雇佣期间（{@code emp_position_record.employment_period_id}）。
     * <p>段区间按「本段起点 → 下一段起点前一天」推得：离职日之后的记录仍属本段，
     * 而重新入职之后的记录必须换段，否则两次雇佣的任职会串成一段历史。
     */
    private void linkRecordsToPeriods(Long userId, List<HrEmploymentPeriod> periods) {
        List<HrEmploymentPeriod> ordered = periods.stream()
                .sorted(Comparator.comparing(HrEmploymentPeriod::getPeriodSeq))
                .toList();
        List<EmpPositionRecord> records = listRecords(userId);
        Map<Long, List<Long>> idsByPeriod = new HashMap<>();
        for (EmpPositionRecord record : records) {
            HrEmploymentPeriod owner = ownerOf(record, ordered);
            if (owner != null && !Objects.equals(owner.getId(), record.getEmploymentPeriodId())) {
                idsByPeriod.computeIfAbsent(owner.getId(), k -> new ArrayList<>()).add(record.getId());
            }
        }
        idsByPeriod.forEach((periodId, recordIds) -> positionRecordMapper.update(null,
                new LambdaUpdateWrapper<EmpPositionRecord>()
                        .set(EmpPositionRecord::getEmploymentPeriodId, periodId)
                        // 回填段归属属于“补链接”，不是一次业务修改：不写这一句的话，
                        // 列上的 ON UPDATE CURRENT_TIMESTAMP 会把历史异动记录的 updatedAt 全部刷成本次时间，
                        // 轨迹与列表的「最后更新时间」从此失真（实测缺陷）。
                        .setSql("updated_at = updated_at")
                        .in(EmpPositionRecord::getId, recordIds)));
    }

    private HrEmploymentPeriod ownerOf(EmpPositionRecord record, List<HrEmploymentPeriod> ordered) {
        if (record.getEffectiveDate() == null) {
            return null;
        }
        for (int i = ordered.size() - 1; i >= 0; i--) {
            HrEmploymentPeriod period = ordered.get(i);
            if (period.getStartDate() != null && !record.getEffectiveDate().isBefore(period.getStartDate())) {
                return period;
            }
        }
        return null;
    }

    private List<EmpPositionRecord> listRecords(Long userId) {
        return positionRecordMapper.selectList(new LambdaQueryWrapper<EmpPositionRecord>()
                .eq(EmpPositionRecord::getUserId, userId));
    }
}
