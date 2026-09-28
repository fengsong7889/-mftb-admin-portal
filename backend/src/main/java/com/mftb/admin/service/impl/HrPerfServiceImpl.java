package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.common.PermissionDeniedException;
import com.mftb.admin.constant.HrPerfConstants;
import com.mftb.admin.dto.HrPerfAssessmentVO;
import com.mftb.admin.dto.HrPerfCycleSaveDTO;
import com.mftb.admin.dto.HrPerfCycleVO;
import com.mftb.admin.dto.HrPerfPlanLaunchDTO;
import com.mftb.admin.dto.HrPerfPlanVO;
import com.mftb.admin.dto.HrPerfReportVO;
import com.mftb.admin.dto.HrPerfScoreSubmitDTO;
import com.mftb.admin.dto.HrPerfTemplateSaveDTO;
import com.mftb.admin.dto.HrPerfTemplateVO;
import com.mftb.admin.dto.OaRequestCreateDTO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.HrPerfAssessment;
import com.mftb.admin.entity.HrPerfCycle;
import com.mftb.admin.entity.HrPerfIndicator;
import com.mftb.admin.entity.HrPerfPlan;
import com.mftb.admin.entity.HrPerfScoreItem;
import com.mftb.admin.entity.HrPerfTemplate;
import com.mftb.admin.entity.SysDepartment;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.HrPerfAssessmentMapper;
import com.mftb.admin.mapper.HrPerfCycleMapper;
import com.mftb.admin.mapper.HrPerfIndicatorMapper;
import com.mftb.admin.mapper.HrPerfPlanMapper;
import com.mftb.admin.mapper.HrPerfScoreItemMapper;
import com.mftb.admin.mapper.HrPerfTemplateMapper;
import com.mftb.admin.mapper.SysDepartmentMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.HrPerfReportService;
import com.mftb.admin.service.HrPerfService;
import com.mftb.admin.service.OaRequestService;
import com.mftb.admin.service.PermissionService;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.JsonUtils;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 績效考核服务实现。
 * <p>
 * 总分、等级、状态跃迁、评估人指派与敏感字段裁剪全部在这里收口，前端只读结果。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class HrPerfServiceImpl implements HrPerfService {

    /** 加权分保留两位，四舍五入 */
    private static final int SCORE_SCALE = 2;
    private static final BigDecimal SCORE_MAX = BigDecimal.valueOf(HrPerfConstants.INDICATOR_SCORE_MAX);
    /** 部门树遍历深度上限，防御脏数据形成的环 */
    private static final int MAX_DEPT_DEPTH = 20;

    private final HrPerfCycleMapper cycleMapper;
    private final HrPerfTemplateMapper templateMapper;
    private final HrPerfIndicatorMapper indicatorMapper;
    private final HrPerfPlanMapper planMapper;
    private final HrPerfAssessmentMapper assessmentMapper;
    private final HrPerfScoreItemMapper scoreItemMapper;
    private final SysUserMapper sysUserMapper;
    private final SysDepartmentMapper sysDepartmentMapper;
    private final OaRequestService oaRequestService;
    private final BizSeqService bizSeqService;
    private final OperatorResolver operatorResolver;
    private final PermissionService permissionService;
    /** M2 留痕/强制分布口径单向注入（台账服务不依赖本服务，不成环） */
    private final HrPerfReportService reportService;

    // ==================== 周期 ====================

    @Override
    public PageResult<HrPerfCycleVO> pageCycles(long page, long size, String status, String keyword) {
        require(HrPerfConstants.MENU_ADMIN, "view");
        LambdaQueryWrapper<HrPerfCycle> wrapper = new LambdaQueryWrapper<HrPerfCycle>()
                .orderByDesc(HrPerfCycle::getId);
        if (StringUtils.hasText(status)) {
            wrapper.eq(HrPerfCycle::getStatus, status);
        }
        if (StringUtils.hasText(keyword)) {
            String kw = keyword.trim();
            wrapper.and(w -> w.like(HrPerfCycle::getName, kw).or().like(HrPerfCycle::getCode, kw));
        }
        Page<HrPerfCycle> result = cycleMapper.selectPage(paged(page, size), wrapper);
        List<HrPerfCycleVO> records = result.getRecords().stream().map(c -> {
            HrPerfCycleVO vo = HrPerfCycleVO.from(c);
            vo.setPlanCount(Math.toIntExact(planMapper.selectCount(
                    new LambdaQueryWrapper<HrPerfPlan>().eq(HrPerfPlan::getCycleId, c.getId()))));
            return vo;
        }).toList();
        return new PageResult<>(records, result.getTotal());
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public HrPerfCycleVO saveCycle(Long id, HrPerfCycleSaveDTO dto) {
        require(HrPerfConstants.MENU_ADMIN, id == null ? "create" : "edit");
        if (!HrPerfConstants.isValidCycleType(dto.getCycleType())) {
            throw new BusinessException("無效的周期類型: " + dto.getCycleType());
        }
        if (dto.getPeriodEnd().isBefore(dto.getPeriodStart())) {
            throw new BusinessException("考核期結束不能早於開始");
        }
        String code = dto.getCode().trim();
        Long dup = cycleMapper.selectCount(new LambdaQueryWrapper<HrPerfCycle>()
                .eq(HrPerfCycle::getCode, code)
                .ne(id != null, HrPerfCycle::getId, id));
        if (dup != null && dup > 0) {
            throw new BusinessException("周期編碼已存在：" + code);
        }
        HrPerfCycle entity;
        if (id == null) {
            entity = new HrPerfCycle();
            entity.setReqNo(seq(HrPerfConstants.SEQ_CYCLE, "PC"));
            entity.setStatus(HrPerfConstants.CYCLE_DRAFT);
            entity.setCreatedBy(operatorResolver.currentOperatorName());
            entity.setDeleted(0);
        } else {
            entity = requireCycle(id);
            // 编码决定与外部系统对接口径，发布后不再允许改
            if (!HrPerfConstants.CYCLE_DRAFT.equals(entity.getStatus())
                    && !entity.getCycleType().equals(dto.getCycleType())) {
                throw new BusinessException("週期已發布，不可修改周期類型");
            }
        }
        entity.setCode(code);
        entity.setName(dto.getName().trim());
        entity.setCycleType(dto.getCycleType());
        entity.setPeriodStart(dto.getPeriodStart());
        entity.setPeriodEnd(dto.getPeriodEnd());
        entity.setRemark(trim(dto.getRemark()));
        entity.setUpdatedBy(operatorResolver.currentOperatorName());
        entity.setUpdatedAt(LocalDateTime.now());
        if (id == null) {
            cycleMapper.insert(entity);
        } else {
            cycleMapper.updateById(entity);
        }
        return HrPerfCycleVO.from(entity);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void changeCycleStatus(Long id, String status) {
        require(HrPerfConstants.MENU_ADMIN, "edit");
        if (!List.of(HrPerfConstants.CYCLE_PUBLISHED, HrPerfConstants.CYCLE_CLOSED, HrPerfConstants.CYCLE_DRAFT)
                .contains(status)) {
            throw new BusinessException("無效的週期狀態: " + status);
        }
        HrPerfCycle cycle = requireCycle(id);
        if (HrPerfConstants.CYCLE_DRAFT.equals(status)
                && !HrPerfConstants.CYCLE_PUBLISHED.equals(cycle.getStatus())) {
            throw new BusinessException("僅已發布的週期可以撤回為草稿");
        }
        if (HrPerfConstants.CYCLE_CLOSED.equals(status)) {
            Long running = planMapper.selectCount(new LambdaQueryWrapper<HrPerfPlan>()
                    .eq(HrPerfPlan::getCycleId, id)
                    .in(HrPerfPlan::getStatus, List.of(HrPerfConstants.PLAN_DRAFT, HrPerfConstants.PLAN_RUNNING,
                            HrPerfConstants.PLAN_CONFIRM_PENDING)));
            if (running != null && running > 0) {
                throw new BusinessException("該週期還有 " + running + " 個未結束的計劃，無法關閉");
            }
        }
        cycle.setStatus(status);
        cycle.setUpdatedBy(operatorResolver.currentOperatorName());
        cycle.setUpdatedAt(LocalDateTime.now());
        cycleMapper.updateById(cycle);
    }

    // ==================== 模板 ====================

    @Override
    public PageResult<HrPerfTemplateVO> pageTemplates(long page, long size, String keyword) {
        require(HrPerfConstants.MENU_ADMIN, "view");
        LambdaQueryWrapper<HrPerfTemplate> wrapper = new LambdaQueryWrapper<HrPerfTemplate>()
                .orderByDesc(HrPerfTemplate::getId);
        if (StringUtils.hasText(keyword)) {
            wrapper.like(HrPerfTemplate::getName, keyword.trim());
        }
        Page<HrPerfTemplate> result = templateMapper.selectPage(paged(page, size), wrapper);
        // 指标随列表一次性带出（按页内模板 id 一次查完）：前端台账要显示指标数、
        // 发起页下拉要展示权重与等级，只给空列表会让 HR 以为模板没配指标
        List<Long> templateIds = result.getRecords().stream().map(HrPerfTemplate::getId).toList();
        Map<Long, List<HrPerfIndicator>> indicatorsByTemplate = templateIds.isEmpty() ? Map.of()
                : indicatorMapper.selectList(new LambdaQueryWrapper<HrPerfIndicator>()
                        .in(HrPerfIndicator::getTemplateId, templateIds)
                        .orderByAsc(HrPerfIndicator::getSortOrder))
                .stream().collect(Collectors.groupingBy(HrPerfIndicator::getTemplateId));
        List<HrPerfTemplateVO> records = result.getRecords().stream()
                .map(t -> HrPerfTemplateVO.from(t, indicatorsByTemplate.getOrDefault(t.getId(), List.of()))).toList();
        return new PageResult<>(records, result.getTotal());
    }

    @Override
    public HrPerfTemplateVO getTemplate(Long id) {
        require(HrPerfConstants.MENU_ADMIN, "view");
        HrPerfTemplate template = requireTemplate(id);
        return HrPerfTemplateVO.from(template, indicatorsOf(id));
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public HrPerfTemplateVO saveTemplate(Long id, HrPerfTemplateSaveDTO dto) {
        require(HrPerfConstants.MENU_ADMIN, id == null ? "create" : "edit");
        validateTemplate(dto);
        HrPerfTemplate entity;
        if (id == null) {
            entity = new HrPerfTemplate();
            entity.setCreatedBy(operatorResolver.currentOperatorName());
            entity.setDeleted(0);
        } else {
            entity = requireTemplate(id);
            // 计划已引用时禁止删指标：会把已有打分明细变成孤儿
            Long used = planMapper.selectCount(new LambdaQueryWrapper<HrPerfPlan>().eq(HrPerfPlan::getTemplateId, id));
            if (used != null && used > 0 && dto.getIndicators().size() < indicatorsOf(id).size()) {
                throw new BusinessException("該模板已被 " + used + " 個計劃引用，不可減少指標");
            }
        }
        entity.setName(dto.getName().trim());
        entity.setApplyCycleType(trim(dto.getApplyCycleType()));
        entity.setGradeScheme(JsonUtils.toJson(normalizeGrades(dto.getGrades())));
        entity.setWeightSum(dto.getWeightSum());
        entity.setStatus(dto.getStatus() == null ? 1 : dto.getStatus());
        entity.setRemark(trim(dto.getRemark()));
        entity.setUpdatedBy(operatorResolver.currentOperatorName());
        entity.setUpdatedAt(LocalDateTime.now());
        if (id == null) {
            templateMapper.insert(entity);
        } else {
            templateMapper.updateById(entity);
        }
        replaceIndicators(entity.getId(), dto.getIndicators());
        return HrPerfTemplateVO.from(entity, indicatorsOf(entity.getId()));
    }

    private void validateTemplate(HrPerfTemplateSaveDTO dto) {
        if (dto.getWeightSum() == null || dto.getWeightSum() <= 0) {
            throw new BusinessException("權重合計必須大於 0");
        }
        BigDecimal sum = dto.getIndicators().stream()
                .map(HrPerfTemplateSaveDTO.IndicatorItem::getWeight)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        if (sum.compareTo(BigDecimal.valueOf(dto.getWeightSum())) != 0) {
            throw new BusinessException("指標權重合計（" + sum.stripTrailingZeros().toPlainString()
                    + "）必須等於設定的權重合計 " + dto.getWeightSum());
        }
        Set<String> codes = new HashSet<>();
        Set<Integer> thresholds = new HashSet<>();
        for (HrPerfTemplateSaveDTO.GradeRule g : dto.getGrades()) {
            if (!codes.add(g.getCode())) {
                throw new BusinessException("等級重複: " + g.getCode());
            }
            if (g.getMinScore() == null || g.getMinScore() < 0 || g.getMinScore() > HrPerfConstants.INDICATOR_SCORE_MAX) {
                throw new BusinessException("等級分值下限必須在 0–100 之間: " + g.getCode());
            }
            // 两个等级共用同一下限会让“得分→等级”映射产生歧义
            if (!thresholds.add(g.getMinScore())) {
                throw new BusinessException("等級分值下限不得重複: " + g.getMinScore());
            }
        }
    }

    /**
     * 等级方案统一按分值下限降序存储（S→D）。
     * <p>
     * 录入顺序不能决定映射结果（取不超得分的最高下限），但归一后可以
     * 保证前端展示与导出的等级顺序稳定，也让“高下限盖低下限”这类错误在存储层看不出破绽。
     */
    private List<HrPerfTemplateSaveDTO.GradeRule> normalizeGrades(List<HrPerfTemplateSaveDTO.GradeRule> grades) {
        return grades.stream()
                .sorted((a, b) -> Integer.compare(b.getMinScore(), a.getMinScore()))
                .toList();
    }

    private void replaceIndicators(Long templateId, List<HrPerfTemplateSaveDTO.IndicatorItem> items) {
        indicatorMapper.delete(new LambdaQueryWrapper<HrPerfIndicator>().eq(HrPerfIndicator::getTemplateId, templateId));
        int sort = 1;
        for (HrPerfTemplateSaveDTO.IndicatorItem item : items) {
            HrPerfIndicator entity = new HrPerfIndicator();
            entity.setTemplateId(templateId);
            entity.setName(item.getName().trim());
            entity.setIndicatorType(trim(item.getIndicatorType()));
            entity.setWeight(item.getWeight());
            entity.setTargetDesc(trim(item.getTargetDesc()));
            entity.setScoringDesc(trim(item.getScoringDesc()));
            entity.setSortOrder(sort++);
            entity.setCreatedBy(operatorResolver.currentOperatorName());
            entity.setUpdatedBy(operatorResolver.currentOperatorName());
            entity.setDeleted(0);
            indicatorMapper.insert(entity);
        }
    }

    private List<HrPerfIndicator> indicatorsOf(Long templateId) {
        return indicatorMapper.selectList(new LambdaQueryWrapper<HrPerfIndicator>()
                .eq(HrPerfIndicator::getTemplateId, templateId)
                .orderByAsc(HrPerfIndicator::getSortOrder));
    }

    // ==================== 计划 ====================

    @Override
    public Map<String, Object> scopeOptions() {
        require(HrPerfConstants.MENU_ADMIN, "view");
        List<Map<String, Object>> departments = sysDepartmentMapper.selectList(
                new LambdaQueryWrapper<SysDepartment>()
                        .eq(SysDepartment::getStatus, 1)
                        .orderByAsc(SysDepartment::getSort))
                .stream()
                .map(d -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("id", d.getId());
                    row.put("name", nullSafe(d.getName()));
                    row.put("parentId", d.getParentId());
                    // 负责人姓名回传供前端提示“该部门无法自动指派评估人”
                    row.put("leader", nullSafe(d.getLeader()));
                    return row;
                }).toList();
        List<String> positionLevels = sysUserMapper.selectList(new LambdaQueryWrapper<SysUser>()
                        .select(SysUser::getId, SysUser::getJobLevel)
                        .eq(SysUser::getStatus, 1))
                .stream()
                // 只选一列时，值为 NULL 的行会被 MyBatis 映射成整行 null 元素，不先滤掉会 NPE
                .filter(Objects::nonNull)
                .map(SysUser::getJobLevel)
                .filter(StringUtils::hasText).distinct().sorted().toList();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("departments", departments);
        result.put("positionLevels", positionLevels);
        return result;
    }

    @Override
    public List<Map<String, Object>> evaluatorOptions(String keyword) {
        require(HrPerfConstants.MENU_CALIBRATION, "view");
        LambdaQueryWrapper<SysUser> wrapper = new LambdaQueryWrapper<SysUser>()
                .eq(SysUser::getStatus, 1)
                .orderByAsc(SysUser::getEmpId)
                .last("LIMIT 30");
        if (StringUtils.hasText(keyword)) {
            String kw = keyword.trim();
            wrapper.and(w -> w.like(SysUser::getName, kw).or().like(SysUser::getEmpId, kw));
        }
        return sysUserMapper.selectList(wrapper).stream().map(u -> {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("userId", u.getId());
            row.put("empId", nullSafe(u.getEmpId()));
            row.put("name", nullSafe(u.getName()));
            row.put("department", nullSafe(u.getDepartment()));
            return row;
        }).toList();
    }

    @Override
    public Map<String, Object> previewLaunch(HrPerfPlanLaunchDTO dto) {
        require(HrPerfConstants.MENU_ADMIN, "view");
        LaunchTargets targets = resolveTargets(dto);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("total", targets.users().size());
        result.put("unassigned", targets.unassigned().size());
        result.put("unassignedList", targets.unassigned().stream()
                .map(t -> Map.of("userId", t.user().getId(), "empName", nullSafe(t.user().getName()),
                        "deptName", nullSafe(t.user().getDepartment()), "reason", t.reason()))
                .toList());
        return result;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public HrPerfPlanVO launchPlan(HrPerfPlanLaunchDTO dto) {
        require(HrPerfConstants.MENU_ADMIN, "create");
        HrPerfCycle cycle = requireCycle(dto.getCycleId());
        if (!HrPerfConstants.CYCLE_PUBLISHED.equals(cycle.getStatus())) {
            throw new BusinessException("僅已發布的週期可以發起計劃");
        }
        HrPerfTemplate template = requireTemplate(dto.getTemplateId());
        if (!Objects.equals(template.getStatus(), 1)) {
            throw new BusinessException("該模板已停用，無法用於發起計劃");
        }
        if (StringUtils.hasText(template.getApplyCycleType())
                && !template.getApplyCycleType().equals(cycle.getCycleType())) {
            throw new BusinessException("模板適用週期類型為 " + template.getApplyCycleType() + "，與所選週期不符");
        }
        validateWindows(dto);
        List<HrPerfIndicator> indicators = indicatorsOf(template.getId());
        if (indicators.isEmpty()) {
            throw new BusinessException("該模板尚未配置考核指標");
        }

        LaunchTargets targets = resolveTargets(dto);
        if (targets.users().isEmpty()) {
            throw new BusinessException("所選範圍內沒有在職員工");
        }
        HrPerfPlan plan = new HrPerfPlan();
        plan.setReqNo(seq(HrPerfConstants.SEQ_PLAN, "PP"));
        plan.setCycleId(cycle.getId());
        plan.setTemplateId(template.getId());
        plan.setName(dto.getName().trim());
        Map<String, Object> scope = new LinkedHashMap<>();
        scope.put("deptIds", dto.getDeptIds());
        scope.put("positionLevels", dto.getPositionLevels() == null ? List.of() : dto.getPositionLevels());
        plan.setScopeJson(JsonUtils.toJson(scope));
        plan.setSelfStart(dto.getSelfStart());
        plan.setSelfEnd(dto.getSelfEnd());
        plan.setSupStart(dto.getSupStart());
        plan.setSupEnd(dto.getSupEnd());
        plan.setCalibEnd(dto.getCalibEnd());
        plan.setStatus(HrPerfConstants.PLAN_RUNNING);
        plan.setSummary(trim(dto.getSummary()));
        plan.setCreatedBy(operatorResolver.currentOperatorName());
        plan.setUpdatedBy(operatorResolver.currentOperatorName());
        plan.setDeleted(0);
        planMapper.insert(plan);

        int created = 0;
        for (SysUser user : targets.users()) {
            HrPerfAssessment a = new HrPerfAssessment();
            a.setReqNo(seq(HrPerfConstants.SEQ_ASSESSMENT, "PH"));
            a.setPlanId(plan.getId());
            a.setUserId(user.getId());
            a.setEmpNo(user.getEmpId());
            a.setEmpName(user.getName());
            a.setDeptId(user.getDepartmentId());
            a.setDeptName(user.getDepartment());
            a.setSequenceType(user.getSequence());
            a.setPositionName(user.getPosition());
            a.setPositionLevel(user.getJobLevel());
            SysUser evaluator = targets.evaluatorByUser().get(user.getId());
            if (evaluator != null) {
                a.setEvaluatorUserId(evaluator.getId());
                a.setEvaluatorName(evaluator.getName());
            }
            a.setStatus(HrPerfConstants.A_SELF_PENDING);
            a.setCreatedBy(plan.getCreatedBy());
            a.setUpdatedBy(plan.getUpdatedBy());
            a.setDeleted(0);
            assessmentMapper.insert(a);
            for (HrPerfIndicator ind : indicators) {
                HrPerfScoreItem item = new HrPerfScoreItem();
                item.setAssessmentId(a.getId());
                item.setIndicatorId(ind.getId());
                item.setIndicatorName(ind.getName());
                item.setWeight(ind.getWeight());
                item.setCreatedBy(plan.getCreatedBy());
                item.setUpdatedBy(plan.getUpdatedBy());
                item.setDeleted(0);
                scoreItemMapper.insert(item);
            }
            created++;
        }
        log.info("績效計劃已發起: reqNo={}, plan={}, 考核單={}, 待指派評估人={}",
                plan.getReqNo(), plan.getId(), created, targets.unassigned().size());
        return getPlanInternal(plan.getId());
    }

    @Override
    public PageResult<HrPerfPlanVO> pagePlans(long page, long size, Long cycleId, String status) {
        require(HrPerfConstants.MENU_ADMIN, "view");
        LambdaQueryWrapper<HrPerfPlan> wrapper = new LambdaQueryWrapper<HrPerfPlan>()
                .eq(cycleId != null, HrPerfPlan::getCycleId, cycleId)
                .eq(StringUtils.hasText(status), HrPerfPlan::getStatus, status)
                .orderByDesc(HrPerfPlan::getId);
        Page<HrPerfPlan> result = planMapper.selectPage(paged(page, size), wrapper);
        List<HrPerfPlanVO> records = result.getRecords().stream().map(this::toPlanVO).toList();
        return new PageResult<>(records, result.getTotal());
    }

    @Override
    public HrPerfPlanVO getPlan(Long id) {
        require(HrPerfConstants.MENU_ADMIN, "view");
        return getPlanInternal(id);
    }

    private HrPerfPlanVO getPlanInternal(Long id) {
        return toPlanVO(requirePlan(id));
    }

    private HrPerfPlanVO toPlanVO(HrPerfPlan plan) {
        HrPerfPlanVO vo = HrPerfPlanVO.from(plan);
        HrPerfCycle cycle = plan.getCycleId() == null ? null : cycleMapper.selectById(plan.getCycleId());
        vo.setCycleName(cycle == null ? null : cycle.getName());
        HrPerfTemplate template = plan.getTemplateId() == null ? null : templateMapper.selectById(plan.getTemplateId());
        vo.setTemplateName(template == null ? null : template.getName());
        List<HrPerfAssessment> rows = assessmentMapper.selectList(new LambdaQueryWrapper<HrPerfAssessment>()
                .eq(HrPerfAssessment::getPlanId, plan.getId())
                .select(HrPerfAssessment::getStatus, HrPerfAssessment::getEvaluatorUserId));
        vo.setTotal(rows.size());
        vo.setSelfPending(count(rows, HrPerfConstants.A_SELF_PENDING));
        vo.setSupervisorPending(count(rows, HrPerfConstants.A_SUPERVISOR_PENDING));
        vo.setCalibrationPending(count(rows, HrPerfConstants.A_CALIBRATION_PENDING));
        vo.setConfirmPending(count(rows, HrPerfConstants.A_CONFIRM_PENDING));
        vo.setConfirmed(count(rows, HrPerfConstants.A_CONFIRMED));
        vo.setUnassigned((int) rows.stream().filter(r -> r.getEvaluatorUserId() == null).count());
        return vo;
    }

    private static int count(List<HrPerfAssessment> rows, String status) {
        return (int) rows.stream().filter(r -> status.equals(r.getStatus())).count();
    }

    // ==================== 评分 ====================

    @Override
    public HrPerfAssessmentVO getAssessment(Long id) {
        HrPerfAssessment entity = requireAssessment(id);
        HrPerfAssessmentVO vo = visibleVO(entity);
        return attachItems(entity, vo, isSelfBlindView(entity));
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public HrPerfAssessmentVO submitScore(Long id, HrPerfScoreSubmitDTO dto) {
        HrPerfAssessment entity = requireAssessment(id);
        Long me = currentUserId();
        boolean self = Objects.equals(entity.getUserId(), me);
        boolean supervisor = Objects.equals(entity.getEvaluatorUserId(), me);
        if (!self && !supervisor) {
            throw PermissionDeniedException.outOfDataScope("他人的考核評分");
        }
        if (self && !HrPerfConstants.A_SELF_PENDING.equals(entity.getStatus())) {
            throw new BusinessException("該考核單已不在待自評狀態");
        }
        if (supervisor && !HrPerfConstants.A_SUPERVISOR_PENDING.equals(entity.getStatus())) {
            throw new BusinessException("自評未完成前無法進行上級評分");
        }
        List<HrPerfScoreItem> items = itemsOf(id);
        Map<Long, HrPerfScoreItem> byId = items.stream()
                .collect(Collectors.toMap(HrPerfScoreItem::getId, i -> i));
        for (HrPerfScoreSubmitDTO.ItemScore in : dto.getItems()) {
            HrPerfScoreItem item = byId.get(in.getItemId());
            if (item == null) {
                throw new BusinessException("打分明細不存在或已變更: " + in.getItemId());
            }
            validateScore(in.getScore());
            item.setTargetValue(trim(in.getTargetValue()));
            item.setRemark(trim(in.getRemark()));
            if (self) {
                item.setSelfScore(in.getScore());
            } else {
                item.setSupervisorScore(in.getScore());
            }
            item.setUpdatedBy(operatorResolver.currentOperatorName());
            item.setUpdatedAt(LocalDateTime.now());
            scoreItemMapper.updateById(item);
        }
        boolean submit = !Boolean.FALSE.equals(dto.getSubmit());
        // 按去重后的指标数判断覆盖度：避免前端重复提交同一指标来凑数、漏评其他指标
        long covered = dto.getItems().stream().map(HrPerfScoreSubmitDTO.ItemScore::getItemId).distinct().count();
        if (submit && covered < items.size()) {
            throw new BusinessException("每項指標都必須評分後才能提交");
        }
        BigDecimal weighted = weighted(items, self);
        entity.setUpdatedBy(operatorResolver.currentOperatorName());
        entity.setUpdatedAt(LocalDateTime.now());
        if (self) {
            entity.setSelfComment(trim(dto.getComment()));
            if (submit) {
                entity.setSelfScore(weighted);
                entity.setSelfAt(LocalDateTime.now());
                entity.setStatus(HrPerfConstants.A_SUPERVISOR_PENDING);
            }
        } else {
            entity.setSupervisorComment(trim(dto.getComment()));
            if (submit) {
                entity.setSupervisorScore(weighted);
                entity.setSupervisorAt(LocalDateTime.now());
                entity.setStatus(HrPerfConstants.A_CALIBRATION_PENDING);
            }
        }
        assessmentMapper.updateById(entity);
        return attachItems(entity, visibleVO(entity), isSelfBlindView(entity));
    }

    @Override
    public PageResult<HrPerfAssessmentVO> pageMyReviews(long page, long size, String status, String keyword) {
        require(HrPerfConstants.MENU_REVIEW, "view");
        Long me = currentUserId();
        LambdaQueryWrapper<HrPerfAssessment> wrapper = new LambdaQueryWrapper<HrPerfAssessment>()
                .eq(HrPerfAssessment::getEvaluatorUserId, me)
                .eq(StringUtils.hasText(status), HrPerfAssessment::getStatus, status)
                .orderByDesc(HrPerfAssessment::getId);
        if (StringUtils.hasText(keyword)) {
            String kw = keyword.trim();
            wrapper.and(w -> w.like(HrPerfAssessment::getEmpName, kw).or().like(HrPerfAssessment::getEmpNo, kw));
        }
        // 列表已按 evaluator_user_id 收敛到登录人名下，上级分本就是他自己写的，不得被自助口径裁掉
        return pageAssessments(page, size, wrapper, true);
    }

    @Override
    public PageResult<HrPerfAssessmentVO> pagePlanAssessments(Long planId, long page, long size, String status, String keyword) {
        // 计划详情属于台账视图：周期管理菜单或校准菜单任一即可，评估人不通过此入口取数
        if (!has(HrPerfConstants.MENU_ADMIN, "view")) {
            require(HrPerfConstants.MENU_CALIBRATION, "view");
        }
        LambdaQueryWrapper<HrPerfAssessment> wrapper = new LambdaQueryWrapper<HrPerfAssessment>()
                .eq(HrPerfAssessment::getPlanId, planId)
                .eq(StringUtils.hasText(status), HrPerfAssessment::getStatus, status)
                .orderByDesc(HrPerfAssessment::getId);
        if (StringUtils.hasText(keyword)) {
            String kw = keyword.trim();
            wrapper.and(w -> w.like(HrPerfAssessment::getEmpName, kw)
                    .or().like(HrPerfAssessment::getEmpNo, kw)
                    .or().like(HrPerfAssessment::getReqNo, kw));
        }
        return pageAssessments(page, size, wrapper, true);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void reassign(Long assessmentId, Long evaluatorUserId) {
        require(HrPerfConstants.MENU_CALIBRATION, "edit");
        HrPerfAssessment entity = requireAssessment(assessmentId);
        if (HrPerfConstants.A_CONFIRMED.equals(entity.getStatus())) {
            throw new BusinessException("結果已確認，不可改派評估人");
        }
        String oldEvaluatorName = entity.getEvaluatorName();
        SysUser evaluator = evaluatorUserId == null ? null : sysUserMapper.selectById(evaluatorUserId);
        if (evaluator == null) {
            throw new BusinessException("所選評估人不存在");
        }
        if (Objects.equals(evaluator.getId(), entity.getUserId())) {
            throw new BusinessException("評估人不能是被考核人本人");
        }
        entity.setEvaluatorUserId(evaluator.getId());
        entity.setEvaluatorName(evaluator.getName());
        entity.setUpdatedBy(operatorResolver.currentOperatorName());
        entity.setUpdatedAt(LocalDateTime.now());
        assessmentMapper.updateById(entity);
        // 评估人是谁决定了“谁打的分”，改派本身也是事后要追责的事实，不能只留下当前值
        // 分数/等级列故意留空（不是评分动作），变更内容写在理由里
        reportService.logCalibration(entity, HrPerfConstants.LOG_REASSIGN, null, null,
                null, null, "評估人改派：" + (oldEvaluatorName == null ? "未指派" : oldEvaluatorName)
                        + " → " + evaluator.getName(), null);
        log.info("績效評估人已改派: assessment={}, evaluator={}", entity.getReqNo(), evaluator.getName());
    }

    // ==================== 校准与确认 ====================

    @Override
    public PageResult<HrPerfAssessmentVO> pageCalibration(long page, long size, Long planId, String status, String keyword) {
        require(HrPerfConstants.MENU_CALIBRATION, "view");
        LambdaQueryWrapper<HrPerfAssessment> wrapper = new LambdaQueryWrapper<HrPerfAssessment>()
                .eq(planId != null, HrPerfAssessment::getPlanId, planId)
                .eq(StringUtils.hasText(status), HrPerfAssessment::getStatus, status)
                .orderByDesc(HrPerfAssessment::getId);
        if (StringUtils.hasText(keyword)) {
            String kw = keyword.trim();
            wrapper.and(w -> w.like(HrPerfAssessment::getEmpName, kw)
                    .or().like(HrPerfAssessment::getEmpNo, kw)
                    .or().like(HrPerfAssessment::getReqNo, kw));
        }
        return pageAssessments(page, size, wrapper, true);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public HrPerfAssessmentVO calibrate(Long id, BigDecimal score, String grade, String reason) {
        require(HrPerfConstants.MENU_CALIBRATION, "edit");
        HrPerfAssessment entity = requireAssessment(id);
        if (HrPerfConstants.A_CONFIRM_PENDING.equals(entity.getStatus())) {
            throw new BusinessException("該考核單已隨計劃提交審批，審批中不可改判（需先在審批中心駁回該計劃流程）");
        }
        if (!HrPerfConstants.CALIBRATABLE_STATUSES.contains(entity.getStatus())) {
            throw new BusinessException("僅待校準的考核單可以改判");
        }
        if (score == null && !StringUtils.hasText(grade)) {
            throw new BusinessException("請填寫校準後的得分或等級");
        }
        if (!StringUtils.hasText(reason)) {
            throw new BusinessException("改判必須填寫理由");
        }
        // 留痕要记“从什么改到什么”，必须在覆写前取旧值；首次改判时“之前”就是当时生效的上级分
        BigDecimal beforeScore = entity.getCalibratedScore() != null
                ? entity.getCalibratedScore() : entity.getSupervisorScore();
        String beforeGrade = entity.getCalibratedGrade();
        if (score != null) {
            validateScore(score);
            entity.setCalibratedScore(score);
        }
        if (StringUtils.hasText(grade)) {
            HrPerfTemplate template = requireTemplate(templateIdOf(entity.getPlanId()));
            if (!gradeCodes(template).contains(grade.trim())) {
                throw new BusinessException("無效的等級: " + grade);
            }
            entity.setCalibratedGrade(grade.trim());
        }
        entity.setCalibratedBy(operatorResolver.currentOperatorName());
        entity.setCalibratedReason(reason.trim());
        entity.setStatus(HrPerfConstants.A_CALIBRATION_PENDING);
        entity.setUpdatedBy(operatorResolver.currentOperatorName());
        entity.setUpdatedAt(LocalDateTime.now());
        assessmentMapper.updateById(entity);
        // 改判不留痕就等于“结果被人改过但查不到谁改的”，本方法的成立前提就是写一行流水
        reportService.logCalibration(entity, HrPerfConstants.LOG_CALIBRATE,
                beforeScore, beforeGrade, entity.getCalibratedScore(), entity.getCalibratedGrade(),
                reason.trim(), null);
        return attachItems(entity, HrPerfAssessmentVO.from(entity), false);
    }

    @Override
    public List<Map<String, Object>> planGrades(Long planId) {
        // 校准角色不一定有周期管理菜单，因此不能直接走 GET /templates/{id}
        if (!has(HrPerfConstants.MENU_CALIBRATION, "view")) {
            require(HrPerfConstants.MENU_ADMIN, "view");
        }
        HrPerfTemplate template = requireTemplate(templateIdOf(planId));
        List<HrPerfTemplateSaveDTO.GradeRule> grades = JsonUtils.parseList(template.getGradeScheme(),
                HrPerfTemplateSaveDTO.GradeRule.class);
        if (grades == null) {
            return List.of();
        }
        return grades.stream().map(g -> {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("code", g.getCode());
            row.put("minScore", g.getMinScore());
            row.put("ratio", g.getRatio());
            return row;
        }).toList();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public HrPerfPlanVO submitConfirm(Long planId, Boolean waiveDistribution, String waiveReason) {
        require(HrPerfConstants.MENU_CALIBRATION, "edit");
        HrPerfPlan plan = requirePlan(planId);
        if (!HrPerfConstants.PLAN_RUNNING.equals(plan.getStatus())) {
            throw new BusinessException("僅進行中的計劃可以提交確認");
        }
        List<HrPerfAssessment> all = assessmentMapper.selectList(new LambdaQueryWrapper<HrPerfAssessment>()
                .eq(HrPerfAssessment::getPlanId, planId));
        if (all.isEmpty()) {
            throw new BusinessException("該計劃沒有考核單");
        }
        long notReady = all.stream().filter(a -> !HrPerfConstants.A_CALIBRATION_PENDING.equals(a.getStatus())).count();
        if (notReady > 0) {
            throw new BusinessException("還有 " + notReady + " 份考核單未完成自評/上級評分，無法提交確認");
        }
        long noEvaluator = all.stream().filter(a -> a.getEvaluatorUserId() == null).count();
        if (noEvaluator > 0) {
            throw new BusinessException("還有 " + noEvaluator + " 份考核單未指派評估人，請先在計劃中改派");
        }
        long noScore = all.stream()
                .filter(a -> a.getSupervisorScore() == null && a.getCalibratedScore() == null)
                .count();
        if (noScore > 0) {
            throw new BusinessException("還有 " + noScore + " 份考核單既無上級評分也無校準分");
        }
        // 强制分布是软约束：超编时拦住未声明例外的提交；声明例外则必须写理由，且例外本身进留痕可追溯
        List<HrPerfReportVO.GradeCount> gap = reportService.distributionGap(planId);
        if (!gap.isEmpty()) {
            if (!Boolean.TRUE.equals(waiveDistribution)) {
                String detail = gap.stream().map(g -> g.getGrade() + " 超編（" + g.getGapNote() + "）")
                        .collect(Collectors.joining("；"));
                throw new BusinessException("等級分佈超出建議佔比：" + detail
                        + "。如屬特殊情況，請勾選例外放行並填寫理由。");
            }
            if (!StringUtils.hasText(waiveReason)) {
                throw new BusinessException("強制分佈例外放行必須填寫理由");
            }
            reportService.logDistributionWaiver(plan, waiveReason);
        }

        OaRequestCreateDTO oa = new OaRequestCreateDTO();
        oa.setProcessCode(HrPerfConstants.PROCESS_CODE);
        oa.setTitle("績效結果確認-" + plan.getName() + "(" + plan.getReqNo() + "，" + all.size() + " 人)");
        Map<String, Object> formData = new HashMap<>();
        formData.put("bizId", plan.getId());
        formData.put("bizType", "perf_plan");
        formData.put("planName", plan.getName());
        formData.put("headcount", all.size());
        oa.setFormData(JsonUtils.toJson(formData));
        String flowNo = oaRequestService.submit(oa);

        plan.setStatus(HrPerfConstants.PLAN_CONFIRM_PENDING);
        plan.setFlowNo(flowNo);
        plan.setUpdatedBy(operatorResolver.currentOperatorName());
        plan.setUpdatedAt(LocalDateTime.now());
        planMapper.updateById(plan);
        for (HrPerfAssessment a : all) {
            a.setStatus(HrPerfConstants.A_CONFIRM_PENDING);
            a.setUpdatedBy(plan.getUpdatedBy());
            a.setUpdatedAt(LocalDateTime.now());
            assessmentMapper.updateById(a);
        }
        log.info("績效計劃已提交確認: reqNo={}, flowNo={}, 人數={}", plan.getReqNo(), flowNo, all.size());
        return getPlanInternal(planId);
    }

    // ==================== 员工自助 ====================

    @Override
    public PageResult<HrPerfAssessmentVO> pageMyAssessments(long page, long size, String status) {
        require(HrPerfConstants.MENU_SELF, "view");
        Long me = currentUserId();
        LambdaQueryWrapper<HrPerfAssessment> wrapper = new LambdaQueryWrapper<HrPerfAssessment>()
                .eq(HrPerfAssessment::getUserId, me)
                .eq(StringUtils.hasText(status), HrPerfAssessment::getStatus, status)
                .orderByDesc(HrPerfAssessment::getId);
        // 自助列表：已确认的行要连同结果一起下发，不能无条件走裁剪口径
        return pageAssessments(page, size, wrapper, false);
    }

    @Override
    public HrPerfAssessmentVO getMyAssessment(Long id) {
        require(HrPerfConstants.MENU_SELF, "view");
        HrPerfAssessment entity = requireAssessment(id);
        if (!Objects.equals(entity.getUserId(), currentUserId())) {
            throw PermissionDeniedException.outOfDataScope("他人的考核結果");
        }
        // 未确认前只回本人可见范围；确认后结果对个人开放（列表与详情必须同一口径，否则会出现“详情可见、列表永远为空”）
        return attachItems(entity, selfScopedVO(entity), !HrPerfConstants.A_CONFIRMED.equals(entity.getStatus()));
    }

    // ==================== 内部：可见性与计算 ====================

    /** 按调用者身份决定返回完整视图还是自助裁剪视图 */
    private HrPerfAssessmentVO visibleVO(HrPerfAssessment entity) {
        Long me = currentUserId();
        // 台账与留痕菜单也属于 HR 视角：它们本身就能看全量结果，否则从这两页点开详情会被裁成空白
        if (has(HrPerfConstants.MENU_CALIBRATION, "view") || has(HrPerfConstants.MENU_ADMIN, "view")
                || has(HrPerfConstants.MENU_LEDGER, "view") || has(HrPerfConstants.MENU_AUDIT, "view")) {
            return HrPerfAssessmentVO.from(entity);
        }
        if (Objects.equals(entity.getEvaluatorUserId(), me)) {
            require(HrPerfConstants.MENU_REVIEW, "view");
            return HrPerfAssessmentVO.from(entity);
        }
        if (Objects.equals(entity.getUserId(), me)) {
            require(HrPerfConstants.MENU_SELF, "view");
            return selfScopedVO(entity);
        }
        throw PermissionDeniedException.outOfDataScope("他人的考核單");
    }

    /** 本人视角：已确认则下发完整结果，未确认只回自评（列表与详情共用，避免两端口径不一致） */
    private static HrPerfAssessmentVO selfScopedVO(HrPerfAssessment a) {
        return HrPerfConstants.A_CONFIRMED.equals(a.getStatus())
                ? HrPerfAssessmentVO.from(a) : HrPerfAssessmentVO.forSelf(a);
    }

    /** 调用者是否只能看被裁剪的自助视图（用于同步裁指标明细行，防止从明细反推上级打分） */
    private boolean isSelfBlindView(HrPerfAssessment entity) {
        Long me = currentUserId();
        return !HrPerfConstants.A_CONFIRMED.equals(entity.getStatus())
                && Objects.equals(entity.getUserId(), me)
                && !Objects.equals(entity.getEvaluatorUserId(), me)
                && !has(HrPerfConstants.MENU_CALIBRATION, "view")
                && !has(HrPerfConstants.MENU_ADMIN, "view")
                && !has(HrPerfConstants.MENU_LEDGER, "view")
                && !has(HrPerfConstants.MENU_AUDIT, "view");
    }

    /** 明细随行下发；hidden=true 时剔掉上级分与最终分（表头裁了、明细也必须裁） */
    private HrPerfAssessmentVO attachItems(HrPerfAssessment entity, HrPerfAssessmentVO vo, boolean hidden) {
        vo.setItems(itemsOf(entity.getId()).stream().map(item -> {
            HrPerfAssessmentVO.ItemVO iv = HrPerfAssessmentVO.ItemVO.from(item);
            if (hidden) {
                iv.setSupervisorScore(null);
                iv.setFinalScore(null);
            }
            return iv;
        }).toList());
        vo.setPlanName(planNameOf(entity.getPlanId()));
        return vo;
    }

    private String planNameOf(Long planId) {
        if (planId == null) {
            return null;
        }
        HrPerfPlan plan = planMapper.selectById(planId);
        return plan == null ? null : plan.getName();
    }

    private PageResult<HrPerfAssessmentVO> pageAssessments(long page, long size,
                                                           LambdaQueryWrapper<HrPerfAssessment> wrapper, boolean full) {
        Page<HrPerfAssessment> result = assessmentMapper.selectPage(paged(page, size), wrapper);
        List<HrPerfAssessmentVO> records = new ArrayList<>();
        for (HrPerfAssessment a : result.getRecords()) {
            records.add(full ? HrPerfAssessmentVO.from(a) : selfScopedVO(a));
        }
        attachPlanNames(records);
        return new PageResult<>(records, result.getTotal());
    }

    /** 列表按 plan_id 批量补计划名，避免逐行查库 */
    private void attachPlanNames(List<HrPerfAssessmentVO> records) {
        Set<Long> planIds = records.stream().map(HrPerfAssessmentVO::getPlanId)
                .filter(Objects::nonNull).collect(Collectors.toSet());
        if (planIds.isEmpty()) {
            return;
        }
        Map<Long, String> names = planMapper.selectBatchIds(planIds).stream()
                .collect(Collectors.toMap(HrPerfPlan::getId, HrPerfPlan::getName, (a, b) -> a));
        records.forEach(r -> r.setPlanName(names.get(r.getPlanId())));
    }

    /** 加权得分 = Σ(指标分 × 权重) / Σ权重 */
    private BigDecimal weighted(List<HrPerfScoreItem> items, boolean self) {
        BigDecimal weightSum = BigDecimal.ZERO;
        BigDecimal acc = BigDecimal.ZERO;
        for (HrPerfScoreItem item : items) {
            BigDecimal score = self ? item.getSelfScore() : item.getSupervisorScore();
            BigDecimal weight = item.getWeight() == null ? BigDecimal.ZERO : item.getWeight();
            if (score == null) {
                continue;
            }
            weightSum = weightSum.add(weight);
            acc = acc.add(score.multiply(weight));
        }
        if (weightSum.compareTo(BigDecimal.ZERO) <= 0) {
            throw new BusinessException("已評分指標的權重合計為 0，無法計算加權得分");
        }
        return acc.divide(weightSum, SCORE_SCALE, RoundingMode.HALF_UP);
    }

    private void validateScore(BigDecimal score) {
        if (score == null) {
            throw new BusinessException("指標得分不能為空");
        }
        if (score.compareTo(BigDecimal.ZERO) < 0 || score.compareTo(SCORE_MAX) > 0) {
            throw new BusinessException("指標得分必須在 0–" + HrPerfConstants.INDICATOR_SCORE_MAX + " 之間");
        }
    }

    /** 模板定义的合法等级集合（改判时校验等级不得凭空造） */
    private Set<String> gradeCodes(HrPerfTemplate template) {
        List<HrPerfTemplateSaveDTO.GradeRule> grades = JsonUtils.parseList(template.getGradeScheme(),
                HrPerfTemplateSaveDTO.GradeRule.class);
        if (grades == null) {
            return Set.of();
        }
        return grades.stream().map(HrPerfTemplateSaveDTO.GradeRule::getCode)
                .filter(StringUtils::hasText).collect(Collectors.toSet());
    }

    // ==================== 内部：发起范围与评估人指派 ====================

    private record LaunchTargets(
            List<SysUser> users,
            Map<Long, SysUser> evaluatorByUser,
            List<UnassignedTarget> unassigned) {
    }

    /** 待指派条目必须带原因，否则 HR 无法区分「负责人缺失/同名歧义」与「负责人本人受考」 */
    private record UnassignedTarget(SysUser user, String reason) {
    }

    private void validateWindows(HrPerfPlanLaunchDTO dto) {
        if (dto.getSelfEnd().isBefore(dto.getSelfStart())) {
            throw new BusinessException("自評截止日期不能早於開始");
        }
        if (dto.getSupEnd().isBefore(dto.getSupStart())) {
            throw new BusinessException("上級評截止日期不能早於開始");
        }
        if (dto.getCalibEnd().isBefore(dto.getSupEnd())) {
            throw new BusinessException("校準截止不能早於上級評截止");
        }
    }

    /**
     * 解析范围内员工与评估人。
     * <p>
     * 部门负责人字段存的是姓名，改名或同名即断链，因此只在「同一部门内唯一同名」时才认定负责人；
     * 歧义或查不到的一律进 unassigned 清单交给 HR 改派，绝不按姓名跨部门猜人。
     * 负责人本人的考核人不在本部门内，一律落待指派（由上级或 HR 改派）。
     */
    private LaunchTargets resolveTargets(HrPerfPlanLaunchDTO dto) {
        Set<Long> deptIds = collectDeptIds(dto.getDeptIds());
        LambdaQueryWrapper<SysUser> wrapper = new LambdaQueryWrapper<SysUser>()
                .eq(SysUser::getStatus, 1)
                .in(SysUser::getDepartmentId, deptIds.isEmpty() ? List.of(-1L) : deptIds)
                .orderByAsc(SysUser::getId);
        List<String> levels = dto.getPositionLevels();
        if (levels != null && !levels.isEmpty()) {
            wrapper.in(SysUser::getJobLevel, levels);
        }
        List<SysUser> users = sysUserMapper.selectList(wrapper);
        Map<Long, SysDepartment> deptMap = users.isEmpty() ? Map.of()
                : sysDepartmentMapper.selectBatchIds(deptIds).stream()
                .collect(Collectors.toMap(SysDepartment::getId, d -> d, (a, b) -> a));
        Map<Long, List<SysUser>> byDept = users.stream()
                .filter(u -> u.getDepartmentId() != null)
                .collect(Collectors.groupingBy(SysUser::getDepartmentId));

        Map<Long, SysUser> evaluatorByUser = new HashMap<>();
        List<UnassignedTarget> unassigned = new ArrayList<>();
        for (SysUser u : users) {
            SysDepartment dept = deptMap.get(u.getDepartmentId());
            List<SysUser> deptUsers = byDept.getOrDefault(u.getDepartmentId(), List.of());
            SysUser leader = resolveDeptLeader(dept, deptUsers);
            if (leader == null) {
                unassigned.add(new UnassignedTarget(u, "部門負責人未設定或姓名存在歧義，請指派評估人"));
            } else if (Objects.equals(leader.getId(), u.getId())) {
                unassigned.add(new UnassignedTarget(u, "被考核人即部門負責人本人，需由上級或 HR 指派"));
            } else {
                evaluatorByUser.put(u.getId(), leader);
            }
        }
        return new LaunchTargets(users, evaluatorByUser, unassigned);
    }

    /** 部门内唯一同名才认定为负责人；未设定或同名多人一律返回空（宁缺勿错） */
    private SysUser resolveDeptLeader(SysDepartment dept, List<SysUser> deptUsers) {
        if (dept == null || !StringUtils.hasText(dept.getLeader())) {
            return null;
        }
        List<SysUser> matched = deptUsers.stream()
                .filter(u -> dept.getLeader().trim().equals(u.getName()))
                .toList();
        return matched.size() == 1 ? matched.get(0) : null;
    }

    /** 展开为「选中部门 + 其全部下级」，带深度上限防环 */
    private Set<Long> collectDeptIds(List<Long> selected) {
        Set<Long> result = new HashSet<>();
        if (selected == null || selected.isEmpty()) {
            return result;
        }
        List<SysDepartment> all = sysDepartmentMapper.selectList(new LambdaQueryWrapper<SysDepartment>()
                .select(SysDepartment::getId, SysDepartment::getParentId));
        Map<Long, List<Long>> children = new HashMap<>();
        for (SysDepartment d : all) {
            if (d.getParentId() != null) {
                children.computeIfAbsent(d.getParentId(), k -> new ArrayList<>()).add(d.getId());
            }
        }
        Deque<Long> queue = new ArrayDeque<>(selected);
        int depth = 0;
        while (!queue.isEmpty() && depth <= MAX_DEPT_DEPTH) {
            Long current = queue.poll();
            if (current == null || !result.add(current)) {
                continue;
            }
            queue.addAll(children.getOrDefault(current, List.of()));
            depth++;
        }
        return result;
    }

    // ==================== 内部：校验与工具 ====================

    private Long currentUserId() {
        SysUser user = operatorResolver.currentUser();
        if (user == null || user.getId() == null) {
            throw new PermissionDeniedException(HrPerfConstants.MENU_DOMAIN, "view");
        }
        return user.getId();
    }

    private boolean has(String menuKey, String action) {
        SysUser user = operatorResolver.currentUser();
        return user != null && permissionService.hasPermission(user, menuKey, action);
    }

    private void require(String menuKey, String action) {
        if (!has(menuKey, action)) {
            throw new PermissionDeniedException(menuKey, action);
        }
    }

    private <T> Page<T> paged(long page, long size) {
        return new Page<>(PageResult.normalizePage(page), PageResult.normalizeSize(size));
    }

    private HrPerfCycle requireCycle(Long id) {
        HrPerfCycle entity = id == null ? null : cycleMapper.selectById(id);
        if (entity == null) {
            throw new BusinessException("考核週期不存在");
        }
        return entity;
    }

    private HrPerfTemplate requireTemplate(Long id) {
        HrPerfTemplate entity = id == null ? null : templateMapper.selectById(id);
        if (entity == null) {
            throw new BusinessException("考核模板不存在");
        }
        return entity;
    }

    private HrPerfPlan requirePlan(Long id) {
        HrPerfPlan entity = id == null ? null : planMapper.selectById(id);
        if (entity == null) {
            throw new BusinessException("考核計劃不存在");
        }
        return entity;
    }

    private HrPerfAssessment requireAssessment(Long id) {
        HrPerfAssessment entity = id == null ? null : assessmentMapper.selectById(id);
        if (entity == null) {
            throw new BusinessException("考核單不存在");
        }
        return entity;
    }

    private Long templateIdOf(Long planId) {
        return requirePlan(planId).getTemplateId();
    }

    private List<HrPerfScoreItem> itemsOf(Long assessmentId) {
        return scoreItemMapper.selectList(new LambdaQueryWrapper<HrPerfScoreItem>()
                .eq(HrPerfScoreItem::getAssessmentId, assessmentId)
                .orderByAsc(HrPerfScoreItem::getId));
    }

    private String seq(String ruleKey, String fallbackPrefix) {
        try {
            return bizSeqService.next(ruleKey);
        } catch (Exception e) {
            log.warn("編號規則 {} 不可用，回退時間戳: {}", ruleKey, e.getMessage());
            return fallbackPrefix + LocalDate.now().toString().replace("-", "")
                    + String.format("%04d", (int) (System.nanoTime() % 10000));
        }
    }

    private static String trim(String v) {
        return v == null ? null : v.trim();
    }

    private static String nullSafe(String v) {
        return v == null ? "" : v;
    }
}
