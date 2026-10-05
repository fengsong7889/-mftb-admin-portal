package com.mftb.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.RdmScoreDTO;
import com.mftb.admin.dto.RdmScoreVO;
import com.mftb.admin.entity.RdmRequirement;
import com.mftb.admin.entity.RdmRequirementRole;
import com.mftb.admin.entity.RdmScoreRule;
import com.mftb.admin.mapper.RdmRequirementMapper;
import com.mftb.admin.mapper.RdmRequirementRoleMapper;
import com.mftb.admin.mapper.RdmScoreRuleMapper;
import com.mftb.admin.service.RdmScoreCalculator.Input;
import com.mftb.admin.service.RdmScoreCalculator.Params;
import com.mftb.admin.service.RdmScoreCalculator.Result;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * RDM 产出积分服务（M4）：规则版本化、按周期重算、绩效建议值推送。
 *
 * <p>三条结构级约束：
 * <ol>
 *   <li><b>重算幂等</b>：流水唯一键 {@code (req_id,user_id,role_code,period_code)}，
 *       走 {@code INSERT ... ON DUPLICATE KEY UPDATE}，绝不"先全删再插"——并发重算会双份出分；</li>
 *   <li><b>规则不可变</b>：修改生效规则等于升版本，旧版本行保留，历史流水按当时版本解释；</li>
 *   <li><b>建议值不越权</b>：只写 hr_perf_score_item 的 suggested_* 通道，
 *       不碰 self_score/supervisor_score/final_score，定分权留给 HR 校准。</li>
 * </ol>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RdmScoreService {

    /** 交付终态（与看板口径保持一致） */
    private static final String DELIVERED_STATUS_SQL = "('released','verified','closed')";

    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("yyyy-MM-dd");

    /**
     * 成因 JSON 专用 mapper。
     * <p>不用 JsonUtils.toJson：它在失败时静默返回 "[]"，而成因明细就是绩效申诉的复算依据，
     * 存不下时必须失败回滚，不能留一条“只有分数、说不清来源”的流水。
     */
    private static final ObjectMapper JSON = new ObjectMapper();

    private final RdmScoreRuleMapper ruleMapper;
    private final RdmRequirementMapper requirementMapper;
    private final RdmRequirementRoleMapper roleMapper;
    private final OperatorResolver operatorResolver;
    private final JdbcTemplate jdbcTemplate;

    /* ==================== 规则 ==================== */

    /** 规则列表（版本降序，含已停用版本供历史回溯） */
    public List<RdmScoreVO.Rule> listRules() {
        List<RdmScoreVO.Rule> list = new ArrayList<>();
        for (RdmScoreRule rule : ruleMapper.selectList(new LambdaQueryWrapper<RdmScoreRule>()
                .orderByDesc(RdmScoreRule::getVersion).orderByAsc(RdmScoreRule::getId))) {
            list.add(toRuleVO(rule));
        }
        return list;
    }

    /** 当前生效规则（无生效行时回落到最高版本） */
    public RdmScoreRule currentRule() {
        List<RdmScoreRule> enabled = ruleMapper.selectList(new LambdaQueryWrapper<RdmScoreRule>()
                .eq(RdmScoreRule::getEnabled, 1).orderByDesc(RdmScoreRule::getVersion).last("LIMIT 1"));
        if (!enabled.isEmpty()) {
            return enabled.get(0);
        }
        List<RdmScoreRule> latest = ruleMapper.selectList(new LambdaQueryWrapper<RdmScoreRule>()
                .orderByDesc(RdmScoreRule::getVersion).last("LIMIT 1"));
        return latest.isEmpty() ? null : latest.get(0);
    }

    /**
     * 保存规则 = 升版本。
     * <p>原地改生效行会让历史流水的 rule_version 指向一套已被改动的系数，申诉时无法复算；
     * 因此编辑「生效中的规则」时新建 version+1 行并把生效标记迁移过去，旧行原样保留。
     */
    @Transactional(rollbackFor = Exception.class)
    public RdmScoreVO.Rule saveRule(RdmScoreDTO.Rule form) {
        if (form == null || !StringUtils.hasText(form.getRuleCode())) {
            throw new BusinessException("規則編碼不能為空");
        }
        var current = operatorResolver.currentUser();
        String signature = operatorResolver.operatorSignature(current);
        RdmScoreRule existing = form.getId() == null ? null : ruleMapper.selectById(form.getId());
        if (form.getId() != null && existing == null) {
            throw new BusinessException("規則不存在或已刪除");
        }

        boolean editingEnabled = existing != null && Integer.valueOf(1).equals(existing.getEnabled());
        RdmScoreRule target = editingEnabled ? new RdmScoreRule() : (existing == null ? new RdmScoreRule() : existing);
        if (editingEnabled) {
            // 升版：同码取最大版本 + 1，旧行保留供历史流水解释
            Integer maxVersion = jdbcTemplate.queryForObject(
                    "SELECT COALESCE(MAX(version), 0) FROM rdm_score_rule WHERE rule_code = ? AND deleted = 0",
                    Integer.class, form.getRuleCode().trim());
            target.setVersion((maxVersion == null ? 0 : maxVersion) + 1);
            target.setCreatedBy(signature);
        } else if (existing == null) {
            Integer maxVersion = jdbcTemplate.queryForObject(
                    "SELECT COALESCE(MAX(version), 0) FROM rdm_score_rule WHERE rule_code = ? AND deleted = 0",
                    Integer.class, form.getRuleCode().trim());
            target.setVersion((maxVersion == null ? 0 : maxVersion) + 1);
            target.setCreatedBy(signature);
            target.setRuleCode(form.getRuleCode().trim());
        }
        applyForm(target, form);
        target.setUpdatedBy(signature);

        if (target.getId() == null) {
            ruleMapper.insert(target);
        } else {
            ruleMapper.updateById(target);
        }
        if (Integer.valueOf(1).equals(target.getEnabled())) {
            makeOnlyThisEnabled(target.getId());
        }
        log.info("積分規則已保存: code={}, version={}, enabled={}, operator={}",
                target.getRuleCode(), target.getVersion(), target.getEnabled(), signature);
        return toRuleVO(target);
    }

    /** 启用某版本（同一时刻只保留一条生效规则） */
    @Transactional(rollbackFor = Exception.class)
    public List<RdmScoreVO.Rule> setEnabled(Long id, boolean enabled) {
        RdmScoreRule rule = ruleMapper.selectById(id);
        if (rule == null) {
            throw new BusinessException("規則不存在或已刪除");
        }
        rule.setEnabled(enabled ? 1 : 0);
        rule.setUpdatedBy(operatorResolver.operatorSignature(operatorResolver.currentUser()));
        ruleMapper.updateById(rule);
        if (enabled) {
            makeOnlyThisEnabled(id);
        }
        return listRules();
    }

    /** 只保留指定行为生效规则 */
    private void makeOnlyThisEnabled(Long id) {
        jdbcTemplate.update("UPDATE rdm_score_rule SET enabled = 0 WHERE id <> ? AND enabled = 1 AND deleted = 0", id);
    }

    /* ==================== 重算与查询 ==================== */

    /**
     * 按当前生效规则重算某周期的积分流水（幂等 upsert）。
     *
     * @param periodCode 绩效周期编码，空则取最近一个已发布周期
     * @return 本次处理的流水条数
     */
    @Transactional(rollbackFor = Exception.class)
    public int recalc(String periodCode) {
        Map<String, Object> period = resolvePeriod(periodCode);
        String code = (String) period.get("code");
        LocalDate start = toLocalDate(period.get("period_start"));
        LocalDate end = toLocalDate(period.get("period_end"));
        RdmScoreRule rule = currentRule();
        if (rule == null) {
            throw new BusinessException("還沒有任何積分規則，無法計分");
        }
        Params params = toParams(rule);
        int maxRoles = rule.getMaxScorableRoles() == null || rule.getMaxScorableRoles() <= 0 ? 6 : rule.getMaxScorableRoles();

        List<RdmRequirement> delivered = requirementMapper.selectList(new LambdaQueryWrapper<RdmRequirement>()
                .in(RdmRequirement::getStatus, List.of("released", "verified", "closed"))
                .ge(start != null, RdmRequirement::getActualReleaseDate, start)
                .le(end != null, RdmRequirement::getActualReleaseDate, end));
        int count = 0;
        for (RdmRequirement req : delivered) {
            count += scoreOneRequirement(req, code, params, rule, maxRoles);
        }
        log.info("積分重算完成: period={}, 需求數={}, 流水數={}, ruleVersion={}", code, delivered.size(), count, rule.getVersion());
        return count;
    }

    /** 单条需求按参与角色出分（超出角色上限的部分按系数取前 N，并留警告日志） */
    private int scoreOneRequirement(RdmRequirement req, String periodCode, Params params, RdmScoreRule rule, int maxRoles) {
        List<RdmRequirementRole> members = roleMapper.selectList(new LambdaQueryWrapper<RdmRequirementRole>()
                .eq(RdmRequirementRole::getReqId, req.getId())
                .eq(RdmRequirementRole::getIsActive, 1));
        // 同一人同一角色只计一次（防流水重复与重复出分）
        Map<String, RdmRequirementRole> dedup = new LinkedHashMap<>();
        for (RdmRequirementRole member : members) {
            if (member.getUserId() == null || !RdmScoreCalculator.SCORABLE_ROLES.contains(member.getRoleCode())) {
                continue;
            }
            dedup.putIfAbsent(member.getUserId() + "|" + member.getRoleCode(), member);
        }
        List<RdmRequirementRole> scorable = new ArrayList<>(dedup.values());
        if (scorable.isEmpty()) {
            // 没有参与人记录时按主数据兜底，保证早期数据也能出分
            scorable = fallbackParticipants(req);
        }
        if (scorable.size() > maxRoles) {
            log.warn("需求 {} 計分角色 {} 個超過上限 {}，僅按係數取前 {} 個，請 PMO 核對參與人",
                    req.getReqNo(), scorable.size(), maxRoles, maxRoles);
            scorable = scorable.stream()
                    .sorted((a, b) -> Double.compare(
                            -RdmScoreCalculator.roleFactorOf(b.getRoleCode()),
                            -RdmScoreCalculator.roleFactorOf(a.getRoleCode())))
                    .limit(maxRoles).toList();
        }
        if (scorable.isEmpty()) {
            return 0;
        }

        boolean firstPass = isTrue(req.getAcceptanceResult()) && !hasFailAcceptance(req.getId());
        boolean onTime = req.getPlanReleaseDate() == null
                || req.getActualReleaseDate() == null
                || !req.getActualReleaseDate().isAfter(req.getPlanReleaseDate());
        int lateDays = onTime || req.getPlanReleaseDate() == null || req.getActualReleaseDate() == null
                ? 0 : (int) Math.max(0, java.time.temporal.ChronoUnit.DAYS.between(req.getPlanReleaseDate(), req.getActualReleaseDate()));
        double factorSum = RdmScoreCalculator.sumRoleFactors(scorable.stream().map(RdmRequirementRole::getRoleCode).toList());

        int written = 0;
        for (RdmRequirementRole member : scorable) {
            Result result = RdmScoreCalculator.compute(new Input(
                    member.getRoleCode(), req.getComplexity(), req.getReqType(), req.getPriority(),
                    onTime, lateDays, nz(req.getReworkCount()), nz(req.getReopenCount()),
                    req.getAcceptanceScore(), firstPass, factorSum), params);
            if (result.finalScore().signum() <= 0) {
                continue;
            }
            upsertScoreRecord(req, periodCode, member, result, rule, onTime, lateDays, firstPass);
            written++;
        }
        return written;
    }

    /** 参与人缺失时按需求主数据兜底（产品经理/研发负责人各一条） */
    private List<RdmRequirementRole> fallbackParticipants(RdmRequirement req) {
        List<RdmRequirementRole> list = new ArrayList<>();
        if (req.getAssigneePmUserId() != null) {
            RdmRequirementRole pm = new RdmRequirementRole();
            pm.setUserId(req.getAssigneePmUserId());
            pm.setEmpNo(req.getAssigneePmEmpNo());
            pm.setEmpName(req.getAssigneePmName());
            pm.setRoleCode(RdmConstants.ROLE_PM);
            list.add(pm);
        }
        if (req.getDevOwnerUserId() != null) {
            RdmRequirementRole dev = new RdmRequirementRole();
            dev.setUserId(req.getDevOwnerUserId());
            dev.setEmpName(req.getDevOwnerName());
            dev.setRoleCode(RdmConstants.ROLE_DEV_LEAD);
            list.add(dev);
        }
        return list;
    }

    /** 流水幂等写入：唯一键冲突时覆盖分数与因子，但保留已推送状态（避免重算抹掉推送记录） */
    private void upsertScoreRecord(RdmRequirement req, String periodCode, RdmRequirementRole member,
                                   Result result, RdmScoreRule rule, boolean onTime, int lateDays, boolean firstPass) {
        String signature = operatorResolver.operatorSignature(operatorResolver.currentUser());
        jdbcTemplate.update(
                "INSERT INTO rdm_score_record (req_id, user_id, emp_no, user_name, dept_id, dept_name, role_code, "
                        + "period_code, score, base_score, type_factor, priority_factor, on_time_factor, quality_factor, "
                        + "role_factor, breakdown_json, rule_version, complexity, req_type, priority, on_time, late_days, "
                        + "rework_count, acceptance_score, first_pass, push_status, calculated_at, created_by, updated_by, deleted) "
                        + "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW(),?,?,0) "
                        + "ON DUPLICATE KEY UPDATE score = VALUES(score), base_score = VALUES(base_score), "
                        + "type_factor = VALUES(type_factor), priority_factor = VALUES(priority_factor), "
                        + "on_time_factor = VALUES(on_time_factor), quality_factor = VALUES(quality_factor), "
                        + "role_factor = VALUES(role_factor), breakdown_json = VALUES(breakdown_json), "
                        + "rule_version = VALUES(rule_version), on_time = VALUES(on_time), late_days = VALUES(late_days), "
                        + "rework_count = VALUES(rework_count), acceptance_score = VALUES(acceptance_score), "
                        + "first_pass = VALUES(first_pass), calculated_at = NOW(), updated_by = VALUES(updated_by), deleted = 0",
                req.getId(), member.getUserId(), member.getEmpNo(), member.getEmpName(),
                null, null, member.getRoleCode(), periodCode,
                result.finalScore(), bd(result.base()), bd(result.typeFactor()), bd(result.priorityFactor()),
                bd(result.onTimeFactor()), bd(result.qualityFactor()), bd(result.roleFactor()),
                toJson(result), rule.getVersion(), req.getComplexity(), req.getReqType(), req.getPriority(),
                onTime ? 1 : 0, lateDays, nz(req.getReworkCount()), req.getAcceptanceScore(),
                firstPass ? 1 : 0, RdmConstants.PUSH_NONE, signature, signature);
    }

    /** 产出看板（排名 + 部门对比 + 流水） */
    public RdmScoreVO.Board board(String periodCode, Long deptId, Long userId) {
        Map<String, Object> period = resolvePeriod(periodCode);
        String code = (String) period.get("code");
        RdmScoreRule rule = currentRule();
        RdmScoreVO.Board board = new RdmScoreVO.Board();
        board.setPeriod(new RdmScoreVO.Period(code, (String) period.get("name"),
                str(period.get("period_start")), str(period.get("period_end"))));
        if (rule != null) {
            board.setRuleVersion(rule.getVersion());
            board.setRuleEffectiveFrom(rule.getEffectiveFrom() == null ? null : rule.getEffectiveFrom().format(DAY));
            board.setAllocMode(rule.getAllocMode());
        }

        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT r.*, q.req_no, q.title AS req_title, r.user_name AS person_name "
                        + "FROM rdm_score_record r JOIN rdm_requirement q ON q.id = r.req_id AND q.deleted = 0 "
                        + "WHERE r.deleted = 0 AND r.period_code = ? "
                        + (deptId != null ? "AND r.dept_id = ? " : "")
                        + (userId != null ? "AND r.user_id = ? " : "")
                        + "ORDER BY r.score DESC, r.req_id DESC LIMIT 500",
                userId == null && deptId == null
                        ? new Object[]{code}
                        : (deptId != null && userId != null ? new Object[]{code, deptId, userId}
                        : (deptId != null ? new Object[]{code, deptId} : new Object[]{code, userId})));

        Map<String, RdmScoreVO.Person> persons = new LinkedHashMap<>();
        Map<String, RdmScoreVO.DeptRow> depts = new LinkedHashMap<>();
        double totalScore = 0;
        int onTimeCount = 0;
        for (Map<String, Object> row : rows) {
            RdmScoreVO.Record record = recordFrom(row);
            board.getRecords().add(record);
            totalScore += record.score.doubleValue();
            if (Integer.valueOf(1).equals(record.onTime)) {
                onTimeCount++;
            }
            RdmScoreVO.Person person = persons.computeIfAbsent(record.userName, k -> {
                RdmScoreVO.Person p = new RdmScoreVO.Person();
                p.setUserId(record.userId);
                p.setUserName(record.userName);
                p.setEmpNo(record.empNo);
                p.setDeptName(record.deptName);
                p.setPeriodCode(code);
                return p;
            });
            person.totalScore = person.totalScore.add(record.score);
            person.reqCount++;
            person.reworkCount += record.reworkCount == null ? 0 : record.reworkCount;
            if (record.breakdown != null) {
                person.scoreSum = person.scoreSum.add(record.score);
            }
            String deptKey = record.deptName == null ? "未填部門" : record.deptName;
            RdmScoreVO.DeptRow dept = depts.computeIfAbsent(deptKey, k -> {
                RdmScoreVO.DeptRow d = new RdmScoreVO.DeptRow();
                d.deptName = deptKey;
                d.personSet = new java.util.HashSet<>();
                return d;
            });
            dept.totalScore = dept.totalScore.add(record.score);
            dept.personSet.add(record.userName);
        }
        for (RdmScoreVO.Person p : persons.values()) {
            board.getRanking().add(p);
        }
        board.getRanking().sort((a, b) -> b.totalScore.compareTo(a.totalScore));
        for (RdmScoreVO.DeptRow d : depts.values()) {
            d.personCount = d.personSet.size();
            d.avgScore = d.personCount == 0 ? BigDecimal.ZERO
                    : d.totalScore.divide(BigDecimal.valueOf(d.personCount), 2, java.math.RoundingMode.HALF_UP);
            board.getDeptRank().add(d);
        }
        board.getDeptRank().sort((a, b) -> b.totalScore.compareTo(a.totalScore));

        RdmScoreVO.Summary summary = board.getSummary();
        summary.setPersonCount(persons.size());
        summary.setTotalScore(round2(totalScore));
        summary.setAvgScore(persons.isEmpty() ? BigDecimal.ZERO
                : round2(totalScore / persons.size()));
        summary.setDeliveredCount(rows.size());
        summary.setOnTimeRate(rows.isEmpty() ? BigDecimal.ZERO
                : round2(onTimeCount / (double) rows.size()));
        summary.setFirstPassRate(rate("SELECT COALESCE(SUM(CASE WHEN first_pass = 1 THEN 1 ELSE 0 END), 0) * 1.0 / COUNT(*) "
                + "FROM rdm_score_record WHERE deleted = 0 AND period_code = ?", code));
        summary.setReworkTotal(jdbcTemplate.queryForObject(
                "SELECT COALESCE(SUM(rework_count), 0) FROM rdm_score_record WHERE deleted = 0 AND period_code = ?",
                Integer.class, code));
        summary.setPushedCount(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM rdm_score_record WHERE deleted = 0 AND period_code = ? AND push_status <> ?",
                Integer.class, code, RdmConstants.PUSH_NONE));
        board.setCycles(cycles());
        return board;
    }

    /** 单条试算（不落库），供规则页「用真实需求试算」 */
    public RdmScoreVO.Record preview(Long reqId, String roleCode, Long userId) {
        RdmRequirement req = reqId == null ? null : requirementMapper.selectById(reqId);
        if (req == null) {
            throw new BusinessException("需求不存在或已刪除");
        }
        RdmScoreRule rule = currentRule();
        if (rule == null) {
            throw new BusinessException("還沒有任何積分規則，無法試算");
        }
        String role = StringUtils.hasText(roleCode) ? roleCode : RdmConstants.ROLE_PM;
        boolean onTime = req.getPlanReleaseDate() == null || req.getActualReleaseDate() == null
                || !req.getActualReleaseDate().isAfter(req.getPlanReleaseDate());
        Result result = RdmScoreCalculator.compute(new Input(role, req.getComplexity(), req.getReqType(),
                req.getPriority(), onTime, 0, nz(req.getReworkCount()), nz(req.getReopenCount()),
                req.getAcceptanceScore(), !hasFailAcceptance(req.getId()), 0), toParams(rule));

        RdmScoreVO.Record vo = new RdmScoreVO.Record();
        vo.reqId = req.getId();
        vo.reqNo = req.getReqNo();
        vo.reqTitle = req.getTitle();
        vo.roleCode = role;
        vo.userId = userId == null ? (req.getAssigneePmUserId() == null ? 0L : req.getAssigneePmUserId()) : userId;
        vo.userName = req.getAssigneePmName();
        vo.score = result.finalScore();
        vo.breakdown = breakdownOf(result);
        vo.ruleVersion = rule.getVersion();
        vo.onTime = onTime ? 1 : 0;
        vo.reworkCount = nz(req.getReworkCount());
        vo.acceptanceScore = req.getAcceptanceScore();
        vo.pushStatus = RdmConstants.PUSH_NONE;
        return vo;
    }

    /** 效能量趋势（读日快照，绝不实时算，避免历史数字被后续修订改写） */
    public List<RdmScoreVO.MetricPoint> trend(String dim, Integer days, LocalDate startDate, LocalDate endDate, Long dimId) {
        LocalDate end = endDate == null ? LocalDate.now() : endDate;
        LocalDate start = startDate == null ? end.minusDays(days == null ? 29 : Math.max(days - 1, 0)) : startDate;
        String dimension = StringUtils.hasText(dim) ? dim : RdmConstants.DIM_COMPANY;
        // COMPANY 快照的 dim_id 是 0 占位（写入端同一口径），这里用 IS NULL 会直接查空
        Long storedDimId = RdmConstants.DIM_COMPANY.equals(dimension) ? RdmConstants.COMPANY_DIM_ID : dimId;
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT * FROM rdm_metric_snapshot WHERE deleted = 0 AND dim_type = ? "
                        + "AND stat_date >= ? AND stat_date <= ? "
                        + (storedDimId == null ? "AND dim_id IS NULL " : "AND dim_id = ? ")
                        + "ORDER BY stat_date LIMIT 400",
                storedDimId == null ? new Object[]{dimension, start, end} : new Object[]{dimension, start, end, storedDimId});
        List<RdmScoreVO.MetricPoint> list = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            list.add(metricFrom(row));
        }
        return list;
    }

    /**
     * 推送建议值到绩效考核单。
     * <p>只写 suggested_* 通道并按人员匹配当前周期的考核单，评分与校准仍由 HR 完成；
     * 没有任何 RDM 指标行的考核单不会被静默创建条目（那等于替 HR 决定考核结构）。
     */
    @Transactional(rollbackFor = Exception.class)
    public int pushToPerf(String periodCode) {
        Map<String, Object> period = resolvePeriod(periodCode);
        String code = (String) period.get("code");
        String signature = operatorResolver.operatorSignature(operatorResolver.currentUser());
        int updated = jdbcTemplate.update(
                "UPDATE hr_perf_score_item si "
                        + "JOIN hr_perf_assessment a ON a.id = si.assessment_id AND a.deleted = 0 "
                        + "JOIN hr_perf_plan p ON p.id = a.plan_id AND p.deleted = 0 "
                        + "JOIN hr_perf_cycle c ON c.id = p.cycle_id AND c.deleted = 0 "
                        + "JOIN hr_perf_indicator i ON i.id = si.indicator_id AND i.deleted = 0 "
                        + "AND i.indicator_type = " + quoted(RdmConstants.INDICATOR_TYPE_RDM_OUTPUT) + " "
                        + "JOIN (SELECT user_id, SUM(score) AS total FROM rdm_score_record "
                        + "      WHERE deleted = 0 AND period_code = " + quoted(code) + " GROUP BY user_id) s "
                        + "  ON s.user_id = a.user_id "
                        + "SET si.suggested_score = s.total, si.suggested_source = "
                        + quoted(RdmConstants.SUGGEST_SOURCE_RDM) + ", si.suggested_at = NOW(), si.updated_by = "
                        + quoted(signature) + " "
                        + "WHERE si.deleted = 0 AND c.code = " + quoted(code));
        jdbcTemplate.update("UPDATE rdm_score_record SET push_status = ?, pushed_at = NOW(), updated_by = ? "
                + "WHERE deleted = 0 AND period_code = ? AND push_status = ?",
                RdmConstants.PUSH_SUGGESTED, signature, code, RdmConstants.PUSH_NONE);
        log.info("RDM 產出積分已推送績效建議值: period={}, scoreItem 更新 {} 條", code, updated);
        if (updated == 0) {
            throw new BusinessException("該周期沒有匹配到 RDM 產出指標（" + RdmConstants.INDICATOR_TYPE_RDM_OUTPUT
                    + "）的考核單，請先在績效模板中新增該指標");
        }
        return updated;
    }

    /* ==================== 辅助 ==================== */

    /** 周期解析：给了编码按编码查，否则取最近一个已发布周期 */
    private Map<String, Object> resolvePeriod(String periodCode) {
        List<Map<String, Object>> rows = StringUtils.hasText(periodCode)
                ? jdbcTemplate.queryForList("SELECT code, name, period_start, period_end FROM hr_perf_cycle "
                + "WHERE deleted = 0 AND code = ? LIMIT 1", periodCode)
                : jdbcTemplate.queryForList("SELECT code, name, period_start, period_end FROM hr_perf_cycle "
                + "WHERE deleted = 0 AND status = 'published' ORDER BY period_start DESC LIMIT 1");
        if (rows.isEmpty()) {
            throw new BusinessException(StringUtils.hasText(periodCode)
                    ? "績效周期不存在: " + periodCode : "還沒有可用的績效周期");
        }
        return rows.get(0);
    }

    /** 周期列表（下拉用） */
    public List<Map<String, Object>> cycles() {
        return jdbcTemplate.queryForList("SELECT code, name, period_start AS startDate, period_end AS endDate, status "
                + "FROM hr_perf_cycle WHERE deleted = 0 ORDER BY period_start DESC LIMIT 20");
    }

    private Params toParams(RdmScoreRule rule) {
        Params d = RdmScoreCalculator.defaultParams();
        return new Params(
                dbl(rule.getUnitScore(), d.unitScore()),
                dbl(rule.getOnTimeBonus(), d.onTimeBonus()),
                dbl(rule.getLatePenalty(), d.latePenalty()),
                dbl(rule.getFirstPassBonus(), d.firstPassBonus()),
                dbl(rule.getReworkPenalty(), d.reworkPenalty()),
                dbl(rule.getReopenPenalty(), d.reopenPenalty()),
                dbl(rule.getAcceptanceFactor(), d.acceptanceFactor()),
                dbl(rule.getQualityFloor(), d.qualityFloor()),
                StringUtils.hasText(rule.getAllocMode()) ? rule.getAllocMode() : d.allocMode());
    }

    private void applyForm(RdmScoreRule target, RdmScoreDTO.Rule form) {
        target.setRuleCode(form.getRuleCode().trim());
        target.setReqType(blankToNull(form.getReqType()));
        target.setRoleCode(blankToNull(form.getRoleCode()));
        target.setPriorityBonus(bd(form.getPriorityBonus()));
        target.setOnTimeBonus(bd(form.getOnTimeBonus()));
        target.setLatePenalty(bd(form.getLatePenalty()));
        target.setFirstPassBonus(bd(form.getFirstPassBonus()));
        target.setReworkPenalty(bd(form.getReworkPenalty()));
        target.setReopenPenalty(bd(form.getReopenPenalty()));
        target.setAcceptanceFactor(bd(form.getAcceptanceFactor()));
        target.setQualityFloor(bd(form.getQualityFloor()));
        target.setUnitScore(bd(form.getUnitScore()));
        target.setAllocMode(StringUtils.hasText(form.getAllocMode()) ? form.getAllocMode() : RdmConstants.ALLOC_EACH);
        target.setMaxScorableRoles(form.getMaxScorableRoles() == null || form.getMaxScorableRoles() <= 0
                ? 6 : form.getMaxScorableRoles());
        target.setRemark(form.getRemark());
        if (StringUtils.hasText(form.getEffectiveFrom())) {
            target.setEffectiveFrom(LocalDate.parse(form.getEffectiveFrom().trim()));
        }
        if (form.getEnabled() != null) {
            target.setEnabled(form.getEnabled() ? 1 : 0);
        } else if (target.getEnabled() == null) {
            target.setEnabled(0);
        }
    }

    private RdmScoreVO.Rule toRuleVO(RdmScoreRule rule) {
        RdmScoreVO.Rule vo = new RdmScoreVO.Rule();
        vo.setId(rule.getId());
        vo.setRuleCode(rule.getRuleCode());
        vo.setReqType(rule.getReqType());
        vo.setRoleCode(rule.getRoleCode());
        vo.setPriorityBonus(rule.getPriorityBonus());
        vo.setOnTimeBonus(rule.getOnTimeBonus());
        vo.setLatePenalty(rule.getLatePenalty());
        vo.setFirstPassBonus(rule.getFirstPassBonus());
        vo.setReworkPenalty(rule.getReworkPenalty());
        vo.setReopenPenalty(rule.getReopenPenalty());
        vo.setAcceptanceFactor(rule.getAcceptanceFactor());
        vo.setQualityFloor(rule.getQualityFloor());
        vo.setUnitScore(rule.getUnitScore());
        vo.setAllocMode(rule.getAllocMode());
        vo.setMaxScorableRoles(rule.getMaxScorableRoles());
        vo.setVersion(rule.getVersion());
        vo.setEffectiveFrom(rule.getEffectiveFrom() == null ? null : rule.getEffectiveFrom().format(DAY));
        vo.setEnabled(Integer.valueOf(1).equals(rule.getEnabled()));
        vo.setRemark(rule.getRemark());
        vo.setUpdatedBy(rule.getUpdatedBy());
        vo.setUpdatedAt(rule.getUpdatedAt() == null ? null : rule.getUpdatedAt().toString());
        return vo;
    }

    private RdmScoreVO.Record recordFrom(Map<String, Object> row) {
        RdmScoreVO.Record vo = new RdmScoreVO.Record();
        vo.id = asLong(row.get("id"));
        vo.reqId = asLong(row.get("req_id"));
        vo.reqNo = (String) row.get("req_no");
        vo.reqTitle = (String) row.get("req_title");
        vo.userId = asLong(row.get("user_id"));
        vo.userName = (String) row.get("user_name");
        vo.empNo = (String) row.get("emp_no");
        vo.deptName = (String) row.get("dept_name");
        vo.roleCode = (String) row.get("role_code");
        vo.reqType = (String) row.get("req_type");
        vo.priority = (String) row.get("priority");
        vo.complexity = (String) row.get("complexity");
        vo.periodCode = (String) row.get("period_code");
        vo.score = decimal(row.get("score"));
        vo.ruleVersion = row.get("rule_version") == null ? null : asLong(row.get("rule_version")).intValue();
        vo.onTime = row.get("on_time") == null ? null : asLong(row.get("on_time")).intValue();
        vo.reworkCount = row.get("rework_count") == null ? null : asLong(row.get("rework_count")).intValue();
        vo.acceptanceScore = row.get("acceptance_score") == null ? null : asLong(row.get("acceptance_score")).intValue();
        vo.pushStatus = (String) row.get("push_status");
        vo.breakdown = parseBreakdown((String) row.get("breakdown_json"));
        return vo;
    }

    private RdmScoreVO.MetricPoint metricFrom(Map<String, Object> row) {
        RdmScoreVO.MetricPoint vo = new RdmScoreVO.MetricPoint();
        vo.setStatDate(str(row.get("stat_date")));
        vo.setDimId(row.get("dim_id") == null ? null : asLong(row.get("dim_id")));
        vo.setDimName((String) row.get("dim_name"));
        vo.setReqTotal(intOf(row.get("req_total")));
        vo.setSubmitted(intOf(row.get("submitted")));
        vo.setAccepted(intOf(row.get("accepted")));
        vo.setReleased(intOf(row.get("released")));
        vo.setOverdue(intOf(row.get("overdue")));
        vo.setAvgResponseHours(decimal(row.get("avg_response_hours")));
        vo.setAvgDeliveryDays(decimal(row.get("avg_delivery_days")));
        vo.setOnTimeRate(decimal(row.get("on_time_rate")));
        vo.setRejectRate(decimal(row.get("reject_rate")));
        vo.setFirstPassRate(decimal(row.get("first_pass_rate")));
        vo.setReworkCount(intOf(row.get("rework_count")));
        vo.setChangeCount(intOf(row.get("change_count")));
        return vo;
    }

    /** 是否曾经验收退回（决定 firstPass） */
    private boolean hasFailAcceptance(Long reqId) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM rdm_acceptance WHERE deleted = 0 AND result = ? AND req_id = ?",
                Integer.class, RdmConstants.ACCEPT_FAIL, reqId);
        return count != null && count > 0;
    }

    private String toJson(Result result) {
        try {
            return JSON.writeValueAsString(breakdownOf(result));
        } catch (Exception e) {
            // 不吞异常：明细存不下就等于流水不可解释，宁可失败回滚
            throw new BusinessException("積分成因序列化失敗: " + e.getMessage());
        }
    }

    private RdmScoreVO.Breakdown breakdownOf(Result result) {
        RdmScoreVO.Breakdown b = new RdmScoreVO.Breakdown();
        // 因子统一用 double（与前端 Number 对齐）；只有最终分用 BigDecimal 保住两位小数的精确值
        b.setBase(result.base());
        b.setTypeFactor(result.typeFactor());
        b.setPriorityFactor(result.priorityFactor());
        b.setOnTimeFactor(result.onTimeFactor());
        b.setQualityFactor(result.qualityFactor());
        b.setRoleFactor(result.roleFactor());
        b.setRawScore(result.rawScore());
        b.setFinalScore(result.finalScore());
        List<RdmScoreVO.Reason> reasons = new ArrayList<>();
        result.reasons().forEach(r -> {
            RdmScoreVO.Reason reason = new RdmScoreVO.Reason();
            reason.setCode(r.code());
            reason.setLabel(r.label());
            reason.setScore(bd(r.score()));
            reason.setMemo(r.memo());
            reasons.add(reason);
        });
        b.setReasons(reasons);
        return b;
    }

    @SuppressWarnings("unchecked")
    private RdmScoreVO.Breakdown parseBreakdown(String json) {
        if (!StringUtils.hasText(json)) {
            return null;
        }
        try {
            return JSON.readValue(json, RdmScoreVO.Breakdown.class);
        } catch (Exception e) {
            // 展示类字段：解不了不能阻断整个看板，但分数本身仍可用，留警告便于事后修数据
            log.warn("積分成因 JSON 解析失敗，僅展示分數: {}", e.getMessage());
            return null;
        }
    }

    private BigDecimal rate(String sql, String code) {
        Double value = jdbcTemplate.queryForObject(sql, Double.class, code);
        return value == null ? BigDecimal.ZERO : round2(value);
    }

    private static String quoted(String value) {
        // 仅用于内部枚举常量与已入库的周期编码，统一转义单引号避免拼接破坏语句
        return "'" + (value == null ? "" : value.replace("'", "''")) + "'";
    }

    private static BigDecimal round2(double value) {
        return BigDecimal.valueOf(value).setScale(2, java.math.RoundingMode.HALF_UP);
    }

    private static int nz(Integer value) {
        return value == null ? 0 : value;
    }

    private static boolean isTrue(String value) {
        return StringUtils.hasText(value) && !RdmConstants.ACCEPT_FAIL.equals(value);
    }

    private static String blankToNull(String value) {
        return StringUtils.hasText(value) ? value.trim() : null;
    }

    private static double dbl(BigDecimal value, double fallback) {
        return value == null ? fallback : value.doubleValue();
    }

    private static BigDecimal bd(double value) {
        return BigDecimal.valueOf(value).setScale(2, java.math.RoundingMode.HALF_UP);
    }

    private static BigDecimal bd(Integer value) {
        return value == null ? null : BigDecimal.valueOf(value);
    }

    private static BigDecimal bd(BigDecimal value) {
        return value;
    }

    private static BigDecimal decimal(Object value) {
        if (value == null) {
            return BigDecimal.ZERO;
        }
        return value instanceof BigDecimal bdValue ? bdValue : new BigDecimal(value.toString());
    }

    private static Long asLong(Object value) {
        return value == null ? null : ((Number) value).longValue();
    }

    private static Integer intOf(Object value) {
        return value == null ? 0 : ((Number) value).intValue();
    }

    private static String str(Object value) {
        return value == null ? null : String.valueOf(value);
    }

    private static LocalDate toLocalDate(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof LocalDate localDate) {
            return localDate;
        }
        if (value instanceof java.sql.Date sqlDate) {
            return sqlDate.toLocalDate();
        }
        return LocalDate.parse(String.valueOf(value));
    }

    static {
        // 计分角色集合与常量的一致性自检（防止有人改了角色常量却忘了同步计分口径）
        Set<String> required = Set.of(RdmConstants.ROLE_PM, RdmConstants.ROLE_DEV, RdmConstants.ROLE_QA,
                RdmConstants.ROLE_DESIGNER, RdmConstants.ROLE_DEV_LEAD);
        if (!RdmScoreCalculator.SCORABLE_ROLES.containsAll(required)) {
            throw new IllegalStateException("計分角色集合缺少必要角色，積分口径会漏人");
        }
    }
}
