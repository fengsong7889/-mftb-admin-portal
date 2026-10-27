package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.common.PermissionDeniedException;
import com.mftb.admin.constant.HrPerfConstants;
import com.mftb.admin.dto.HrPerfAppealSubmitDTO;
import com.mftb.admin.dto.HrPerfAppealVO;
import com.mftb.admin.dto.HrPerfAssessmentVO;
import com.mftb.admin.dto.HrPerfCalibrationLogVO;
import com.mftb.admin.dto.HrPerfReportVO;
import com.mftb.admin.dto.HrPerfTemplateSaveDTO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.HrPerfAppeal;
import com.mftb.admin.entity.HrPerfAssessment;
import com.mftb.admin.entity.HrPerfCalibrationLog;
import com.mftb.admin.entity.HrPerfCycle;
import com.mftb.admin.entity.HrPerfPlan;
import com.mftb.admin.entity.HrPerfTemplate;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.HrPerfAppealMapper;
import com.mftb.admin.mapper.HrPerfAssessmentMapper;
import com.mftb.admin.mapper.HrPerfCalibrationLogMapper;
import com.mftb.admin.mapper.HrPerfCycleMapper;
import com.mftb.admin.mapper.HrPerfPlanMapper;
import com.mftb.admin.mapper.HrPerfTemplateMapper;
import com.mftb.admin.service.HrPerfReportService;
import com.mftb.admin.service.PermissionService;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.HrPerfGradeUtils;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 績效台账服务实现（M2）。
 * <p>
 * 三条硬口径：
 * 1) 留痕只增不改，且存操作人 ID + 姓名/部门快照，事后改名调岗也指得回当时事实；
 * 2) 强制分布是软校验——超编只拦「未声明例外」的提交，例外必须写理由并入留痕，
 *    否则三五人的小部门会因为「S 占 10%」永远凑不出整数而提交不了；
 * 3) 台账只统计已确认结果，且建议占比只在单计划口径下给出（跨计划模板不同，平均占比没有意义）。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class HrPerfReportServiceImpl implements HrPerfReportService {

    private static final int SCORE_SCALE = 2;
    private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);

    private final HrPerfCalibrationLogMapper logMapper;
    private final HrPerfAppealMapper appealMapper;
    private final HrPerfAssessmentMapper assessmentMapper;
    private final HrPerfPlanMapper planMapper;
    private final HrPerfCycleMapper cycleMapper;
    private final HrPerfTemplateMapper templateMapper;
    private final OperatorResolver operatorResolver;
    private final PermissionService permissionService;
    private final BizSeqService bizSeqService;

    // ==================== 留痕 ====================

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void logCalibration(HrPerfAssessment a, String action, BigDecimal beforeScore, String beforeGrade,
                               BigDecimal afterScore, String afterGrade, String reason, Long appealId) {
        if (a == null || a.getId() == null) {
            throw new BusinessException("改判留痕缺少考核單，拒絕寫入");
        }
        HrPerfCalibrationLog row = baseLog(a, action, reason);
        row.setBeforeScore(beforeScore);
        row.setBeforeGrade(blankToNull(beforeGrade));
        row.setAfterScore(afterScore);
        row.setAfterGrade(blankToNull(afterGrade));
        row.setRefAppealId(appealId);
        logMapper.insert(row);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void logDistributionWaiver(HrPerfPlan plan, String reason) {
        if (plan == null || plan.getId() == null) {
            throw new BusinessException("例外放行缺少計劃，拒絕寫入");
        }
        if (!StringUtils.hasText(reason)) {
            throw new BusinessException("強制分佈例外放行必須填寫理由");
        }
        SysUser me = currentUser();
        HrPerfCalibrationLog row = new HrPerfCalibrationLog();
        // 例外放行是计划级动作：没有具体考核单，assessment_id/user_id 留空，追责靠 plan_id + 操作人
        row.setPlanId(plan.getId());
        row.setAction(HrPerfConstants.LOG_DISTRIBUTION_WAIVER);
        row.setReason(reason.trim());
        row.setOperatorUserId(me == null ? null : me.getId());
        row.setOperatorName(operatorResolver.currentOperatorName());
        row.setCreatedBy(operatorResolver.currentOperatorName());
        row.setUpdatedBy(operatorResolver.currentOperatorName());
        row.setDeleted(0);
        logMapper.insert(row);
        log.info("強制分佈例外放行已留痕: plan={}, 理由={}", plan.getReqNo(), reason.trim());
    }

    @Override
    public PageResult<HrPerfCalibrationLogVO> pageLogs(long page, long size, Long planId, Long assessmentId,
                                                      String action, String keyword) {
        requireAnyAuditView();
        LambdaQueryWrapper<HrPerfCalibrationLog> wrapper = new LambdaQueryWrapper<HrPerfCalibrationLog>()
                .eq(planId != null, HrPerfCalibrationLog::getPlanId, planId)
                .eq(assessmentId != null, HrPerfCalibrationLog::getAssessmentId, assessmentId)
                .eq(StringUtils.hasText(action), HrPerfCalibrationLog::getAction, action)
                .orderByDesc(HrPerfCalibrationLog::getId);
        if (StringUtils.hasText(keyword)) {
            String kw = keyword.trim();
            wrapper.and(w -> w.like(HrPerfCalibrationLog::getEmpName, kw)
                    .or().like(HrPerfCalibrationLog::getEmpNo, kw)
                    .or().like(HrPerfCalibrationLog::getOperatorName, kw));
        }
        Page<HrPerfCalibrationLog> result = logMapper.selectPage(paged(page, size), wrapper);
        List<HrPerfCalibrationLogVO> records = result.getRecords().stream()
                .map(HrPerfCalibrationLogVO::from).collect(Collectors.toList());
        attachPlanNames(records);
        return new PageResult<>(records, result.getTotal());
    }

    @Override
    public List<HrPerfCalibrationLogVO> logsOfAssessment(Long assessmentId) {
        // 留痕含上级评分与最终结果，员工侧不从本接口取（自助页只展示自己的申诉单）
        if (!has(HrPerfConstants.MENU_AUDIT, "view") && !has(HrPerfConstants.MENU_CALIBRATION, "view")
                && !has(HrPerfConstants.MENU_LEDGER, "view")) {
            throw PermissionDeniedException.outOfDataScope("他人的考核改判留痕");
        }
        List<HrPerfCalibrationLogVO> records = logMapper.selectList(new LambdaQueryWrapper<HrPerfCalibrationLog>()
                        .eq(HrPerfCalibrationLog::getAssessmentId, assessmentId)
                        .orderByAsc(HrPerfCalibrationLog::getId))
                .stream().map(HrPerfCalibrationLogVO::from).collect(Collectors.toList());
        attachPlanNames(records);
        return records;
    }

    // ==================== 强制分布 ====================

    @Override
    public List<HrPerfReportVO.GradeCount> distributionGap(Long planId) {
        HrPerfPlan plan = requirePlan(planId);
        List<HrPerfTemplateSaveDTO.GradeRule> grades = HrPerfGradeUtils.parse(templateSchemeOf(plan));
        List<HrPerfTemplateSaveDTO.GradeRule> suggested = grades.stream()
                .filter(g -> g.getRatio() != null && g.getRatio() > 0).toList();
        if (suggested.isEmpty()) {
            return List.of();
        }
        List<HrPerfAssessment> rows = assessmentMapper.selectList(new LambdaQueryWrapper<HrPerfAssessment>()
                .eq(HrPerfAssessment::getPlanId, planId));
        if (rows.isEmpty()) {
            return List.of();
        }
        int total = rows.size();
        Map<String, Integer> counts = new HashMap<>();
        for (HrPerfAssessment a : rows) {
            String grade = expectedGrade(a, grades);
            if (grade != null) {
                counts.merge(grade, 1, Integer::sum);
            }
        }
        List<HrPerfReportVO.GradeCount> gap = new ArrayList<>();
        for (HrPerfTemplateSaveDTO.GradeRule g : suggested) {
            int count = counts.getOrDefault(g.getCode(), 0);
            // 建议占比按上限理解，且向上取整：向下取整会让小部门永远无法达标
            // （1 人部门配 90% 的 A，floor 得 0，相当于制度上禁止给任何人 A 等）
            int allowed = (int) Math.ceil(total * g.getRatio() / 100.0);
            if (count > allowed) {
                HrPerfReportVO.GradeCount item = gradeCount(g.getCode(), count, total, g.getRatio(),
                        "超出建議佔比上限 " + (count - allowed) + " 人（上限 " + allowed + " 人）");
                // 同时给结构化数值：前端要标红/算差值，不该去解析中文描述
                item.setAllowedCount(allowed);
                item.setOverCount(count - allowed);
                gap.add(item);
            }
        }
        return gap;
    }

    @Override
    public boolean distributionSatisfied(Long planId) {
        return distributionGap(planId).isEmpty();
    }

    // ==================== 申诉 ====================

    @Override
    @Transactional(rollbackFor = Exception.class)
    public HrPerfAppealVO submitAppeal(Long assessmentId, HrPerfAppealSubmitDTO dto) {
        require(HrPerfConstants.MENU_SELF, "create");
        if (dto == null || !StringUtils.hasText(dto.getReason())) {
            throw new BusinessException("請填寫申訴理由");
        }
        HrPerfAssessment a = requireAssessment(assessmentId);
        Long me = currentUserId();
        if (!Objects.equals(a.getUserId(), me)) {
            throw PermissionDeniedException.outOfDataScope("他人的考核結果");
        }
        if (!HrPerfConstants.A_CONFIRMED.equals(a.getStatus())) {
            throw new BusinessException("結果尚未確認，暫無可申訴的對象");
        }
        Long open = appealMapper.selectCount(new LambdaQueryWrapper<HrPerfAppeal>()
                .eq(HrPerfAppeal::getAssessmentId, assessmentId)
                .in(HrPerfAppeal::getStatus, HrPerfConstants.APPEAL_OPEN_STATUSES));
        if (open != null && open > 0) {
            throw new BusinessException("該考核單已有待處理的申訴，請等待人事受理");
        }
        HrPerfAppeal entity = new HrPerfAppeal();
        entity.setReqNo(bizSeqService.next(HrPerfConstants.SEQ_APPEAL));
        entity.setAssessmentId(a.getId());
        entity.setPlanId(a.getPlanId());
        entity.setUserId(a.getUserId());
        entity.setEmpNo(a.getEmpNo());
        entity.setEmpName(a.getEmpName());
        entity.setDeptName(a.getDeptName());
        HrPerfPlan plan = a.getPlanId() == null ? null : planMapper.selectById(a.getPlanId());
        entity.setPlanName(plan == null ? null : plan.getName());
        entity.setReason(dto.getReason().trim());
        entity.setExpectation(trim(dto.getExpectation()));
        entity.setStatus(HrPerfConstants.APPEAL_PENDING);
        entity.setCreatedBy(operatorResolver.currentOperatorName());
        entity.setUpdatedBy(operatorResolver.currentOperatorName());
        entity.setDeleted(0);
        appealMapper.insert(entity);
        log.info("績效申訴已登記: reqNo={}, assessment={}, 申訴人={}", entity.getReqNo(), a.getReqNo(), entity.getEmpName());
        return toVO(entity, a);
    }

    @Override
    public PageResult<HrPerfAppealVO> pageMyAppeals(long page, long size, String status) {
        require(HrPerfConstants.MENU_SELF, "view");
        LambdaQueryWrapper<HrPerfAppeal> wrapper = new LambdaQueryWrapper<HrPerfAppeal>()
                .eq(HrPerfAppeal::getUserId, currentUserId())
                .eq(StringUtils.hasText(status), HrPerfAppeal::getStatus, status)
                .orderByDesc(HrPerfAppeal::getId);
        return pageAppealsInternal(wrapper, page, size);
    }

    @Override
    public PageResult<HrPerfAppealVO> pageAppeals(long page, long size, Long planId, String status, String keyword) {
        require(HrPerfConstants.MENU_APPEAL, "view");
        LambdaQueryWrapper<HrPerfAppeal> wrapper = new LambdaQueryWrapper<HrPerfAppeal>()
                .eq(planId != null, HrPerfAppeal::getPlanId, planId)
                .eq(StringUtils.hasText(status), HrPerfAppeal::getStatus, status)
                .orderByDesc(HrPerfAppeal::getId);
        if (StringUtils.hasText(keyword)) {
            String kw = keyword.trim();
            wrapper.and(w -> w.like(HrPerfAppeal::getEmpName, kw)
                    .or().like(HrPerfAppeal::getEmpNo, kw)
                    .or().like(HrPerfAppeal::getReqNo, kw));
        }
        return pageAppealsInternal(wrapper, page, size);
    }

    @Override
    public HrPerfAppealVO getAppeal(Long id) {
        HrPerfAppeal entity = requireAppeal(id);
        boolean hr = has(HrPerfConstants.MENU_APPEAL, "view");
        if (!hr && !Objects.equals(entity.getUserId(), currentUserId())) {
            throw PermissionDeniedException.outOfDataScope("他人的申訴單");
        }
        if (!hr) {
            require(HrPerfConstants.MENU_SELF, "view");
        }
        return toVO(entity, entity.getAssessmentId() == null ? null : assessmentMapper.selectById(entity.getAssessmentId()));
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public HrPerfAppealVO handleAppeal(Long id, String status, String conclusion) {
        require(HrPerfConstants.MENU_APPEAL, "edit");
        if (!HrPerfConstants.isValidAppealStatus(status)) {
            throw new BusinessException("無效的申訴狀態: " + status);
        }
        HrPerfAppeal entity = requireAppeal(id);
        if (!HrPerfConstants.APPEAL_OPEN_STATUSES.contains(entity.getStatus())) {
            throw new BusinessException("該申訴已辦結，不能再變更狀態");
        }
        boolean terminal = HrPerfConstants.APPEAL_RESOLVED.equals(status)
                || HrPerfConstants.APPEAL_REJECTED.equals(status);
        if (terminal && !StringUtils.hasText(conclusion)) {
            throw new BusinessException("辦結或駁回必須填寫處理結論");
        }
        entity.setStatus(status);
        entity.setConclusion(trim(conclusion));
        entity.setHandlerUserId(currentUserId());
        entity.setHandlerName(operatorResolver.currentOperatorName());
        if (terminal) {
            entity.setHandledAt(LocalDateTime.now());
        }
        entity.setUpdatedBy(operatorResolver.currentOperatorName());
        entity.setUpdatedAt(LocalDateTime.now());
        appealMapper.updateById(entity);
        return toVO(entity, entity.getAssessmentId() == null ? null : assessmentMapper.selectById(entity.getAssessmentId()));
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public HrPerfAppealVO reviseFromAppeal(Long id, BigDecimal score, String grade, String reason) {
        require(HrPerfConstants.MENU_APPEAL, "edit");
        if (!StringUtils.hasText(reason)) {
            throw new BusinessException("修訂結果必須填寫理由");
        }
        if (score == null && !StringUtils.hasText(grade)) {
            throw new BusinessException("請填寫修訂後的得分或等級");
        }
        HrPerfAppeal appeal = requireAppeal(id);
        if (!HrPerfConstants.APPEAL_OPEN_STATUSES.contains(appeal.getStatus())) {
            throw new BusinessException("該申訴已辦結，不能再次修訂結果");
        }
        HrPerfAssessment a = requireAssessment(appeal.getAssessmentId());
        if (!HrPerfConstants.A_CONFIRMED.equals(a.getStatus())) {
            throw new BusinessException("該考核單結果尚未確認，無需用申訴修訂");
        }
        if (score != null && (score.compareTo(BigDecimal.ZERO) < 0
                || score.compareTo(BigDecimal.valueOf(HrPerfConstants.INDICATOR_SCORE_MAX)) > 0)) {
            throw new BusinessException("修訂得分必須在 0–" + HrPerfConstants.INDICATOR_SCORE_MAX + " 之间");
        }
        HrPerfPlan plan = requirePlan(a.getPlanId());
        List<HrPerfTemplateSaveDTO.GradeRule> grades = HrPerfGradeUtils.parse(templateSchemeOf(plan));
        String finalGrade;
        if (StringUtils.hasText(grade)) {
            if (!HrPerfGradeUtils.codes(grades).contains(grade.trim())) {
                throw new BusinessException("無效的等級: " + grade);
            }
            finalGrade = grade.trim();
        } else {
            finalGrade = null;
        }

        BigDecimal beforeScore = a.getFinalScore();
        String beforeGrade = a.getFinalGrade();
        LocalDateTime now = LocalDateTime.now();
        String operator = operatorResolver.currentOperatorName();
        if (score != null) {
            a.setCalibratedScore(score);
            a.setFinalScore(score);
        }
        if (finalGrade != null) {
            a.setCalibratedGrade(finalGrade);
            a.setFinalGrade(finalGrade);
        } else if (score != null) {
            // 只改分数没指定等级时按模板重新映射，避免出现「分数变了等级没变」的自相矛盾结果
            a.setFinalGrade(HrPerfGradeUtils.match(grades, score));
        }
        a.setCalibratedBy(operator);
        a.setCalibratedReason(reason.trim());
        a.setUpdatedBy(operator);
        a.setUpdatedAt(now);
        assessmentMapper.updateById(a);

        logCalibration(a, HrPerfConstants.LOG_APPEAL_REVISE, beforeScore, beforeGrade,
                a.getFinalScore(), a.getFinalGrade(), reason.trim(), appeal.getId());

        String conclusion = "已修訂結果為 " + nullSafe(a.getFinalScore()) + " 分 / "
                + (a.getFinalGrade() == null ? "未評等級" : a.getFinalGrade()) + " 等：" + reason.trim();
        appeal.setStatus(HrPerfConstants.APPEAL_RESOLVED);
        appeal.setConclusion(conclusion);
        appeal.setHandlerUserId(currentUserId());
        appeal.setHandlerName(operator);
        appeal.setHandledAt(now);
        appeal.setUpdatedBy(operator);
        appeal.setUpdatedAt(now);
        appealMapper.updateById(appeal);
        log.info("績效申訴已受理並修訂: appeal={}, assessment={}, {}→{}",
                appeal.getReqNo(), a.getReqNo(), beforeScore, a.getFinalScore());
        return toVO(appeal, a);
    }

    // ==================== 结果台账 ====================

    @Override
    public HrPerfReportVO report(Long cycleId, Long planId) {
        require(HrPerfConstants.MENU_LEDGER, "view");
        List<Long> planIds = resolvePlanIds(cycleId, planId);
        HrPerfReportVO vo = new HrPerfReportVO();
        if (planIds.isEmpty()) {
            vo.setHeadcount(0);
            vo.setPlanCount(0);
            vo.setGradeDistribution(List.of());
            vo.setDeptDistribution(List.of());
            vo.setTrend(List.of());
            vo.setHasSuggestedRatio(false);
            return vo;
        }
        List<HrPerfAssessment> rows = confirmedOfPlans(planIds);
        Map<Long, HrPerfPlan> plans = planMapper.selectBatchIds(planIds).stream()
                .collect(Collectors.toMap(HrPerfPlan::getId, p -> p, (a, b) -> a));
        Map<Long, List<HrPerfTemplateSaveDTO.GradeRule>> schemeByPlan = new HashMap<>();
        plans.forEach((id, p) -> schemeByPlan.put(id, HrPerfGradeUtils.parse(templateSchemeOf(p))));

        List<BigDecimal> scores = rows.stream().map(HrPerfAssessment::getFinalScore)
                .filter(Objects::nonNull).toList();
        vo.setHeadcount(rows.size());
        vo.setPlanCount((int) plans.values().stream().filter(p -> rows.stream()
                .anyMatch(r -> Objects.equals(r.getPlanId(), p.getId()))).count());
        vo.setAvgScore(average(scores));
        vo.setMaxScore(scores.stream().max(Comparator.naturalOrder()).orElse(null));
        vo.setMinScore(scores.stream().min(Comparator.naturalOrder()).orElse(null));

        // 建议占比只在单计划口径下有意义：跨计划模板不同时，平均占比是个假数
        boolean single = planId != null;
        vo.setHasSuggestedRatio(single && schemeByPlan.getOrDefault(planId, List.of()).stream()
                .anyMatch(g -> g.getRatio() != null && g.getRatio() > 0));
        vo.setGradeDistribution(buildGradeDistribution(rows, schemeByPlan, single ? planId : null));
        vo.setDeptDistribution(buildDeptDistribution(rows, schemeByPlan));
        vo.setTrend(buildTrend(rows, plans, schemeByPlan));
        return vo;
    }

    @Override
    public PageResult<HrPerfAssessmentVO> pageReportRows(long page, long size, Long cycleId, Long planId,
                                                        String deptName, String grade, String keyword) {
        require(HrPerfConstants.MENU_LEDGER, "view");
        List<Long> planIds = resolvePlanIds(cycleId, planId);
        if (planIds.isEmpty()) {
            return new PageResult<HrPerfAssessmentVO>(List.of(), 0L);
        }
        LambdaQueryWrapper<HrPerfAssessment> wrapper = confirmedWrapper(planIds)
                .eq(StringUtils.hasText(deptName), HrPerfAssessment::getDeptName, deptName)
                .eq(StringUtils.hasText(grade), HrPerfAssessment::getFinalGrade, grade)
                .orderByDesc(HrPerfAssessment::getId);
        if (StringUtils.hasText(keyword)) {
            String kw = keyword.trim();
            wrapper.and(w -> w.like(HrPerfAssessment::getEmpName, kw)
                    .or().like(HrPerfAssessment::getEmpNo, kw)
                    .or().like(HrPerfAssessment::getReqNo, kw));
        }
        Page<HrPerfAssessment> result = assessmentMapper.selectPage(paged(page, size), wrapper);
        List<HrPerfAssessmentVO> records = result.getRecords().stream()
                .map(HrPerfAssessmentVO::from).collect(Collectors.toList());
        attachAssessmentPlanNames(records);
        return new PageResult<>(records, result.getTotal());
    }

    @Override
    public List<String> reportDepartments(Long cycleId, Long planId) {
        require(HrPerfConstants.MENU_LEDGER, "view");
        List<Long> planIds = resolvePlanIds(cycleId, planId);
        if (planIds.isEmpty()) {
            return List.of();
        }
        // 台账筛部门要的是“真出过结果”的部门，拿全量部门列表会出现选了无数据的部门只能看空页
        return confirmedOfPlans(planIds).stream()
                .map(HrPerfAssessment::getDeptName)
                .filter(StringUtils::hasText)
                .distinct().sorted().toList();
    }

    @Override
    public long countReportRows(Long cycleId, Long planId) {
        require(HrPerfConstants.MENU_LEDGER, "view");
        List<Long> planIds = resolvePlanIds(cycleId, planId);
        if (planIds.isEmpty()) {
            return 0;
        }
        Long n = assessmentMapper.selectCount(confirmedWrapper(planIds));
        return n == null ? 0 : n;
    }

    // ==================== 内部：聚合 ====================

    private List<HrPerfReportVO.GradeCount> buildGradeDistribution(
            List<HrPerfAssessment> rows, Map<Long, List<HrPerfTemplateSaveDTO.GradeRule>> schemeByPlan,
            Long suggestFromPlan) {
        Map<String, Integer> counts = new LinkedHashMap<>();
        for (HrPerfAssessment a : rows) {
            String grade = effectiveGrade(a, schemeByPlan.getOrDefault(a.getPlanId(), List.of()));
            if (grade == null) {
                continue;
            }
            counts.merge(grade, 1, Integer::sum);
        }
        List<HrPerfTemplateSaveDTO.GradeRule> suggest = suggestFromPlan == null ? List.of()
                : schemeByPlan.getOrDefault(suggestFromPlan, List.of());
        Map<String, Integer> ratioByGrade = suggest.stream()
                .filter(g -> g.getRatio() != null && g.getRatio() > 0)
                .collect(Collectors.toMap(HrPerfTemplateSaveDTO.GradeRule::getCode,
                        HrPerfTemplateSaveDTO.GradeRule::getRatio, (a, b) -> a));
        List<String> order = orderedGrades(suggest, counts.keySet());
        List<HrPerfReportVO.GradeCount> list = new ArrayList<>();
        for (String grade : order) {
            int count = counts.getOrDefault(grade, 0);
            Integer ratio = ratioByGrade.get(grade);
            HrPerfReportVO.GradeCount item = gradeCount(grade, count, rows.size(), ratio, null);
            if (ratio != null) {
                int allowed = (int) Math.ceil(rows.size() * ratio / 100.0);
                item.setAllowedCount(allowed);
                item.setOverCount(Math.max(0, count - allowed));
            }
            list.add(item);
        }
        return list;
    }

    private List<HrPerfReportVO.DeptCount> buildDeptDistribution(
            List<HrPerfAssessment> rows, Map<Long, List<HrPerfTemplateSaveDTO.GradeRule>> schemeByPlan) {
        Map<String, List<HrPerfAssessment>> byDept = rows.stream()
                .collect(Collectors.groupingBy(a -> a.getDeptName() == null ? "未分配部門" : a.getDeptName()));
        List<HrPerfReportVO.DeptCount> list = new ArrayList<>();
        byDept.forEach((dept, group) -> {
            HrPerfReportVO.DeptCount item = new HrPerfReportVO.DeptCount();
            item.setDeptName(dept);
            item.setCount(group.size());
            item.setAvgScore(average(group.stream().map(HrPerfAssessment::getFinalScore)
                    .filter(Objects::nonNull).toList()));
            Set<String> grades = new LinkedHashSet<>();
            group.forEach(a -> {
                String grade = effectiveGrade(a, schemeByPlan.getOrDefault(a.getPlanId(), List.of()));
                if (grade != null) {
                    grades.add(grade);
                }
            });
            // “最优等级”按模板分值下限取最高者，而不是按字母顺序（S/A/B 不是自然序）
            item.setTopGrade(grades.stream()
                    .max(Comparator.comparingInt(g -> gradeFloor(schemeByPlan, g)))
                    .orElse(null));
            list.add(item);
        });
        list.sort(Comparator.comparing(HrPerfReportVO.DeptCount::getCount, Comparator.reverseOrder()));
        return list;
    }

    /** 等级在计内模板里的分值下限；模板未定义该等级时返回 -1（不参与“最优”竞争） */
    private static int gradeFloor(Map<Long, List<HrPerfTemplateSaveDTO.GradeRule>> schemeByPlan, String grade) {
        return schemeByPlan.values().stream().flatMap(List::stream)
                .filter(r -> Objects.equals(r.getCode(), grade) && r.getMinScore() != null)
                .mapToInt(HrPerfTemplateSaveDTO.GradeRule::getMinScore).max().orElse(-1);
    }

    private List<HrPerfReportVO.TrendPoint> buildTrend(
            List<HrPerfAssessment> rows, Map<Long, HrPerfPlan> plans,
            Map<Long, List<HrPerfTemplateSaveDTO.GradeRule>> schemeByPlan) {
        Map<Long, List<HrPerfAssessment>> byPlan = rows.stream()
                .filter(r -> r.getPlanId() != null)
                .collect(Collectors.groupingBy(HrPerfAssessment::getPlanId));
        List<HrPerfReportVO.TrendPoint> list = new ArrayList<>();
        byPlan.forEach((pid, group) -> {
            HrPerfPlan plan = plans.get(pid);
            HrPerfReportVO.TrendPoint point = new HrPerfReportVO.TrendPoint();
            point.setPlanId(pid);
            point.setPlanReqNo(plan == null ? null : plan.getReqNo());
            point.setPlanName(plan == null ? null : plan.getName());
            point.setCycleName(cycleNameOf(plan));
            point.setCount(group.size());
            point.setAvgScore(average(group.stream().map(HrPerfAssessment::getFinalScore)
                    .filter(Objects::nonNull).toList()));
            point.setGrades(buildGradeDistribution(group, schemeByPlan, null));
            list.add(point);
        });
        list.sort(Comparator.comparing(HrPerfReportVO.TrendPoint::getPlanId));
        return list;
    }

    /** 台账口径下的等级：已下发的 finalGrade 优先，缺失时按模板由 finalScore 映射 */
    private String effectiveGrade(HrPerfAssessment a, List<HrPerfTemplateSaveDTO.GradeRule> grades) {
        if (StringUtils.hasText(a.getFinalGrade())) {
            return a.getFinalGrade();
        }
        return HrPerfGradeUtils.match(grades, a.getFinalScore());
    }

    /** 提交审批口径下的“预计等级”：校准优先，其次按上级/自评加权分映射（此时还没有 final_*） */
    private String expectedGrade(HrPerfAssessment a, List<HrPerfTemplateSaveDTO.GradeRule> grades) {
        if (StringUtils.hasText(a.getCalibratedGrade())) {
            return a.getCalibratedGrade();
        }
        BigDecimal score = firstNonNull(a.getCalibratedScore(), a.getSupervisorScore(), a.getSelfScore());
        return HrPerfGradeUtils.match(grades, score);
    }

    private static BigDecimal firstNonNull(BigDecimal... values) {
        for (BigDecimal v : values) {
            if (v != null) {
                return v;
            }
        }
        return null;
    }

    // ==================== 内部：查询与校验 ====================

    private LambdaQueryWrapper<HrPerfAssessment> confirmedWrapper(List<Long> planIds) {
        return new LambdaQueryWrapper<HrPerfAssessment>()
                .in(HrPerfAssessment::getPlanId, planIds)
                .eq(HrPerfAssessment::getStatus, HrPerfConstants.A_CONFIRMED);
    }

    private List<HrPerfAssessment> confirmedOfPlans(List<Long> planIds) {
        return planIds.isEmpty() ? List.of() : assessmentMapper.selectList(confirmedWrapper(planIds));
    }

    /** 把周期/计划筛选统一解析成计划 id 集合；两者都不传表示全量（仅限已确认结果所在计划） */
    private List<Long> resolvePlanIds(Long cycleId, Long planId) {
        if (planId != null) {
            return planMapper.selectById(planId) == null ? List.of() : List.of(planId);
        }
        LambdaQueryWrapper<HrPerfPlan> wrapper = new LambdaQueryWrapper<HrPerfPlan>()
                .select(HrPerfPlan::getId);
        if (cycleId != null) {
            wrapper.eq(HrPerfPlan::getCycleId, cycleId);
        }
        return planMapper.selectList(wrapper).stream().map(HrPerfPlan::getId).toList();
    }

    private String templateSchemeOf(HrPerfPlan plan) {
        if (plan == null || plan.getTemplateId() == null) {
            return null;
        }
        HrPerfTemplate template = templateMapper.selectById(plan.getTemplateId());
        return template == null ? null : template.getGradeScheme();
    }

    private String cycleNameOf(HrPerfPlan plan) {
        if (plan == null || plan.getCycleId() == null) {
            return null;
        }
        HrPerfCycle cycle = cycleMapper.selectById(plan.getCycleId());
        return cycle == null ? null : cycle.getName();
    }

    private HrPerfPlan requirePlan(Long planId) {
        HrPerfPlan plan = planId == null ? null : planMapper.selectById(planId);
        if (plan == null) {
            throw new BusinessException("考核計劃不存在: " + planId);
        }
        return plan;
    }

    private HrPerfAssessment requireAssessment(Long id) {
        HrPerfAssessment a = id == null ? null : assessmentMapper.selectById(id);
        if (a == null) {
            throw new BusinessException("考核單不存在: " + id);
        }
        return a;
    }

    private HrPerfAppeal requireAppeal(Long id) {
        HrPerfAppeal entity = id == null ? null : appealMapper.selectById(id);
        if (entity == null) {
            throw new BusinessException("申訴單不存在: " + id);
        }
        return entity;
    }

    private HrPerfAppealVO toVO(HrPerfAppeal entity, HrPerfAssessment a) {
        HrPerfAppealVO vo = HrPerfAppealVO.from(entity);
        if (a != null) {
            vo.setFinalScore(a.getFinalScore());
            vo.setFinalGrade(a.getFinalGrade());
        }
        Long revised = entity.getId() == null ? null : logMapper.selectCount(
                new LambdaQueryWrapper<HrPerfCalibrationLog>()
                        .eq(HrPerfCalibrationLog::getRefAppealId, entity.getId())
                        .eq(HrPerfCalibrationLog::getAction, HrPerfConstants.LOG_APPEAL_REVISE));
        vo.setRevised(revised != null && revised > 0);
        return vo;
    }

    private HrPerfCalibrationLog baseLog(HrPerfAssessment a, String action, String reason) {
        SysUser me = currentUser();
        HrPerfCalibrationLog row = new HrPerfCalibrationLog();
        row.setAssessmentId(a.getId());
        row.setPlanId(a.getPlanId());
        row.setUserId(a.getUserId());
        row.setEmpNo(a.getEmpNo());
        row.setEmpName(a.getEmpName());
        row.setDeptName(a.getDeptName());
        row.setAction(action);
        row.setReason(trim(reason));
        row.setOperatorUserId(me == null ? null : me.getId());
        row.setOperatorName(operatorResolver.currentOperatorName());
        row.setCreatedBy(operatorResolver.currentOperatorName());
        row.setUpdatedBy(operatorResolver.currentOperatorName());
        row.setDeleted(0);
        return row;
    }

    private void attachPlanNames(List<HrPerfCalibrationLogVO> records) {
        Set<Long> ids = records.stream().map(HrPerfCalibrationLogVO::getPlanId)
                .filter(Objects::nonNull).collect(Collectors.toSet());
        if (ids.isEmpty()) {
            return;
        }
        Map<Long, String> names = planMapper.selectBatchIds(ids).stream()
                .collect(Collectors.toMap(HrPerfPlan::getId, HrPerfPlan::getName, (a, b) -> a));
        records.forEach(r -> r.setPlanName(names.get(r.getPlanId())));
    }

    private void attachAssessmentPlanNames(List<HrPerfAssessmentVO> records) {
        Set<Long> ids = records.stream().map(HrPerfAssessmentVO::getPlanId)
                .filter(Objects::nonNull).collect(Collectors.toSet());
        if (ids.isEmpty()) {
            return;
        }
        Map<Long, String> names = planMapper.selectBatchIds(ids).stream()
                .collect(Collectors.toMap(HrPerfPlan::getId, HrPerfPlan::getName, (a, b) -> a));
        records.forEach(r -> r.setPlanName(names.get(r.getPlanId())));
    }

    private PageResult<HrPerfAppealVO> pageAppealsInternal(LambdaQueryWrapper<HrPerfAppeal> wrapper,
                                                           long page, long size) {
        Page<HrPerfAppeal> result = appealMapper.selectPage(paged(page, size), wrapper);
        List<HrPerfAppealVO> records = result.getRecords().stream()
                .map(e -> toVO(e, e.getAssessmentId() == null ? null : assessmentMapper.selectById(e.getAssessmentId())))
                .toList();
        return new PageResult<>(records, result.getTotal());
    }

    // ==================== 内部：权限与小工具 ====================

    /** 留痕可见的三类 HR 入口任一即可；都不是则按数据范围拒绝，避免员工从审计口反推他人分数 */
    private void requireAnyAuditView() {
        if (has(HrPerfConstants.MENU_AUDIT, "view") || has(HrPerfConstants.MENU_LEDGER, "view")) {
            return;
        }
        require(HrPerfConstants.MENU_CALIBRATION, "view");
    }

    private SysUser currentUser() {
        return operatorResolver.currentUser();
    }

    private Long currentUserId() {
        SysUser me = currentUser();
        if (me == null) {
            throw new BusinessException("未獲取到登入用戶");
        }
        return me.getId();
    }

    private boolean has(String menuKey, String action) {
        SysUser me = currentUser();
        return me != null && permissionService.hasPermission(me, menuKey, action);
    }

    private void require(String menuKey, String action) {
        if (!has(menuKey, action)) {
            throw new PermissionDeniedException(menuKey, action);
        }
    }

    private static <T> Page<T> paged(long page, long size) {
        return new Page<>(page <= 0 ? 1 : page, size <= 0 ? 10 : size);
    }

    private static BigDecimal average(List<BigDecimal> values) {
        if (values == null || values.isEmpty()) {
            return null;
        }
        BigDecimal sum = values.stream().reduce(BigDecimal.ZERO, BigDecimal::add);
        return sum.divide(BigDecimal.valueOf(values.size()), SCORE_SCALE, RoundingMode.HALF_UP);
    }

    private HrPerfReportVO.GradeCount gradeCount(String grade, int count, int total,
                                                 Integer suggestRatio, String gapNote) {
        HrPerfReportVO.GradeCount item = new HrPerfReportVO.GradeCount();
        item.setGrade(grade);
        item.setCount(count);
        item.setSuggestRatio(suggestRatio);
        item.setGapNote(gapNote);
        item.setActualRatio(total <= 0 ? BigDecimal.ZERO
                : BigDecimal.valueOf(count).multiply(HUNDRED)
                        .divide(BigDecimal.valueOf(total), SCORE_SCALE, RoundingMode.HALF_UP));
        return item;
    }

    /** 等级展示顺序：优先按模板下限降序（S→D），模板外的等级附在后面 */
    private List<String> orderedGrades(List<HrPerfTemplateSaveDTO.GradeRule> scheme, Set<String> present) {
        List<String> ordered = HrPerfGradeUtils.sortedDesc(scheme).stream()
                .map(HrPerfTemplateSaveDTO.GradeRule::getCode).distinct().collect(Collectors.toList());
        present.stream().filter(g -> !ordered.contains(g)).sorted().forEach(ordered::add);
        return ordered;
    }

    private static String trim(String value) {
        return value == null ? null : (value.trim().isEmpty() ? null : value.trim());
    }

    private static String blankToNull(String value) {
        return StringUtils.hasText(value) ? value.trim() : null;
    }

    private static String nullSafe(Object value) {
        return value == null ? "-" : String.valueOf(value);
    }
}
