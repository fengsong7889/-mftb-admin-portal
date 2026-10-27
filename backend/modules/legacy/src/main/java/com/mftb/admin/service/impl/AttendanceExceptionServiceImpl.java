package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.toolkit.support.SFunction;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.util.SortSupport;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.HrLeaveConstants;
import com.mftb.admin.dto.AttendanceExceptionVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.AttException;
import com.mftb.admin.entity.AttPunchLog;
import com.mftb.admin.mapper.AttExceptionMapper;
import com.mftb.admin.contracts.hr.HrLeaveQueryPort;
import com.mftb.admin.service.AttendanceExceptionService;
import com.mftb.admin.service.AttendancePunchService;
import com.mftb.admin.service.AttendanceSummaryService;
import com.mftb.admin.service.OrgScopeService;
import com.mftb.admin.util.OperatorResolver;
import com.mftb.admin.util.ScopeFilters;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * 考勤异常服务实现。
 * <p>
 * 四条硬口径：
 * ① 异常行由日汇总计算引擎生成，本服务只改「处理状态」，绝不改判定明细——
 *    明细一旦可改，日报与薪酬取数就失去唯一真值；
 * ② 只有 {@code 待處理} 能被推进，任何二次关闭都直接跳过并回报条数，
 *    避免 OA 回调重放与管理员重复点击把「已補卡」覆盖成「已請假抵扣」；
 * ③ 已凍結月份一律拒绝回溯（补卡、抵扣都拒绝），否则薪酬已引用的数字会与页面不一致；
 * ④ 补录的打卡来源码单独记 {@code SOURCE_REISSUE}，事后能区分"真打的卡"与"人工补的卡"。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AttendanceExceptionServiceImpl implements AttendanceExceptionService {

    /** 请假只抵扣缺勤类异常；迟到早退是分钟级偏差，不能靠请一天假抹掉 */
    private static final Set<Integer> LEAVE_DEDUCTIBLE_TYPES =
            Set.of(AttException.TYPE_MISSING_CARD, AttException.TYPE_ABSENT);

    /** markHandledByFlow 允许写入的目标状态：不含待處理，防止回调把已处理行退回 */
    private static final Set<Integer> FLOW_TARGET_STATUS = Set.of(
            AttException.STATUS_HANDLED, AttException.STATUS_LEAVE, AttException.STATUS_OVERTIME);

    /** 请假抵扣的操作人署名：不是某个管理员点的，界面必须能看出是系统自动关闭 */
    private static final String HANDLER_LEAVE_DEDUCT = "系統（請假審批抵扣）";

    /** 处理说明上限，与 {@code att_exception.handle_remark VARCHAR(200)} 一致 */
    private static final int MAX_REMARK_LENGTH = 200;

    /** 异常可服务端排序的列白名单（列key → getter） */
    private static final Map<String, SFunction<AttException, ?>> EXCEPTION_SORT_ALLOW = Map.of(
            "workDate", AttException::getWorkDate,
            "updatedAt", AttException::getUpdatedAt);

    private final AttExceptionMapper exceptionMapper;
    private final HrLeaveQueryPort leaveQueryPort;
    private final AttendancePunchService punchService;
    private final AttendanceSummaryService summaryService;
    private final OperatorResolver operatorResolver;
    private final OrgScopeService orgScopeService;

    @Override
    public PageResult<AttendanceExceptionVO> page(long page, long size, LocalDate from, LocalDate to, Long groupId,
                                                  Long deptId, Integer exceptionType, Integer status,
                                                  String sortField, String sortOrder) {
        LambdaQueryWrapper<AttException> wrapper = filter(from, to, groupId, deptId, exceptionType, status);
        // 白名单排序优先，再补 workDate 降序 + id 升序作稳定次级序（同原默认）
        SortSupport.apply(wrapper, sortField, sortOrder, EXCEPTION_SORT_ALLOW);
        wrapper.orderByDesc(AttException::getWorkDate).orderByAsc(AttException::getId);
        Page<AttException> rows = exceptionMapper.selectPage(
                new Page<>(PageResult.normalizePage(page), PageResult.normalizeSize(size)), wrapper);
        List<AttendanceExceptionVO> vos = rows.getRecords().stream().map(AttendanceExceptionVO::of).toList();
        return new PageResult<>(vos, rows.getTotal());
    }

    @Override
    public Map<String, Object> stats(LocalDate from, LocalDate to, Long groupId, Long deptId,
                                     Integer exceptionType, Integer status) {
        // 与列表共用同一个条件构造器：统计卡口径必须跟随筛选，禁止单独发无条件请求
        List<AttException> rows = exceptionMapper.selectList(
                filter(from, to, groupId, deptId, exceptionType, status)
                        .select(AttException::getExceptionType, AttException::getStatus));
        long pending = 0;
        long reissued = 0;
        long leave = 0;
        long overtime = 0;
        long confirmed = 0;
        long late = 0;
        long missing = 0;
        long absent = 0;
        for (AttException row : rows) {
            Integer code = row.getStatus();
            if (code == null || code == AttException.STATUS_PENDING) {
                pending++;
            } else if (code == AttException.STATUS_HANDLED) {
                reissued++;
            } else if (code == AttException.STATUS_LEAVE) {
                leave++;
            } else if (code == AttException.STATUS_OVERTIME) {
                overtime++;
            } else if (code == AttException.STATUS_CONFIRMED) {
                confirmed++;
            }
            Integer type = row.getExceptionType();
            if (type == null) {
                continue;
            }
            if (type == AttException.TYPE_LATE) {
                late++;
            } else if (type == AttException.TYPE_MISSING_CARD) {
                missing++;
            } else if (type == AttException.TYPE_ABSENT) {
                absent++;
            }
        }
        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("total", rows.size());
        stats.put("pending", pending);
        stats.put("reissued", reissued);
        stats.put("leave", leave);
        stats.put("overtime", overtime);
        stats.put("confirmed", confirmed);
        stats.put("late", late);
        stats.put("missing", missing);
        stats.put("absent", absent);
        return stats;
    }

    @Override
    public AttendanceExceptionVO detail(Long id) {
        return AttendanceExceptionVO.of(requireException(id));
    }

    @Override
    @Transactional
    public AttendanceExceptionVO deductByLeaveRequest(Long exceptionId, Long leaveId) {
        AttException row = requireException(exceptionId);
        if (row.getStatus() != null && row.getStatus() != AttException.STATUS_PENDING) {
            throw new BusinessException("該異常已處理，不能重複抵扣");
        }
        if (!LEAVE_DEDUCTIBLE_TYPES.contains(row.getExceptionType())) {
            // 迟到早退是分钟级偏差，请一天假并不等于当天没迟到；在这里放开会让薪酬的迟到扣减凭空消失
            throw new BusinessException("只有缺卡與曠工可以用假單抵扣，遲到/早退請走確認或補卡");
        }
        requireMonthEditable(row.getWorkDate());
        HrLeaveQueryPort.LeaveView leave = requireApprovedLeave(leaveId, row);

        String operator = operatorResolver.currentOperatorName();
        row.setStatus(AttException.STATUS_LEAVE);
        row.setFlowNo(leave.flowNo());
        row.setHandler(operator);
        row.setHandledAt(LocalDateTime.now());
        row.setHandleRemark("關聯假單 " + leave.reqNo() + "（" + leave.startDate() + " ~ " + leave.endDate() + "）");
        row.setUpdatedBy(operator);
        exceptionMapper.updateById(row);

        // 抵扣后当日结论必须重算，否则日报仍算旷工而异常页已显示已请假
        summaryService.recalculateDaily(row.getWorkDate(), row.getWorkDate(), row.getGroupId());
        log.info("考勤異常已關聯假單抵扣: 異常ID={}, 假單={}, 員工={}, 日期={}, 操作人={}",
                exceptionId, leave.reqNo(), row.getEmpNo(), row.getWorkDate(), operator);
        return AttendanceExceptionVO.of(requireException(exceptionId));
    }

    /**
     * 假单必须同时满足：存在、已核准/已完成、属于同一人、区间覆盖该考勤日。
     * <p>四条缺一不可：少了「同一人」就能用别人的假单抹自己的旷工，
     * 少了「区间覆盖」就能用上个月的假单抵扣今天的缺卡。
     */
    private HrLeaveQueryPort.LeaveView requireApprovedLeave(Long leaveId, AttException row) {
        if (leaveId == null) {
            throw new BusinessException("請選擇要關聯的假單");
        }
        HrLeaveQueryPort.LeaveView leave = leaveQueryPort.findById(leaveId).orElse(null);
        if (leave == null) {
            throw new BusinessException("假單不存在或已刪除");
        }
        if (!HrLeaveConstants.STATUS_APPROVED.equals(leave.status())
                && !HrLeaveConstants.STATUS_COMPLETED.equals(leave.status())) {
            throw new BusinessException("只有已核准的假單才能抵扣，當前狀態：" + leave.status());
        }
        if (!Objects.equals(leave.userId(), row.getUserId())) {
            throw new BusinessException("假單當事人與異常當事人不一致，不得交叉抵扣");
        }
        if (leave.startDate() == null || leave.endDate() == null
                || row.getWorkDate().isBefore(leave.startDate())
                || row.getWorkDate().isAfter(leave.endDate())) {
            throw new BusinessException("假單區間 " + leave.startDate() + " ~ " + leave.endDate()
                    + " 未覆蓋考勤日 " + row.getWorkDate());
        }
        return leave;
    }

    @Override
    public List<Map<String, Object>> leaveCandidates(Long exceptionId) {
        AttException row = requireException(exceptionId);
        if (row.getUserId() == null || row.getWorkDate() == null) {
            return List.of();
        }
        // 条件与 requireApprovedLeave 的校验一致：候选列表里不该出现选了也会被拒的单据
        return leaveQueryPort.listEffectiveForUser(row.getUserId(), row.getWorkDate(),
                        List.of(HrLeaveConstants.STATUS_APPROVED, HrLeaveConstants.STATUS_COMPLETED))
                .stream().map(leave -> {
                    Map<String, Object> item = new LinkedHashMap<>();
                    item.put("id", leave.id());
                    item.put("reqNo", leave.reqNo());
                    item.put("leaveType", leave.leaveType());
                    item.put("startDate", leave.startDate() == null ? null : leave.startDate().toString());
                    item.put("endDate", leave.endDate() == null ? null : leave.endDate().toString());
                    item.put("days", leave.days());
                    item.put("flowNo", leave.flowNo());
                    return item;
                }).toList();
    }

    @Override
    @Transactional
    public Map<String, Object> confirm(List<Long> ids, String remark) {
        List<AttException> targets = requirePending(ids);
        String operator = operatorResolver.currentOperatorName();
        LocalDateTime now = LocalDateTime.now();
        for (AttException row : targets) {
            row.setStatus(AttException.STATUS_CONFIRMED);
            // 确认=认可这条异常真实存在且不抵扣，处理说明是唯一的解释凭据，必须落库
            row.setHandleRemark(remarkText(remark));
            row.setHandler(operator);
            row.setHandledAt(now);
            row.setUpdatedBy(operator);
            exceptionMapper.updateById(row);
        }
        log.info("考勤異常確認: 提交={} 條, 生效={} 條, 操作人={}", size(ids), targets.size(), operator);
        return result(ids, targets.size());
    }

    @Override
    @Transactional
    public AttendanceExceptionVO reissue(Long id, LocalDateTime onTime, LocalDateTime offTime, String reason) {
        AttException row = requireException(id);
        if (row.getStatus() != null && row.getStatus() != AttException.STATUS_PENDING) {
            throw new BusinessException("該異常已處理，不能重複補卡");
        }
        if (!StringUtils.hasText(reason)) {
            throw new BusinessException("補卡原因必填：這是補錄打卡唯一的合規依據");
        }
        LocalDate workDate = row.getWorkDate();
        requireMonthEditable(workDate);
        validatePunchTime(onTime, offTime, workDate);

        // 补录的卡走 saveGenerated：work_date 归属与幂等键只有一处实现，这里不自拼
        String operator = operatorResolver.currentOperatorName();
        List<AttPunchLog> logs = new ArrayList<>();
        logs.add(reissueLog(row, onTime, AttPunchLog.TYPE_ON, operator));
        if (offTime != null) {
            logs.add(reissueLog(row, offTime, AttPunchLog.TYPE_OFF, operator));
        }
        int inserted = punchService.saveGenerated(logs);
        if (inserted == 0) {
            throw new BusinessException("補卡時間與既有打卡重複，未產生新紀錄");
        }

        row.setStatus(AttException.STATUS_HANDLED);
        row.setHandleRemark(remarkText(reason));
        row.setHandler(operator);
        row.setHandledAt(LocalDateTime.now());
        row.setUpdatedBy(operator);
        exceptionMapper.updateById(row);

        // 补卡后当日结论必须重算，否则日报还挂着「缺卡」而打卡记录已经补齐
        summaryService.recalculateDaily(workDate, workDate, row.getGroupId());
        log.info("考勤補卡完成: 異常ID={}, 員工={}, 日期={}, 補錄={} 張, 操作人={}",
                id, row.getEmpNo(), workDate, inserted, operator);
        // 重算可能刷新了明细，回读一次再转视图，避免返回重算前的旧值
        return AttendanceExceptionVO.of(exceptionMapper.selectById(id));
    }

    @Override
    @Transactional
    public int markHandledByFlow(String flowNo, int status) {
        if (!StringUtils.hasText(flowNo)) {
            throw new BusinessException("流程編號必填");
        }
        if (!FLOW_TARGET_STATUS.contains(status)) {
            throw new BusinessException("非法的目標處理狀態");
        }
        List<AttException> rows = exceptionMapper.selectList(new LambdaQueryWrapper<AttException>()
                .eq(AttException::getFlowNo, flowNo)
                .eq(AttException::getStatus, AttException.STATUS_PENDING));
        if (rows.isEmpty()) {
            return 0;
        }
        String operator = operatorResolver.currentOperatorName();
        LocalDateTime now = LocalDateTime.now();
        for (AttException row : rows) {
            row.setStatus(status);
            row.setHandler(operator);
            row.setHandledAt(now);
            row.setUpdatedBy(operator);
            exceptionMapper.updateById(row);
        }
        log.info("考勤異常按流程回寫: flowNo={}, 狀態={}, 條數={}", flowNo, status, rows.size());
        return rows.size();
    }

    @Override
    @Transactional
    public int deductByLeave(Long userId, LocalDate from, LocalDate to, String flowNo) {
        if (userId == null || from == null || to == null || from.isAfter(to)) {
            return 0;
        }
        List<AttException> rows = exceptionMapper.selectList(new LambdaQueryWrapper<AttException>()
                .eq(AttException::getUserId, userId)
                .ge(AttException::getWorkDate, from)
                .le(AttException::getWorkDate, to)
                .eq(AttException::getStatus, AttException.STATUS_PENDING)
                .in(AttException::getExceptionType, LEAVE_DEDUCTIBLE_TYPES));
        if (rows.isEmpty()) {
            return 0;
        }
        Set<String> frozenMonths = frozenMonthsOf(rows);
        LocalDateTime now = LocalDateTime.now();
        int deducted = 0;
        for (AttException row : rows) {
            /*
             * 查询条件已经过滤了类型与状态，这里再判一次不是冗余：抵扣范围直接决定薪酬扣不扣钱，
             * 将来有人改条件构造器（或改成复用别的 filter）时，内存判定是最后一道闸门。
             */
            if (!LEAVE_DEDUCTIBLE_TYPES.contains(row.getExceptionType())) {
                continue;
            }
            if (row.getStatus() != null && row.getStatus() != AttException.STATUS_PENDING) {
                continue;
            }
            // 已凍結月份的異常不再回寫：那份数据已经交给薪酬，改了就是两套数字
            if (frozenMonths.contains(YearMonth.from(row.getWorkDate()).toString())) {
                log.warn("請假抵扣跳過已凍結月份: 異常ID={}, 日期={}, flowNo={}",
                        row.getId(), row.getWorkDate(), flowNo);
                continue;
            }
            row.setStatus(AttException.STATUS_LEAVE);
            row.setFlowNo(flowNo);
            row.setHandler(HANDLER_LEAVE_DEDUCT);
            row.setHandledAt(now);
            row.setUpdatedBy(HANDLER_LEAVE_DEDUCT);
            exceptionMapper.updateById(row);
            deducted++;
        }
        if (deducted > 0) {
            log.info("請假審批抵扣考勤異常: 員工ID={}, 區間={}~{}, flowNo={}, 抵扣={} 條",
                    userId, from, to, flowNo, deducted);
        }
        return deducted;
    }

    @Override
    public long pendingCount(LocalDate from, LocalDate to) {
        LambdaQueryWrapper<AttException> wrapper = new LambdaQueryWrapper<AttException>()
                .eq(AttException::getStatus, AttException.STATUS_PENDING)
                .ge(from != null, AttException::getWorkDate, from)
                .le(to != null, AttException::getWorkDate, to);
        // 待办计数也是人员维数据：不收敛的话，受限角色能从工作台卡片读出全公司待处理量
        ScopeFilters.applyUsers(wrapper, AttException::getUserId, orgScopeService.resolveVisibleUserIds());
        Long count = exceptionMapper.selectCount(wrapper);
        return count == null ? 0L : count;
    }

    /* ==================== 内部方法 ==================== */

    /**
     * 列表与统计共用的条件构造器。
     * <p>keyword 不参与：异常行的可检索字段（工号/姓名/部门/考勤组）都是生成时写入的快照，
     * 由前端在当前页内过滤即可，服务端模糊匹配会逼出全表扫描。
     */
    private LambdaQueryWrapper<AttException> filter(LocalDate from, LocalDate to, Long groupId, Long deptId,
                                                    Integer exceptionType, Integer status) {
        LambdaQueryWrapper<AttException> wrapper = new LambdaQueryWrapper<>();
        wrapper.ge(from != null, AttException::getWorkDate, from)
                .le(to != null, AttException::getWorkDate, to)
                .eq(groupId != null, AttException::getGroupId, groupId)
                .eq(deptId != null, AttException::getDeptId, deptId)
                .eq(exceptionType != null, AttException::getExceptionType, exceptionType)
                .eq(status != null, AttException::getStatus, status);
        // 组织人员数据范围：与 stats() 同一个构造器，统计卡不会越过列表
        ScopeFilters.applyUsers(wrapper, AttException::getUserId, orgScopeService.resolveVisibleUserIds());
        return wrapper;
    }

    private AttException requireException(Long id) {
        if (id == null) {
            throw new BusinessException("異常ID必填");
        }
        AttException row = exceptionMapper.selectById(id);
        if (row == null) {
            throw new BusinessException("考勤異常不存在或已刪除");
        }
        // 按 id 的单条读写必须二次校验归属：只过滤列表的话，改一下 URL 里的 id 就绕过去了
        orgScopeService.requireVisibleUser(row.getUserId());
        return row;
    }

    /**
     * 批量确认只挑「待處理」的行：前端全选时很容易带上已处理行，
     * 整批报错会让管理员一条都确认不了，静默全过又会覆盖审批结论，因此过滤后回报差额。
     */
    private List<AttException> requirePending(List<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            throw new BusinessException("請至少選擇一條異常");
        }
        List<AttException> rows = exceptionMapper.selectBatchIds(ids);
        // 越权不能像「已处理行」那样静默过滤：批量确认是全量选中产生的，
        // 默默少确认几条会让管理员误以为别人也被确认了，因此整批拒绝。
        rows.forEach(row -> orgScopeService.requireVisibleUser(row.getUserId()));
        List<AttException> pending = rows.stream()
                .filter(row -> row.getStatus() == null || row.getStatus() == AttException.STATUS_PENDING)
                .toList();
        if (pending.isEmpty()) {
            throw new BusinessException("所選異常均已處理，無需重複確認");
        }
        return pending;
    }

    private AttPunchLog reissueLog(AttException row, LocalDateTime punchAt, int punchType, String operator) {
        AttPunchLog punch = new AttPunchLog();
        punch.setUserId(row.getUserId());
        punch.setEmpNo(row.getEmpNo());
        punch.setEmpName(row.getEmpName());
        punch.setGroupId(row.getGroupId());
        punch.setPunchAt(punchAt);
        punch.setPunchType(punchType);
        punch.setSource(AttPunchLog.SOURCE_REISSUE);
        punch.setLocation("人工補錄");
        // rawRef 存上游原始标识：补录没有上游，改存异常ID，保证每张卡都能追溯到是哪条异常补的
        punch.setRawRef("exception:" + row.getId());
        // 判定结果先给正常，随后由重算按班次与宽限重新判定（可能仍是迟到，那是真实结论）；
        // 补卡原因不落在打卡流水上——流水是只读账本，原因由异常行的处理说明承载
        punch.setResult(AttPunchLog.RESULT_NORMAL);
        punch.setCreatedBy(operator);
        punch.setUpdatedBy(operator);
        return punch;
    }

    /**
     * 补卡时间必须落在异常当日内（跨天夜班允许下班卡到次日凌晨）。
     * <p>不校验就会有人把卡补到上个月，绕过冻结检查改写已交薪酬的数据。
     */
    private void validatePunchTime(LocalDateTime onTime, LocalDateTime offTime, LocalDate workDate) {
        if (onTime == null) {
            throw new BusinessException("補上班打卡時間必填");
        }
        if (!onTime.toLocalDate().equals(workDate)) {
            throw new BusinessException("補卡時間必須落在考勤日期 " + workDate + " 當天");
        }
        if (offTime != null) {
            LocalDate offDate = offTime.toLocalDate();
            if (!offDate.equals(workDate) && !offDate.equals(workDate.plusDays(1))) {
                throw new BusinessException("下班卡只能是考勤日期當天或次日凌晨（跨天夜班）");
            }
            if (!offTime.isAfter(onTime)) {
                throw new BusinessException("下班卡必須晚於上班卡");
            }
        }
    }

    /** 冻结月份拒绝回溯：薪酬已按这份数据算过工资，补卡会造成两套数字 */
    private void requireMonthEditable(LocalDate workDate) {
        String month = YearMonth.from(workDate).toString();
        if (summaryService.isMonthFrozen(month)) {
            throw new BusinessException("月份 " + month + " 已凍結，不能回溯補卡；如需更正請走 HR 數據更正流程");
        }
    }

    private Set<String> frozenMonthsOf(List<AttException> rows) {
        Set<String> months = new java.util.LinkedHashSet<>();
        for (AttException row : rows) {
            if (row.getWorkDate() != null) {
                months.add(YearMonth.from(row.getWorkDate()).toString());
            }
        }
        Set<String> frozen = new java.util.HashSet<>();
        for (String month : months) {
            if (summaryService.isMonthFrozen(month)) {
                frozen.add(month);
            }
        }
        return frozen;
    }

    /**
     * 处理说明按列宽校验：超长直接拒绝而不是静默截断。
     * <p>截断会让审计凭据缺尾，而缺尾的说明比没有说明更难发现——事后没人知道它被截过。
     * <p>写入独立列而不追加到 {@code detail}：detail 是引擎写的判定明细，
     * 两者混在一列会互相覆盖，也说不清哪一段是算出来的、哪一段是人写的。
     */
    private String remarkText(String remark) {
        if (!StringUtils.hasText(remark)) {
            return null;
        }
        String text = remark.trim();
        if (text.length() > MAX_REMARK_LENGTH) {
            throw new BusinessException("處理說明不得超過 " + MAX_REMARK_LENGTH + " 字，請精簡後再提交");
        }
        return text;
    }

    private Map<String, Object> result(List<Long> ids, int affected) {
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("submitted", size(ids));
        summary.put("affected", affected);
        summary.put("skipped", size(ids) - affected);
        return summary;
    }

    private static int size(List<Long> ids) {
        return ids == null ? 0 : ids.size();
    }
}
