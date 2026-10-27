package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.constant.HrOperationCode;
import com.mftb.admin.entity.EmpPositionRecord;
import com.mftb.admin.mapper.EmpPositionRecordMapper;
import com.mftb.admin.service.HrAssignmentQuery;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 统一 as-of 解析实现。
 * <p>
 * 三条口径（改任何一条都要同步改测试）：
 * <ol>
 *   <li><b>未来不提前生效</b>：只取 {@code effective_date <= 查询日}，未来离职/调动不影响今天的答案；</li>
 *   <li><b>同日多笔按序号</b>：{@code effective_date DESC, effective_seq DESC} 取第一条，
 *       序号只在同一天内有意义；</li>
 *   <li><b>判定看 code 不看中文</b>：{@link HrOperationCode#isResigned} 优先用 operation_code，
 *       仅未回填的 OTHER 行退回名称判定。</li>
 * </ol>
 * 查询时不区「已作废」状态位：仓内没有作废语义（删除即软删，{@code @TableLogic} 自动过滤），
 * 所以「未作废」在这里等于 deleted=0。
 */
@Service
@RequiredArgsConstructor
public class HrAssignmentQueryImpl implements HrAssignmentQuery {

    private final EmpPositionRecordMapper positionRecordMapper;

    @Override
    public Optional<EmpPositionRecord> asOf(Long userId, LocalDate date) {
        if (userId == null) {
            return Optional.empty();
        }
        return effectiveRecords(List.of(userId), date).stream()
                .filter(record -> userId.equals(record.getUserId()))
                .findFirst();
    }

    @Override
    public String employmentStatusOf(Long userId, LocalDate date) {
        return asOf(userId, date)
                .map(record -> HrOperationCode.isResigned(record.getOperationCode(), record.getOperation())
                        ? STATUS_RESIGNED : STATUS_ACTIVE)
                .orElse(STATUS_ACTIVE);
    }

    @Override
    public Map<Long, String> employmentStatusOf(Collection<Long> userIds, LocalDate date) {
        Map<Long, String> result = new HashMap<>();
        if (userIds == null || userIds.isEmpty()) {
            return result;
        }
        // 先去重再建 Map：userIds 来自列表分页，重复 id 会让 toMap 抛 IllegalStateException
        List<Long> distinct = userIds.stream().filter(java.util.Objects::nonNull).distinct().toList();
        Map<Long, List<EmpPositionRecord>> byUser = effectiveRecords(distinct, date).stream()
                .collect(Collectors.groupingBy(EmpPositionRecord::getUserId));
        for (Long userId : distinct) {
            // 无记录按在职：历史补录前的账号不该因为缺记录就被判离职
            String status = byUser.getOrDefault(userId, List.of()).stream().findFirst()
                    .map(record -> HrOperationCode.isResigned(record.getOperationCode(), record.getOperation())
                            ? STATUS_RESIGNED : STATUS_ACTIVE)
                    .orElse(STATUS_ACTIVE);
            result.put(userId, status);
        }
        return result;
    }

    @Override
    public Map<Long, EmpPositionRecord> asOfRecords(Collection<Long> userIds, LocalDate date) {
        Map<Long, EmpPositionRecord> result = new HashMap<>();
        // effectiveRecords 已按「生效日倒序 + 同日序号倒序」，首次遇到的就是该时点生效的那条
        for (EmpPositionRecord record : effectiveRecords(distinct(userIds), date)) {
            result.putIfAbsent(record.getUserId(), record);
        }
        return result;
    }

    @Override
    public Map<Long, List<EmpPositionRecord>> historyOf(Collection<Long> userIds) {
        List<Long> ids = distinct(userIds);
        if (ids.isEmpty()) {
            return Map.of();
        }
        List<EmpPositionRecord> records = positionRecordMapper.selectList(
                new LambdaQueryWrapper<EmpPositionRecord>()
                        .in(EmpPositionRecord::getUserId, ids)
                        .orderByAsc(EmpPositionRecord::getEffectiveDate)
                        .orderByAsc(EmpPositionRecord::getEffectiveSeq));
        return records.stream().collect(Collectors.groupingBy(EmpPositionRecord::getUserId));
    }

    @Override
    public Optional<LocalDate> currentEmploymentStart(Long userId, LocalDate date) {
        if (userId == null) {
            return Optional.empty();
        }
        return effectiveRecords(List.of(userId), date).stream()
                .filter(record -> HrOperationCode.isEmploymentStart(record.getOperationCode(), record.getOperation()))
                // 已按生效日倒序，第一条即「最近一次雇佣起点」
                .map(EmpPositionRecord::getEffectiveDate)
                .filter(java.util.Objects::nonNull)
                .findFirst();
    }

    @Override
    public List<EmpPositionRecord> futureAssignments(Long userId, LocalDate date) {
        if (userId == null) {
            return List.of();
        }
        LocalDate asOf = date == null ? LocalDate.now() : date;
        return positionRecordMapper.selectList(new LambdaQueryWrapper<EmpPositionRecord>()
                .eq(EmpPositionRecord::getUserId, userId)
                .gt(EmpPositionRecord::getEffectiveDate, asOf)
                .orderByAsc(EmpPositionRecord::getEffectiveDate)
                .orderByAsc(EmpPositionRecord::getEffectiveSeq));
    }

    /** 去重并剔除 null：入参常来自列表分页，重复 id 会让 toMap 报错、也会拼出冗余 IN 条件 */
    private List<Long> distinct(Collection<Long> userIds) {
        if (userIds == null) {
            return List.of();
        }
        return userIds.stream().filter(java.util.Objects::nonNull).distinct().toList();
    }

    /** 该批用户在查询日及之前生效的记录，按「生效日倒序 + 同日序号倒序」返回 */
    private List<EmpPositionRecord> effectiveRecords(Collection<Long> userIds, LocalDate date) {
        LocalDate asOf = date == null ? LocalDate.now() : date;
        Set<Long> ids = Set.copyOf(userIds.stream().filter(java.util.Objects::nonNull).collect(Collectors.toSet()));
        if (ids.isEmpty()) {
            return List.of();
        }
        return positionRecordMapper.selectList(new LambdaQueryWrapper<EmpPositionRecord>()
                .in(EmpPositionRecord::getUserId, ids)
                .le(EmpPositionRecord::getEffectiveDate, asOf)
                .orderByDesc(EmpPositionRecord::getEffectiveDate)
                .orderByDesc(EmpPositionRecord::getEffectiveSeq));
    }
}
