package com.mftb.admin.service;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.RdmConfigVO;
import com.mftb.admin.dto.RdmDashboardVO;
import com.mftb.admin.dto.RdmQualityVO;
import com.mftb.admin.dto.RdmVersionTraceVO;
import com.mftb.admin.dto.RdmWeeklyReportVO;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * RDM 需求看板统计（PMO / 公司视角）。
 * <p>所有周期类指标只从 {@code rdm_status_log} 取数（进入/离开状态的真实留痕），
 * 不用「当前状态 + 更新时间」倒推，避免历史返工被抹平。
 * <p>口径写死在 SQL 里并集中在此类，方便后续与绩效对齐时逐条复核：
 * <ul>
 *   <li>响应时长：提交 → 产品经理受理（accept_time - submit_time）</li>
 *   <li>交付周期：受理 → 实际上线（actual_release_date - accept_time）</li>
 *   <li>按时率：已上线需求中 {@code actual_release_date <= plan_release_date} 的占比</li>
 *   <li>驳回率：发生过任一驳回动作（reject_count &gt; 0）的需求占比</li>
 * </ul>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RdmAnalyticsService {

    /** 交付终态（计入已交付） */
    private static final String DELIVERED_STATUS_SQL = "('released','verified','closed')";
    /** 交付链路状态（在途，用于 PM 负载） */
    private static final String IN_FLIGHT_STATUS_SQL = "('pool','assigned','evaluating','accepted','prd_designing',"
            + "'reviewing','review_passed','scheduled','designing','developing','integration','testing',"
            + "'test_passed','uat_pending','uat_rejected')";

    private final JdbcTemplate jdbcTemplate;
    private final RdmConfigService configService;

    /**
     * 汇总看板数据。
     *
     * @param period week/month/quarter/year，控制「本期提交/交付」与趋势窗口
     */
    public RdmDashboardVO overview(String period) {
        String periodDays = periodDays(period);
        RdmDashboardVO vo = new RdmDashboardVO();
        vo.setOverview(buildOverview(periodDays));
        vo.setTypeDist(buildTypeDist());
        vo.setDeptRank(buildDeptRank(periodDays));
        vo.setPmRank(buildPmRank());
        vo.setStageDuration(buildStageDuration());
        vo.setTrend(buildTrend(period));
        // 风险统一由 riskList 提供：「風險中心」页明细与 AI 风险摘要共用这一份 SQL（0 = 不按停留天数筛选）
        vo.setRisks(riskList(20, 0));
        vo.setBoard(buildBoard());
        return vo;
    }

    /* ==================== M3：质量口径 / 版本追溯 / 周报 ==================== */

    /**
     * 质量口径汇总。
     * <p>一次通过率的分母是「被验收过的需求」（有验收记录），分子是其中从未被验收退回的需求；
     * 这样“有条件通过”也算一次通过（它没让研发返工），但遗留问题会被 followUpTotal 单独暴露。
     */
    public RdmQualityVO quality() {
        RdmQualityVO vo = new RdmQualityVO();
        vo.setSummary(buildQualitySummary());
        vo.setScoreDist(buildScoreDist());
        vo.setDefectBySeverity(buildDefectBySeverity());
        vo.setReworkRank(buildReworkRank());
        vo.setDeptQuality(buildDeptQuality());
        return vo;
    }

    /**
     * 版本 → 需求。
     * <p>版本基本信息从 sys_version_history 取（发布日期以发布记录为准，而不是需求上的实际上线日），
     * 没发布记录也能追溯（只少了版本元信息，不编数据）。
     */
    public RdmVersionTraceVO versionTraceByVersion(String versionNo) {
        RdmVersionTraceVO vo = new RdmVersionTraceVO();
        if (!StringUtils.hasText(versionNo)) {
            return vo;
        }
        String trimmed = versionNo.trim();
        vo.setVersionNo(trimmed);
        jdbcTemplate.queryForList(
                        "SELECT version_no, release_date, release_type, summary, commit_hash "
                                + "FROM sys_version_history WHERE version_no = ? ORDER BY release_date DESC, id DESC LIMIT 1",
                        trimmed)
                .stream().findFirst()
                .ifPresent(row -> {
                    vo.setReleaseDate(String.valueOf(row.get("release_date")));
                    vo.setReleaseType((String) row.get("release_type"));
                    vo.setSummary((String) row.get("summary"));
                    vo.setCommitHash((String) row.get("commit_hash"));
                });
        fillTraceItems(vo, "version_no = ?", trimmed);
        return vo;
    }

    /**
     * 需求 → 版本。未关联版本时返回空列表（前端必须如实展示“还没上车”），
     * 不能为了“有东西看”而倒推一个版本。访问控制沿用看板菜单，此处不重复校权。
     */
    public RdmVersionTraceVO versionTraceByRequirement(Long reqId) {
        RdmVersionTraceVO vo = new RdmVersionTraceVO();
        if (reqId == null) {
            return vo;
        }
        String versionNo = jdbcTemplate.queryForList(
                        "SELECT version_no FROM rdm_requirement WHERE id = ? AND deleted = 0", reqId)
                .stream().findFirst().map(r -> (String) r.get("version_no")).orElse(null);
        if (!StringUtils.hasText(versionNo)) {
            log.info("需求尚无关联上线版本，追溯返回空: reqId={}", reqId);
            return vo;
        }
        return versionTraceByVersion(versionNo);
    }

    /**
     * 交付周报。区间缺省为“近 7 天”（含今日），迭代可选叠加过滤。
     * <p>日期参数全部走占位符绑定，且先做格式与顺序校验，避免拼 SQL 注入与“起止反了”的脏结果。
     */
    public RdmWeeklyReportVO weeklyReport(String startDate, String endDate, String iterationCode) {
        LocalDate end = parseDate(endDate, LocalDate.now());
        LocalDate start = parseDate(startDate, end.minusDays(6));
        if (start.isAfter(end)) {
            throw new BusinessException("統計區間開始日期不能晚於結束日期");
        }
        LocalDate exclusiveEnd = end.plusDays(1);
        boolean byIteration = StringUtils.hasText(iterationCode);

        RdmWeeklyReportVO vo = new RdmWeeklyReportVO();
        RdmWeeklyReportVO.Range range = vo.getRange();
        range.setStartDate(start.toString());
        range.setEndDate(end.toString());
        range.setLabel(start.format(DAY_LABEL) + " ~ " + end.format(DAY_LABEL));
        vo.setSummary(buildWeeklySummary(start, exclusiveEnd, byIteration, iterationCode));
        vo.setByDept(buildWeeklyDeptRows(start, exclusiveEnd, byIteration, iterationCode));
        vo.setByPm(buildWeeklyPmRows(byIteration, iterationCode));
        vo.setReleased(buildWeeklyReleased(start, exclusiveEnd, byIteration, iterationCode));
        vo.setRisks(buildWeeklyRisks(byIteration, iterationCode));
        vo.setNextWeek(buildWeeklyNext(end, exclusiveEnd, byIteration, iterationCode));
        return vo;
    }

    /* ==================== M3 明细装配 ==================== */

    private RdmQualityVO.Summary buildQualitySummary() {
        RdmQualityVO.Summary s = new RdmQualityVO.Summary();
        Map<String, Object> row = jdbcTemplate.queryForList(
                        "SELECT COUNT(*) AS accepted_total, COALESCE(SUM(CASE WHEN fail_cnt = 0 THEN 1 ELSE 0 END), 0) AS first_pass "
                                + "FROM (SELECT req_id, SUM(CASE WHEN result = 'fail' THEN 1 ELSE 0 END) AS fail_cnt "
                                + "      FROM rdm_acceptance WHERE deleted = 0 GROUP BY req_id) t")
                .stream().findFirst().orElse(Map.of());
        long acceptedTotal = toLong(row.get("accepted_total"));
        long firstPass = toLong(row.get("first_pass"));
        s.setAcceptedTotal((int) acceptedTotal);
        s.setFirstPassRate(acceptedTotal == 0 ? 0 : round(firstPass / (double) acceptedTotal));

        s.setAvgScore(round(orZero(toDouble(jdbcTemplate.queryForObject(
                "SELECT AVG(score) FROM rdm_acceptance WHERE deleted = 0 AND score IS NOT NULL", Double.class)))));
        s.setReworkTotal((int) count("SELECT COALESCE(SUM(rework_count), 0) FROM rdm_requirement WHERE deleted = 0"));
        s.setDefectTotal((int) count("SELECT COUNT(*) FROM rdm_acceptance_case WHERE deleted = 0 AND result <> 'pass'"));
        s.setMajorDefectCount((int) count("SELECT COUNT(*) FROM rdm_acceptance_case "
                + "WHERE deleted = 0 AND result <> 'pass' AND severity IN ('critical','major')"));
        s.setFollowUpTotal((int) count("SELECT COUNT(*) FROM rdm_requirement WHERE deleted = 0 AND parent_req_id IS NOT NULL"));
        s.setConditionalTotal((int) count("SELECT COUNT(*) FROM rdm_acceptance WHERE deleted = 0 AND result = 'conditional'"));
        return s;
    }

    private List<RdmQualityVO.NameValue> buildScoreDist() {
        List<RdmQualityVO.NameValue> list = new ArrayList<>();
        for (Map<String, Object> row : jdbcTemplate.queryForList(
                "SELECT score, COUNT(*) AS cnt FROM rdm_acceptance WHERE deleted = 0 AND score IS NOT NULL "
                        + "GROUP BY score ORDER BY score")) {
            list.add(new RdmQualityVO.NameValue(toLong(row.get("score")) + " 分", toLong(row.get("cnt"))));
        }
        return list;
    }

    /** 缺陷严重度分布（名称直接给中文标签，避免前端再维护一份映射） */
    private List<RdmQualityVO.NameValue> buildDefectBySeverity() {
        Map<String, String> labels = Map.of(
                "critical", "致命", "major", "嚴重", "minor", "一般", "trivial", "輕微");
        List<RdmQualityVO.NameValue> list = new ArrayList<>();
        for (Map<String, Object> row : jdbcTemplate.queryForList(
                "SELECT severity, COUNT(*) AS cnt FROM rdm_acceptance_case "
                        + "WHERE deleted = 0 AND result <> 'pass' AND severity IS NOT NULL "
                        + "GROUP BY severity ORDER BY cnt DESC")) {
            String key = (String) row.get("severity");
            list.add(new RdmQualityVO.NameValue(labels.getOrDefault(key, key), toLong(row.get("cnt"))));
        }
        return list;
    }

    private List<RdmQualityVO.ReworkItem> buildReworkRank() {
        List<RdmQualityVO.ReworkItem> list = new ArrayList<>();
        for (Map<String, Object> row : jdbcTemplate.queryForList(
                "SELECT r.id, r.req_no, r.title, r.rework_count, r.assignee_pm_name, r.submit_dept_name, "
                        + " (SELECT a.issues FROM rdm_acceptance a "
                        + "   WHERE a.deleted = 0 AND a.req_id = r.id AND a.result = 'fail' "
                        + "   ORDER BY a.accept_time DESC LIMIT 1) AS last_reason "
                        + "FROM rdm_requirement r "
                        + "WHERE r.deleted = 0 AND r.rework_count > 0 "
                        + "ORDER BY r.rework_count DESC, r.actual_release_date IS NULL, r.id DESC LIMIT 10")) {
            RdmQualityVO.ReworkItem item = new RdmQualityVO.ReworkItem();
            item.setReqId(toLong(row.get("id")));
            item.setReqNo((String) row.get("req_no"));
            item.setTitle((String) row.get("title"));
            item.setReworkCount((int) toLong(row.get("rework_count")));
            item.setPmName((String) row.get("assignee_pm_name"));
            item.setSubmitDeptName((String) row.get("submit_dept_name"));
            item.setLastRejectReason((String) row.get("last_reason"));
            list.add(item);
        }
        return list;
    }

    private List<RdmQualityVO.DeptQuality> buildDeptQuality() {
        List<RdmQualityVO.DeptQuality> list = new ArrayList<>();
        for (Map<String, Object> row : jdbcTemplate.queryForList(
                "SELECT COALESCE(r.submit_dept_name,'未填部門') AS dept_name, COUNT(*) AS accepted, "
                        + " SUM(CASE WHEN t.fail_cnt = 0 THEN 1 ELSE 0 END) AS first_pass, "
                        + " AVG(t.avg_score) AS avg_score, SUM(t.defects) AS defects "
                        + "FROM (SELECT req_id, SUM(CASE WHEN result = 'fail' THEN 1 ELSE 0 END) AS fail_cnt, "
                        + "             AVG(score) AS avg_score, SUM(COALESCE(defect_count, 0)) AS defects "
                        + "      FROM rdm_acceptance WHERE deleted = 0 GROUP BY req_id) t "
                        + "JOIN rdm_requirement r ON r.id = t.req_id AND r.deleted = 0 "
                        + "GROUP BY dept_name ORDER BY accepted DESC")) {
            RdmQualityVO.DeptQuality item = new RdmQualityVO.DeptQuality();
            long accepted = toLong(row.get("accepted"));
            item.setDeptName((String) row.get("dept_name"));
            item.setAccepted((int) accepted);
            item.setFirstPassRate(accepted == 0 ? 0 : round(toLong(row.get("first_pass")) / (double) accepted));
            item.setAvgScore(round(orZero(toDouble(row.get("avg_score")))));
            item.setDefectCount((int) toLong(row.get("defects")));
            list.add(item);
        }
        return list;
    }

    /** 按条件填充版本下的需求清单（版本追溯与后续周报上线清单共用同一取数口径） */
    private void fillTraceItems(RdmVersionTraceVO vo, String whereClause, Object arg) {
        long avgScoreSum = 0;
        long avgScoreCnt = 0;
        long passCnt = 0;
        long releasedCnt = 0;
        for (Map<String, Object> row : jdbcTemplate.queryForList(
                "SELECT id, req_no, title, status, req_type, priority, submit_dept_name, submitter_name, "
                        + " assignee_pm_name, plan_release_date, actual_release_date, acceptance_result, "
                        + " acceptance_score, rework_count, "
                        + " (SELECT MAX(attempt) FROM rdm_acceptance a "
                        + "    WHERE a.deleted = 0 AND a.req_id = r.id) AS attempt, "
                        + " (SELECT a.follow_up_req_no FROM rdm_acceptance a "
                        + "    WHERE a.deleted = 0 AND a.req_id = r.id AND a.follow_up_req_no IS NOT NULL "
                        + "    ORDER BY a.id DESC LIMIT 1) AS follow_up_req_no "
                        + "FROM rdm_requirement r WHERE deleted = 0 AND " + whereClause + " "
                        + "ORDER BY actual_release_date DESC, id DESC",
                arg)) {
            RdmVersionTraceVO.Item item = new RdmVersionTraceVO.Item();
            item.setReqId(toLong(row.get("id")));
            item.setReqNo((String) row.get("req_no"));
            item.setTitle((String) row.get("title"));
            item.setStatus((String) row.get("status"));
            item.setReqType((String) row.get("req_type"));
            item.setPriority((String) row.get("priority"));
            item.setSubmitDeptName((String) row.get("submit_dept_name"));
            item.setSubmitterName((String) row.get("submitter_name"));
            item.setPmName((String) row.get("assignee_pm_name"));
            item.setPlanReleaseDate(str(row.get("plan_release_date")));
            item.setActualReleaseDate(str(row.get("actual_release_date")));
            item.setAcceptanceResult((String) row.get("acceptance_result"));
            Long score = toLong(row.get("acceptance_score"));
            item.setAcceptanceScore(row.get("acceptance_score") == null ? null : score.intValue());
            item.setReworkCount((int) toLong(row.get("rework_count")));
            item.setAttempt(row.get("attempt") == null ? null : (int) toLong(row.get("attempt")));
            item.setFollowUpReqNo((String) row.get("follow_up_req_no"));
            vo.getRequirements().add(item);
            if ("released".equals(item.getStatus()) || "verified".equals(item.getStatus()) || "closed".equals(item.getStatus())) {
                releasedCnt++;
            }
            if (item.getAcceptanceResult() != null && !"fail".equals(item.getAcceptanceResult())) {
                passCnt++;
            }
            if (row.get("acceptance_score") != null) {
                avgScoreSum += score;
                avgScoreCnt++;
            }
        }
        RdmVersionTraceVO.Stats stats = vo.getStats();
        stats.setTotal(vo.getRequirements().size());
        stats.setReleased((int) releasedCnt);
        stats.setAcceptancePass((int) passCnt);
        stats.setAvgScore(avgScoreCnt == 0 ? 0 : round(avgScoreSum / (double) avgScoreCnt));
    }

    /* ==================== M3 周报明细 ==================== */

    private RdmWeeklyReportVO.Summary buildWeeklySummary(LocalDate start, LocalDate end,
                                                         boolean byIteration, String iterationCode) {
        RdmWeeklyReportVO.Summary s = new RdmWeeklyReportVO.Summary();
        String iterCond = byIteration ? " AND iteration_code = ?" : "";
        List<Object> args = new ArrayList<>();
        args.add(start);
        args.add(end);
        args.add(start);
        args.add(end);
        args.add(start);
        args.add(end);
        if (byIteration) {
            args.add(iterationCode);
        }
        Map<String, Object> row = jdbcTemplate.queryForList(
                        "SELECT SUM(CASE WHEN submit_time >= ? AND submit_time < ? THEN 1 ELSE 0 END) AS submitted, "
                                + " SUM(CASE WHEN accept_time >= ? AND accept_time < ? THEN 1 ELSE 0 END) AS accepted, "
                                + " SUM(CASE WHEN actual_release_date >= ? AND actual_release_date < ? THEN 1 ELSE 0 END) AS released, "
                                + " SUM(CASE WHEN status = 'scheduled' THEN 1 ELSE 0 END) AS scheduled, "
                                + " SUM(CASE WHEN overdue_flag = 1 THEN 1 ELSE 0 END) AS overdue, "
                                + " SUM(CASE WHEN blocked_flag = 1 THEN 1 ELSE 0 END) AS blocked "
                                + "FROM rdm_requirement WHERE deleted = 0" + iterCond,
                        args.toArray())
                .stream().findFirst().orElse(Map.of());
        s.setSubmitted((int) toLong(row.get("submitted")));
        s.setAccepted((int) toLong(row.get("accepted")));
        s.setReleased((int) toLong(row.get("released")));
        s.setScheduled((int) toLong(row.get("scheduled")));
        s.setOverdue((int) toLong(row.get("overdue")));
        s.setBlocked((int) toLong(row.get("blocked")));

        // 区间内上线需求的按时率与交付周期（口径与全局看板一致）
        List<Object> onTimeArgs = byIteration
                ? List.of(start, end, iterationCode)
                : List.of(start, end);
        Map<String, Object> cycle = jdbcTemplate.queryForList(
                        "SELECT COUNT(*) AS cnt, "
                                + " SUM(CASE WHEN plan_release_date IS NOT NULL AND actual_release_date <= plan_release_date "
                                + "      THEN 1 ELSE 0 END) AS on_time, "
                                + " AVG(CASE WHEN accept_time IS NOT NULL THEN (CASE WHEN actual_release_date >= DATE(accept_time) THEN DATEDIFF(actual_release_date, DATE(accept_time)) END) END) AS avg_days "
                                + "FROM rdm_requirement WHERE deleted = 0 "
                                + "AND actual_release_date >= ? AND actual_release_date < ?"
                                + (byIteration ? " AND iteration_code = ?" : ""),
                        onTimeArgs.toArray())
                .stream().findFirst().orElse(Map.of());
        long releasedCnt = toLong(cycle.get("cnt"));
        s.setOnTimeRate(releasedCnt == 0 ? 0 : round(toLong(cycle.get("on_time")) / (double) releasedCnt));
        s.setAvgDeliveryDays(round(orZero(toDouble(cycle.get("avg_days")))));

        // 区间内验收结果：通过数、一次通过率、返工数
        List<Object> accArgs = byIteration
                ? List.of(start, end, iterationCode)
                : List.of(start, end);
        Map<String, Object> acc = jdbcTemplate.queryForList(
                        "SELECT COUNT(*) AS accepted_total, COALESCE(SUM(CASE WHEN fail_cnt = 0 THEN 1 ELSE 0 END), 0) AS first_pass "
                                + "FROM (SELECT a.req_id, SUM(CASE WHEN a.result = 'fail' THEN 1 ELSE 0 END) AS fail_cnt "
                                + "      FROM rdm_acceptance a JOIN rdm_requirement r ON r.id = a.req_id AND r.deleted = 0 "
                                + "      WHERE a.deleted = 0 AND a.accept_time >= ? AND a.accept_time < ?"
                                + (byIteration ? " AND r.iteration_code = ?" : "")
                                + "      GROUP BY a.req_id) t",
                        accArgs.toArray())
                .stream().findFirst().orElse(Map.of());
        long acceptedReq = toLong(acc.get("accepted_total"));
        s.setFirstPassRate(acceptedReq == 0 ? 0 : round(toLong(acc.get("first_pass")) / (double) acceptedReq));
        s.setAcceptancePass((int) jdbcTemplate.queryForObject(
                "SELECT COUNT(DISTINCT a.req_id) FROM rdm_acceptance a WHERE a.deleted = 0 "
                        + "AND a.result IN ('pass','conditional') AND a.accept_time >= ? AND a.accept_time < ?",
                Integer.class, start, end));
        s.setRework((int) jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM rdm_acceptance WHERE deleted = 0 AND result = 'fail' "
                        + "AND accept_time >= ? AND accept_time < ?",
                Integer.class, start, end));
        s.setChanges((int) jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM rdm_change_request WHERE deleted = 0 AND created_at >= ? AND created_at < ?",
                Integer.class, start, end));
        return s;
    }

    private List<RdmWeeklyReportVO.DeptRow> buildWeeklyDeptRows(LocalDate start, LocalDate end,
                                                                boolean byIteration, String iterationCode) {
        List<RdmWeeklyReportVO.DeptRow> list = new ArrayList<>();
        // 此段 SQL 只有一对时间占位符（submitted 统计），上線量/逾期量走的是当前快照列不需要日期参数；
        // 之前多传了一对参数导致 MySQL 报 "Parameter index out of range (3 > 2)"，整个周报 500
        List<Object> args = new ArrayList<>();
        args.add(start);
        args.add(end);
        if (byIteration) {
            args.add(iterationCode);
        }
        for (Map<String, Object> row : jdbcTemplate.queryForList(
                "SELECT COALESCE(submit_dept_name,'未填部門') AS dept_name, "
                        + " SUM(CASE WHEN submit_time >= ? AND submit_time < ? THEN 1 ELSE 0 END) AS submitted, "
                        + " SUM(CASE WHEN status IN " + DELIVERED_STATUS_SQL + " THEN 1 ELSE 0 END) AS delivered, "
                        + " SUM(CASE WHEN overdue_flag = 1 THEN 1 ELSE 0 END) AS overdue, "
                        + " AVG(CASE WHEN actual_release_date IS NOT NULL AND accept_time IS NOT NULL "
                        + "      THEN (CASE WHEN actual_release_date >= DATE(accept_time) THEN DATEDIFF(actual_release_date, DATE(accept_time)) END) END) AS avg_days "
                        + "FROM rdm_requirement WHERE deleted = 0" + (byIteration ? " AND iteration_code = ?" : "")
                        + " GROUP BY dept_name ORDER BY submitted DESC, delivered DESC",
                args.toArray())) {
            RdmWeeklyReportVO.DeptRow item = new RdmWeeklyReportVO.DeptRow();
            item.setDeptName((String) row.get("dept_name"));
            item.setSubmitted((int) toLong(row.get("submitted")));
            item.setDelivered((int) toLong(row.get("delivered")));
            item.setOverdue((int) toLong(row.get("overdue")));
            item.setAvgDays(round(orZero(toDouble(row.get("avg_days")))));
            list.add(item);
        }
        return list;
    }

    private List<RdmWeeklyReportVO.PmRow> buildWeeklyPmRows(boolean byIteration, String iterationCode) {
        List<RdmWeeklyReportVO.PmRow> list = new ArrayList<>();
        for (Map<String, Object> row : jdbcTemplate.queryForList(
                "SELECT COALESCE(assignee_pm_name,'未分配') AS pm_name, "
                        + " SUM(CASE WHEN status IN " + IN_FLIGHT_STATUS_SQL + " THEN 1 ELSE 0 END) AS active, "
                        + " SUM(CASE WHEN status IN " + DELIVERED_STATUS_SQL + " THEN 1 ELSE 0 END) AS delivered, "
                        + " SUM(CASE WHEN overdue_flag = 1 THEN 1 ELSE 0 END) AS overdue "
                        + "FROM rdm_requirement WHERE deleted = 0" + (byIteration ? " AND iteration_code = ?" : "")
                        + " GROUP BY pm_name ORDER BY active DESC",
                byIteration ? new Object[]{iterationCode} : new Object[0])) {
            RdmWeeklyReportVO.PmRow item = new RdmWeeklyReportVO.PmRow();
            item.setPmName((String) row.get("pm_name"));
            item.setActive((int) toLong(row.get("active")));
            item.setDelivered((int) toLong(row.get("delivered")));
            item.setOverdue((int) toLong(row.get("overdue")));
            list.add(item);
        }
        return list;
    }

    private List<RdmWeeklyReportVO.ReleasedRow> buildWeeklyReleased(LocalDate start, LocalDate end,
                                                                   boolean byIteration, String iterationCode) {
        List<RdmWeeklyReportVO.ReleasedRow> list = new ArrayList<>();
        List<Object> args = new ArrayList<>();
        args.add(start);
        args.add(end);
        if (byIteration) {
            args.add(iterationCode);
        }
        for (Map<String, Object> row : jdbcTemplate.queryForList(
                "SELECT id, req_no, title, version_no, assignee_pm_name, actual_release_date, acceptance_score "
                        + "FROM rdm_requirement WHERE deleted = 0 "
                        + "AND actual_release_date >= ? AND actual_release_date < ?"
                        + (byIteration ? " AND iteration_code = ?" : "")
                        + " ORDER BY actual_release_date DESC, id DESC LIMIT 100",
                args.toArray())) {
            RdmWeeklyReportVO.ReleasedRow item = new RdmWeeklyReportVO.ReleasedRow();
            item.setReqId(toLong(row.get("id")));
            item.setReqNo((String) row.get("req_no"));
            item.setTitle((String) row.get("title"));
            item.setVersionNo((String) row.get("version_no"));
            item.setPmName((String) row.get("assignee_pm_name"));
            item.setActualReleaseDate(str(row.get("actual_release_date")));
            item.setAcceptanceScore(row.get("acceptance_score") == null
                    ? null : (int) toLong(row.get("acceptance_score")));
            list.add(item);
        }
        return list;
    }

    /** 风险清单：只取当前逾期/阻塞，迭代过滤与周报区间无关（风险是“现在”的状态） */
    private List<RdmWeeklyReportVO.RiskRow> buildWeeklyRisks(boolean byIteration, String iterationCode) {
        List<RdmWeeklyReportVO.RiskRow> list = new ArrayList<>();
        for (Map<String, Object> row : jdbcTemplate.queryForList(
                "SELECT id, req_no, title, status, COALESCE(current_handler_name,'待分配') AS handler, "
                        + " CASE WHEN blocked_flag = 1 THEN 'BLOCKED' WHEN overdue_flag = 1 THEN 'OVERDUE' "
                        + "      ELSE 'STAGNANT' END AS risk_type, "
                        + " TIMESTAMPDIFF(DAY, status_enter_time, NOW()) AS days "
                        + "FROM rdm_requirement WHERE deleted = 0 AND (overdue_flag = 1 OR blocked_flag = 1)"
                        + (byIteration ? " AND iteration_code = ?" : "")
                        + " ORDER BY blocked_flag DESC, overdue_flag DESC, days DESC LIMIT 50",
                byIteration ? new Object[]{iterationCode} : new Object[0])) {
            RdmWeeklyReportVO.RiskRow item = new RdmWeeklyReportVO.RiskRow();
            item.setReqId(toLong(row.get("id")));
            item.setReqNo((String) row.get("req_no"));
            item.setTitle((String) row.get("title"));
            item.setStatus((String) row.get("status"));
            item.setHandler((String) row.get("handler"));
            item.setDays((int) toLong(row.get("days")));
            item.setRiskType((String) row.get("risk_type"));
            list.add(item);
        }
        return list;
    }

    /** 下周计划：上线日期落在区间结束后 7 天内 */
    private List<RdmWeeklyReportVO.NextRow> buildWeeklyNext(LocalDate end, LocalDate exclusiveEnd,
                                                            boolean byIteration, String iterationCode) {
        List<RdmWeeklyReportVO.NextRow> list = new ArrayList<>();
        for (Map<String, Object> row : jdbcTemplate.queryForList(
                "SELECT id, req_no, title, status, plan_release_date FROM rdm_requirement "
                        + "WHERE deleted = 0 AND plan_release_date IS NOT NULL AND plan_release_date > ? "
                        + "AND plan_release_date <= ? AND status NOT IN " + DELIVERED_STATUS_SQL
                        + (byIteration ? " AND iteration_code = ?" : "")
                        + " ORDER BY plan_release_date LIMIT 50",
                byIteration
                        ? new Object[]{exclusiveEnd.minusDays(1), end.plusDays(7), iterationCode}
                        : new Object[]{exclusiveEnd.minusDays(1), end.plusDays(7)})) {
            RdmWeeklyReportVO.NextRow item = new RdmWeeklyReportVO.NextRow();
            item.setReqId(toLong(row.get("id")));
            item.setReqNo((String) row.get("req_no"));
            item.setTitle((String) row.get("title"));
            item.setStatus((String) row.get("status"));
            item.setPlanReleaseDate(str(row.get("plan_release_date")));
            list.add(item);
        }
        return list;
    }

    /* ==================== M3 工具 ==================== */

    /** 周报日期格式（与前端 dayjs 默认 ISO 日期一致） */
    private static final java.time.format.DateTimeFormatter DAY_LABEL = java.time.format.DateTimeFormatter.ofPattern("MM-dd");

    /** 安全解析日期：空或非法那么用默认值（避免前端传错格式直接 500） */
    private static LocalDate parseDate(String value, LocalDate fallback) {
        if (!StringUtils.hasText(value)) {
            return fallback;
        }
        try {
            return LocalDate.parse(value.trim());
        } catch (DateTimeParseException e) {
            throw new BusinessException("日期格式不正確，请使用 yyyy-MM-dd：" + value);
        }
    }

    private long count(String sql) {
        Long value = jdbcTemplate.queryForObject(sql, Long.class);
        return value == null ? 0 : value;
    }

    private static double orZero(Double value) {
        return value == null ? 0 : value;
    }

    private static String str(Object value) {
        return value == null ? null : String.valueOf(value);
    }

    /* ==================== 结果指标 ==================== */
    private RdmDashboardVO.Overview buildOverview(String periodDays) {
        RdmDashboardVO.Overview o = new RdmDashboardVO.Overview();
        Map<String, Object> row = jdbcTemplate.queryForList(
                        "SELECT COUNT(*) AS req_total, "
                                + " SUM(CASE WHEN submit_time >= DATE_SUB(NOW(), INTERVAL " + periodDays + " DAY) THEN 1 ELSE 0 END) AS submitted, "
                                + " SUM(CASE WHEN actual_release_date >= DATE_SUB(CURDATE(), INTERVAL " + periodDays + " DAY) THEN 1 ELSE 0 END) AS delivered, "
                                + " SUM(CASE WHEN overdue_flag = 1 THEN 1 ELSE 0 END) AS overdue_total, "
                                + " SUM(CASE WHEN blocked_flag = 1 THEN 1 ELSE 0 END) AS blocked_total, "
                                + " SUM(CASE WHEN status = 'pool' THEN 1 ELSE 0 END) AS unassigned_total, "
                                + " SUM(CASE WHEN status = 'intake_pending' THEN 1 ELSE 0 END) AS intake_stuck_total, "
                                + " SUM(CASE WHEN reject_count > 0 THEN 1 ELSE 0 END) AS rejected_total, "
                                + " SUM(CASE WHEN actual_release_date IS NOT NULL THEN 1 ELSE 0 END) AS released_total, "
                                + " SUM(CASE WHEN actual_release_date IS NOT NULL AND plan_release_date IS NOT NULL "
                                + "          AND actual_release_date <= plan_release_date THEN 1 ELSE 0 END) AS on_time_total, "
                                + " AVG(CASE WHEN accept_time IS NOT NULL AND submit_time IS NOT NULL "
                                + "      THEN TIMESTAMPDIFF(HOUR, submit_time, accept_time) END) AS avg_response_hours, "
                                // actual_release_date 是 DATE（当天 00:00），accept_time 是 DATETIME；
                                // 用 TIMESTAMPDIFF(HOUR)/24 混算会让当天受理当天上线的负数（实测 -0.5 天），
                                // 因此取整天数口径，并排除「上线日早于受理日」的非法数据而不是钳 0
                                + " AVG(CASE WHEN actual_release_date IS NOT NULL AND accept_time IS NOT NULL "
                                + "      AND actual_release_date >= DATE(accept_time) "
                                + "      THEN DATEDIFF(actual_release_date, DATE(accept_time)) END) AS avg_delivery_days "
                                + "FROM rdm_requirement WHERE deleted = 0")
                .stream().findFirst().orElse(Map.of());
        o.setReqTotal(toLong(row.get("req_total")));
        o.setSubmittedThisMonth(toLong(row.get("submitted")));
        o.setDeliveredThisMonth(toLong(row.get("delivered")));
        o.setOverdueTotal(toLong(row.get("overdue_total")));
        o.setBlockedTotal(toLong(row.get("blocked_total")));
        o.setUnassignedTotal(toLong(row.get("unassigned_total")));
        o.setIntakeStuckTotal(toLong(row.get("intake_stuck_total")));
        double released = toLong(row.get("released_total"));
        double onTime = toLong(row.get("on_time_total"));
        double total = o.getReqTotal();
        double rejected = toLong(row.get("rejected_total"));
        o.setOnTimeRate(released == 0 ? 0 : round(onTime / released));
        o.setRejectRate(total == 0 ? 0 : round(rejected / total));
        Double response = toDouble(row.get("avg_response_hours"));
        Double delivery = toDouble(row.get("avg_delivery_days"));
        o.setAvgResponseHours(response == null ? 0 : round(response));
        o.setAvgDeliveryDays(delivery == null ? 0 : round(delivery));
        return o;
    }

    private List<RdmDashboardVO.NameValue> buildTypeDist() {
        return toNameValue(jdbcTemplate.queryForList(
                "SELECT req_type AS name, COUNT(*) AS value FROM rdm_requirement "
                        + "WHERE deleted = 0 GROUP BY req_type ORDER BY value DESC"));
    }

    private List<RdmDashboardVO.DeptRank> buildDeptRank(String periodDays) {
        List<RdmDashboardVO.DeptRank> list = new ArrayList<>();
        for (Map<String, Object> row : jdbcTemplate.queryForList(
                "SELECT COALESCE(submit_dept_name,'未填部門') AS dept_name, COUNT(*) AS submitted, "
                        + " SUM(CASE WHEN status IN " + DELIVERED_STATUS_SQL + " THEN 1 ELSE 0 END) AS delivered, "
                        + " SUM(CASE WHEN actual_release_date IS NOT NULL AND plan_release_date IS NOT NULL "
                        + "      AND actual_release_date <= plan_release_date THEN 1 ELSE 0 END) AS on_time, "
                        + " AVG(CASE WHEN actual_release_date IS NOT NULL AND accept_time IS NOT NULL "
                        + "      THEN (CASE WHEN actual_release_date >= DATE(accept_time) THEN DATEDIFF(actual_release_date, DATE(accept_time)) END) END) AS avg_days "
                        + "FROM rdm_requirement WHERE deleted = 0 "
                        + "AND submit_time >= DATE_SUB(NOW(), INTERVAL " + periodDays + " DAY) "
                        + "GROUP BY dept_name ORDER BY submitted DESC")) {
            RdmDashboardVO.DeptRank rank = new RdmDashboardVO.DeptRank();
            rank.setDeptName((String) row.get("dept_name"));
            rank.setSubmitted(toLong(row.get("submitted")));
            rank.setDelivered(toLong(row.get("delivered")));
            double delivered = toLong(row.get("on_time"));
            double submitted = rank.getSubmitted();
            rank.setOnTimeRate(submitted == 0 ? 0 : round(delivered / submitted));
            Double avgDays = toDouble(row.get("avg_days"));
            rank.setAvgDays(avgDays == null ? 0 : round(avgDays));
            list.add(rank);
        }
        return list;
    }

    private List<RdmDashboardVO.PmRank> buildPmRank() {
        List<RdmDashboardVO.PmRank> list = new ArrayList<>();
        for (Map<String, Object> row : jdbcTemplate.queryForList(
                "SELECT assignee_pm_name AS pm_name, "
                        + " SUM(CASE WHEN status IN " + IN_FLIGHT_STATUS_SQL + " THEN 1 ELSE 0 END) AS active_cnt, "
                        + " SUM(CASE WHEN status IN " + DELIVERED_STATUS_SQL + " THEN 1 ELSE 0 END) AS delivered, "
                        + " SUM(CASE WHEN overdue_flag = 1 THEN 1 ELSE 0 END) AS overdue, "
                        + " AVG(CASE WHEN actual_release_date IS NOT NULL AND accept_time IS NOT NULL "
                        + "      THEN (CASE WHEN actual_release_date >= DATE(accept_time) THEN DATEDIFF(actual_release_date, DATE(accept_time)) END) END) AS avg_days "
                        + "FROM rdm_requirement WHERE deleted = 0 AND assignee_pm_name IS NOT NULL "
                        + "GROUP BY assignee_pm_name ORDER BY delivered DESC, active_cnt DESC")) {
            RdmDashboardVO.PmRank rank = new RdmDashboardVO.PmRank();
            rank.setPmName((String) row.get("pm_name"));
            rank.setActive(toLong(row.get("active_cnt")));
            rank.setDelivered(toLong(row.get("delivered")));
            rank.setOverdue(toLong(row.get("overdue")));
            Double avgDays = toDouble(row.get("avg_days"));
            rank.setAvgDays(avgDays == null ? 0 : round(avgDays));
            list.add(rank);
        }
        return list;
    }

    /** 各阶段平均停留小时（来自状态流水，定位流程瓶颈） */
    private List<RdmDashboardVO.StageDuration> buildStageDuration() {
        Map<String, String> stageOf = new LinkedHashMap<>();
        for (RdmConfigVO.StatusDef def : configService.statusDefs()) {
            stageOf.put(def.getCode(), def.getStage());
        }
        Map<String, long[]> sumByStage = new LinkedHashMap<>();
        for (Map<String, Object> row : jdbcTemplate.queryForList(
                "SELECT l.to_status AS status, COALESCE(SUM(l.duration_seconds), 0) AS total_seconds, "
                        + " COUNT(l.id) AS sample_cnt "
                        + "FROM rdm_status_log l WHERE l.deleted = 0 AND l.duration_seconds IS NOT NULL "
                        + "GROUP BY l.to_status")) {
            String stage = stageOf.get((String) row.get("status"));
            if (!StringUtils.hasText(stage)) {
                continue;
            }
            long[] acc = sumByStage.computeIfAbsent(stage, k -> new long[2]);
            acc[0] += toLong(row.get("total_seconds"));
            acc[1] += toLong(row.get("sample_cnt"));
        }
        List<RdmDashboardVO.StageDuration> list = new ArrayList<>();
        sumByStage.forEach((stage, acc) -> {
            RdmDashboardVO.StageDuration item = new RdmDashboardVO.StageDuration();
            item.setStage(stage);
            item.setAvgHours(acc[1] == 0 ? 0 : round(acc[0] / 3600.0 / acc[1]));
            list.add(item);
        });
        list.sort((a, b) -> Long.compare(a.getAvgHours().longValue(), b.getAvgHours().longValue()));
        return list;
    }

    /** 近 N 周提交/交付趋势（week→8 周、month→6 月、quarter→4 季、year→12 月） */
    private List<RdmDashboardVO.TrendPoint> buildTrend(String period) {
        String expr = switch (period == null ? "month" : period) {
            case "week" -> "%Y-%v";
            case "quarter" -> "%Y-Q";
            default -> "%Y-%m";
        };
        int buckets = switch (period == null ? "month" : period) {
            case "week" -> 8;
            case "quarter" -> 4;
            default -> 6;
        };
        List<RdmDashboardVO.TrendPoint> list = new ArrayList<>();
        for (Map<String, Object> row : jdbcTemplate.queryForList(
                "SELECT bucket, SUM(submitted) AS submitted, SUM(delivered) AS delivered FROM ("
                        + " SELECT DATE_FORMAT(submit_time, '" + expr + "') AS bucket, 1 AS submitted, 0 AS delivered "
                        + "   FROM rdm_requirement WHERE deleted = 0 AND submit_time IS NOT NULL "
                        + "   UNION ALL "
                        + " SELECT DATE_FORMAT(actual_release_date, '" + expr + "') AS bucket, 0 AS submitted, 1 AS delivered "
                        + "   FROM rdm_requirement WHERE deleted = 0 AND actual_release_date IS NOT NULL"
                        + ") t WHERE bucket IS NOT NULL GROUP BY bucket ORDER BY bucket DESC LIMIT " + buckets)) {
            RdmDashboardVO.TrendPoint point = new RdmDashboardVO.TrendPoint();
            point.setDate((String) row.get("bucket"));
            point.setSubmitted(toLong(row.get("submitted")));
            point.setDelivered(toLong(row.get("delivered")));
            list.add(point);
        }
        java.util.Collections.reverse(list);
        return list;
    }

    /**
     * 风险清单（全局唯一口径）：逾期 / 超 7 天无进展 / 阻塞 / 无主 / 审批停滞。
     * <p>必须只有一个入口：之前看板雷达与 AI 风险摘要各写一份 SQL（LIMIT 20 / 12 不一），
     * 同页并列会出现“上面说 5 条、下面列 6 条”，且改定义要改两处。
     * <p>minStayDays 按「当前状态停留天数」筛选，而不是“提单时间窗口”：风险本质是
     * “现在卡在谁手上卡了多久”，用提交时间筛选会把早就卡住的存量需求滤掉，反而漏掉最严的。
     * <p>周报的 buildWeeklyRisks 不走这里：它只统计交付风险（阻塞/逾期/停滞），语义不同。
     */
    public List<RdmDashboardVO.Risk> riskList(int limit, int minStayDays) {
        List<RdmDashboardVO.Risk> list = new ArrayList<>();
        // 停留天数阈值：0 表示不按卡住时长过滤（风险列表默认看全部）
        String stayCond = minStayDays > 0
                ? "AND TIMESTAMPDIFF(DAY, status_enter_time, NOW()) >= ? " : "";
        for (Map<String, Object> row : jdbcTemplate.queryForList(
                "SELECT id, req_no, title, status, submitter_name, COALESCE(current_handler_name,'待分配') AS handler, "
                        + " CASE WHEN blocked_flag = 1 THEN 'BLOCKED' "
                        + "      WHEN status = 'pool' THEN 'UNASSIGNED' "
                        + "      WHEN status = 'intake_pending' THEN 'INTAKE_STUCK' "
                        + "      WHEN overdue_flag = 1 THEN 'OVERDUE' "
                        + "      ELSE 'STAGNANT' END AS risk_type, "
                        + " TIMESTAMPDIFF(DAY, status_enter_time, NOW()) AS days "
                        + "FROM rdm_requirement WHERE deleted = 0 "
                        + "AND (overdue_flag = 1 OR blocked_flag = 1 OR status IN ('pool','intake_pending') "
                        + "     OR (status_enter_time < DATE_SUB(NOW(), INTERVAL 7 DAY) AND status <> 'draft')) "
                        + stayCond
                        + "ORDER BY blocked_flag DESC, overdue_flag DESC, days DESC LIMIT " + Math.max(limit, 1),
                minStayDays > 0 ? new Object[]{minStayDays} : new Object[0])) {
            RdmDashboardVO.Risk risk = new RdmDashboardVO.Risk();
            risk.setRiskType((String) row.get("risk_type"));
            risk.setReqId(toLong(row.get("id")));
            risk.setReqNo((String) row.get("req_no"));
            risk.setTitle((String) row.get("title"));
            risk.setStatus((String) row.get("status"));
            risk.setSubmitterName((String) row.get("submitter_name"));
            risk.setHandler((String) row.get("handler"));
            risk.setDays(toLong(row.get("days")));
            list.add(risk);
        }
        return list;
    }

    /** 交付流水线各段负载 */
    private RdmDashboardVO.Board buildBoard() {
        RdmDashboardVO.Board board = new RdmDashboardVO.Board();
        board.getColumns().add(boardColumn("dispatch", "待分配 / 受理",
                List.of("pool", "assigned", "evaluating", "on_hold")));
        board.getColumns().add(boardColumn("product", "產品設計 / 評審",
                List.of("accepted", "prd_designing", "reviewing", "review_passed")));
        board.getColumns().add(boardColumn("delivery", "研發 / 測試",
                List.of("scheduled", "designing", "developing", "integration", "testing", "test_passed")));
        board.getColumns().add(boardColumn("acceptance", "待驗收 / 上線",
                List.of("uat_pending", "uat_rejected", "released", "verified")));
        return board;
    }

    private RdmDashboardVO.BoardColumn boardColumn(String key, String title, List<String> statuses) {
        String placeholders = String.join(",", statuses.stream().map(s -> "?").toList());
        Map<String, Object> row = jdbcTemplate.queryForList(
                        "SELECT COUNT(*) AS cnt, SUM(CASE WHEN overdue_flag = 1 THEN 1 ELSE 0 END) AS overdue "
                                + "FROM rdm_requirement WHERE deleted = 0 AND status IN (" + placeholders + ")",
                        statuses.toArray())
                .stream().findFirst().orElse(Map.of());
        RdmDashboardVO.BoardColumn column = new RdmDashboardVO.BoardColumn();
        column.setKey(key);
        column.setTitle(title);
        column.setCount(toLong(row.get("cnt")));
        column.setOverdue(toLong(row.get("overdue")));
        return column;
    }

    /** 统计窗口天数 */
    private static String periodDays(String period) {
        return switch (period == null ? "month" : period) {
            case "week" -> "7";
            case "quarter" -> "90";
            case "year" -> "365";
            default -> "30";
        };
    }

    private static List<RdmDashboardVO.NameValue> toNameValue(List<Map<String, Object>> rows) {
        List<RdmDashboardVO.NameValue> list = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            RdmDashboardVO.NameValue item = new RdmDashboardVO.NameValue();
            item.setName((String) row.get("name"));
            item.setValue(toLong(row.get("value")));
            list.add(item);
        }
        return list;
    }

    private static double round(double value) {
        return Math.round(value * 100) / 100.0;
    }

    private static long toLong(Object value) {
        return value == null ? 0L : ((Number) value).longValue();
    }

    private static Double toDouble(Object value) {
        return value == null ? null : ((Number) value).doubleValue();
    }
}
