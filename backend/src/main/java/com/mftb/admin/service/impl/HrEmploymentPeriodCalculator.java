package com.mftb.admin.service.impl;

import com.mftb.admin.constant.HrOperationCode;
import com.mftb.admin.entity.EmpPositionRecord;
import com.mftb.admin.entity.HrEmploymentPeriod;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * 雇佣期间派生器：把「逐条异动事件」折叠成「一段一段的雇佣」。
 * <p>
 * 刻意做成无状态纯函数（只吃记录列表 + 查询时点），原因有两条：
 * <ol>
 *   <li>雇佣期间是 emp_position_record 的<b>投影</b>，投影必须可重建（方案 §7.1
 *       「启动补偿与定期对账保证可重建」）。掺进数据库访问就无法在单测里钉住口径。</li>
 *   <li>派生规则里全是边界情况（缺离职记录、缺入职锚点、同日两笔），
 *       有状态的实现会让这些分支难以被断言。</li>
 * </ol>
 * 四条口径：
 * <ul>
 *   <li><b>未来不提前</b>：只用 {@code effectiveDate <= asOf} 的记录（与 {@code HrAssignmentQuery} 同取向），
 *       否则一张下周一生效的离职单会把今天的在职段算成已结束。</li>
 *   <li><b>只在入职/重新入职处切段</b>：没有起点锚点的异动<b>不物化</b>。
 *       绝不拿 {@code sys_user.created_at} 当真实入职日补一个起点（方案 §7.1 的业务门禁），
 *       缺锚点交给差异报告暴露给 HR 确认。</li>
 *   <li><b>段内字段继承</b>：法人/地点/人员类别取段内最后一条「有值」的记录 ——
 *       普通调动只写变化的字段，逐条覆盖会把空值写进雇佣期间（方案 §5.3「调动继承未变化字段」）。</li>
 *   <li><b>缺离职记录时不编造结束日</b>：被后续入职截断的段落 {@code ENDED + endDate IS NULL}，
 *       结束原因记 {@code MISSING_DIMISSION_RECORD}，让「不知道哪天结束」这件事留在数据里。</li>
 * </ul>
 */
final class HrEmploymentPeriodCalculator {

    /** 被后续入职锚点截断、但库里找不到对应离职记录时的结束原因标记 */
    static final String END_REASON_MISSING_DIMISSION = "MISSING_DIMISSION_RECORD";

    private HrEmploymentPeriodCalculator() {
    }

    /**
     * 派生雇佣期间列表（{@code periodSeq} 从 1 连续递增，按时间顺序）。
     *
     * @param records 该员工的全部任职记录（含未来生效的，本方法自行过滤）
     * @param asOf    查询时点
     * @return 派生结果；无起点锚点时返回空列表（不物化任何段）
     */
    static List<HrEmploymentPeriod> derive(List<EmpPositionRecord> records, LocalDate asOf) {
        if (records == null || records.isEmpty() || asOf == null) {
            return List.of();
        }
        // 时间正序遍历：effectiveDate ASC，同日按序号 ASC（同日多笔异动按登记顺序落定）
        List<EmpPositionRecord> timeline = records.stream()
                .filter(r -> r.getEffectiveDate() != null && !r.getEffectiveDate().isAfter(asOf))
                .sorted(Comparator.comparing(EmpPositionRecord::getEffectiveDate)
                        .thenComparing(r -> r.getEffectiveSeq() == null ? 0 : r.getEffectiveSeq()))
                .toList();

        List<HrEmploymentPeriod> periods = new ArrayList<>();
        HrEmploymentPeriod open = null;

        for (EmpPositionRecord record : timeline) {
            if (HrOperationCode.isEmploymentStart(record.getOperationCode(), record.getOperation())) {
                if (open != null && open.getEndDate() == null) {
                    // 上一段还没等到离职记录就来了新的入职：截断但不编造结束日
                    open.setStatus(HrEmploymentPeriod.STATUS_ENDED);
                    open.setEndReason(END_REASON_MISSING_DIMISSION);
                }
                open = newSegment(record, periods.size() + 1);
                periods.add(open);
                applySnapshot(open, record);
                continue;
            }
            if (open == null) {
                // 段外的历史异动（建库前补录、入职记录缺失）：不物化，交给差异报告
                continue;
            }
            if (HrOperationCode.isResigned(record.getOperationCode(), record.getOperation())) {
                open.setStatus(HrEmploymentPeriod.STATUS_ENDED);
                open.setEndDate(record.getEffectiveDate());
                open.setEndReason(record.getReason());
                // 本段已由离职记录正常闭合：置空开段指针，否则下一张入职/返聘锚点会把它当成
                // 「没等到离职记录」，用 MISSING_DIMISSION_RECORD 覆掉真实离职原因（实测缺陷）。
                open = null;
                continue;
            }
            if (HrOperationCode.REGULAR.equals(HrOperationCode.resolve(
                    firstNonBlank(record.getOperationCode(), record.getOperation())))) {
                open.setRegularDate(record.getEffectiveDate());
            }
            applySnapshot(open, record);
        }
        return periods;
    }

    private static HrEmploymentPeriod newSegment(EmpPositionRecord anchor, int seq) {
        HrEmploymentPeriod period = new HrEmploymentPeriod();
        period.setUserId(anchor.getUserId());
        period.setPeriodSeq(seq);
        period.setStartDate(anchor.getEffectiveDate());
        // 起点来自任职事实：可追溯，也意味着它只随记录变化而变化
        period.setStartDateSource(HrEmploymentPeriod.SOURCE_POSITION_RECORD);
        period.setStatus(HrEmploymentPeriod.STATUS_ACTIVE);
        return period;
    }

    /** 段内继承：只在来源记录给了值时才覆盖，空值不抹掉已经确定的法人/地点/类别 */
    private static void applySnapshot(HrEmploymentPeriod period, EmpPositionRecord record) {
        if (hasText(record.getCompany())) {
            period.setEmployerCompany(record.getCompany());
        }
        if (hasText(record.getWorkCity())) {
            // 工作地点一期取「工作城市」：officeAddress 是办公地址明细，不是地点主数据维度
            period.setWorkLocation(record.getWorkCity());
        }
        if (hasText(record.getEmployeeCategory())) {
            period.setEmployeeCategory(record.getEmployeeCategory());
        }
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

    private static String firstNonBlank(String a, String b) {
        return hasText(a) ? a : b;
    }
}
