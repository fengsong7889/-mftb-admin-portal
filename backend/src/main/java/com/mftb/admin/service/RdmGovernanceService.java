package com.mftb.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.RdmGovernanceDTO;
import com.mftb.admin.dto.RdmGovernanceVO;
import com.mftb.admin.entity.RdmHrSuggestion;
import com.mftb.admin.entity.RdmScoreBudget;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.RdmHrSuggestionMapper;
import com.mftb.admin.mapper.RdmScoreBudgetMapper;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 绩效治理服务（阶段 6：贡献预算 + HR 建议流程）。
 *
 * <p>这段流程存在的理由：积分脚本算出的数字不能直接变成考核结果。
 * 规则可以被误解、工时可以被漏报、部门可以超编，这些都需要一个人在留下姓名与意见之后
 * 才让数字进入考核单；出问题时也要能撤回，而不是留下一个改不掉的"建议"。
 *
 * <p>四条不可让的口径：
 * <ol>
 *   <li>建议必须由流水聚合而来，{@code record_count=0} 的人不出建议（无依据的数字不进考核）；</li>
 *   <li>重算只刷新数字；数字变了就把已确认的建议退回待复核——人工确认只对当时的数据有效；</li>
 *   <li>超预算的人必须有 PMO 书面说明才能确认推送；预算只预警、不折算个人分数；</li>
 *   <li>推送只写 hr_perf_score_item 的 suggested_* 通道，撤回会把该通道清空，
 *       绝不触碰 self_score / supervisor_score / final_score。</li>
 * </ol>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RdmGovernanceService {

    /** 建议依据的分项快照最多留多少条（再多会让单行 JSON 过大，明细仍可回流水表查） */
    private static final int BREAKDOWN_LIMIT = 40;

    /** 无预算时的占用比例占位（不参与超限判断） */
    private static final BigDecimal HUNDRED = new BigDecimal("100");
    /**
     * 占用百分比写库上限（对应 budget_used_ratio DECIMAL(9,2)）。
     * <p>深度测试实测：预算上限 5 分而部门产出 214.78 分时占用 4295.6%，原 DECIMAL(5,2) 存不下，
     * 写回预算标记时 Out of range，整条聚合建议失败。预算超限只是个提醒信号，
     * 不应该把整个治理流程弄崩，所以这里截断（v2.3 已同时扩列到 DECIMAL(9,2)）。
     */
    private static final BigDecimal RATIO_CAP = new BigDecimal("9999999.99");

    private static final ObjectMapper JSON = new ObjectMapper();

    private final RdmScoreBudgetMapper budgetMapper;
    private final RdmHrSuggestionMapper suggestionMapper;
    private final OperatorResolver operatorResolver;
    private final JdbcTemplate jdbcTemplate;

    /* ==================== 预算 ==================== */

    /** 某周期的预算与实时占用 */
    public List<RdmGovernanceVO.Budget> budgets(String periodCode) {
        String period = requirePeriod(periodCode);
        List<RdmScoreBudget> rows = budgetMapper.selectList(new LambdaQueryWrapper<RdmScoreBudget>()
                .eq(RdmScoreBudget::getPeriodCode, period)
                .orderByAsc(RdmScoreBudget::getDeptId));
        Map<Long, BigDecimal> usedByDept = usedScoreByDept(period);
        BigDecimal total = usedByDept.values().stream().reduce(BigDecimal.ZERO, BigDecimal::add);

        List<RdmGovernanceVO.Budget> list = new ArrayList<>();
        for (RdmScoreBudget row : rows) {
            RdmGovernanceVO.Budget vo = new RdmGovernanceVO.Budget();
            vo.setId(row.getId());
            vo.setPeriodCode(row.getPeriodCode());
            vo.setDeptId(row.getDeptId());
            vo.setDeptName(row.getDeptName());
            vo.setScoreBudget(row.getScoreBudget());
            vo.setWarningRatio(row.getWarningRatio());
            vo.setRemark(row.getRemark());
            vo.setUpdatedBy(row.getUpdatedBy());
            vo.setUpdatedAt(com.mftb.admin.util.DateTimeUtils.format(row.getUpdatedAt()));
            BigDecimal used = isCompany(row.getDeptId()) ? total : usedByDept.getOrDefault(row.getDeptId(), BigDecimal.ZERO);
            vo.setUsed(used.setScale(1, RoundingMode.HALF_UP));
            BigDecimal budget = row.getScoreBudget() == null ? BigDecimal.ZERO : row.getScoreBudget();
            BigDecimal ratio = budget.signum() <= 0 ? BigDecimal.ZERO
                    : used.multiply(HUNDRED).divide(budget, 1, RoundingMode.HALF_UP);
            vo.setUsedRatio(ratio);
            BigDecimal warning = row.getWarningRatio() == null ? new BigDecimal("80") : row.getWarningRatio();
            vo.setWarning(ratio.compareTo(warning) >= 0);
            vo.setOver(ratio.compareTo(HUNDRED) > 0);
            list.add(vo);
        }
        return list;
    }

    /** 保存预算（周期+部门唯一，重复提交视为修订） */
    @Transactional(rollbackFor = Exception.class)
    public RdmGovernanceVO.Budget saveBudget(RdmGovernanceDTO.Budget form) {
        if (form == null || !StringUtils.hasText(form.getPeriodCode())) {
            throw new BusinessException("請選擇績效周期");
        }
        if (form.getScoreBudget() == null || form.getScoreBudget().signum() <= 0) {
            throw new BusinessException("預算上限必須大於 0");
        }
        if (form.getScoreBudget().compareTo(new BigDecimal("10000000")) > 0) {
            throw new BusinessException("預算上限過大，請確認是否填錯單位");
        }
        // 没有依据的预算只是一个可以被随手改动的数字，起不到控制作用
        if (!StringUtils.hasText(form.getRemark())) {
            throw new BusinessException("預算必須填寫依據（人力/迭代容量/歷史均值），否則只是一個可被隨心改動的數字");
        }
        Long deptId = form.getDeptId() == null ? RdmScoreBudget.COMPANY_DIM : form.getDeptId();
        SysUser current = operatorResolver.currentUser();
        String signature = operatorResolver.operatorSignature(current);

        RdmScoreBudget existing = budgetMapper.selectOne(new LambdaQueryWrapper<RdmScoreBudget>()
                .eq(RdmScoreBudget::getPeriodCode, form.getPeriodCode().trim())
                .eq(RdmScoreBudget::getDeptId, deptId).last("LIMIT 1"));
        RdmScoreBudget row = existing == null ? new RdmScoreBudget() : existing;
        row.setPeriodCode(form.getPeriodCode().trim());
        row.setDeptId(deptId);
        row.setDeptName(isCompany(deptId) ? "全員" : deptName(deptId));
        row.setScoreBudget(form.getScoreBudget());
        row.setWarningRatio(form.getWarningRatio() == null ? new BigDecimal("80.00") : clampRatio(form.getWarningRatio()));
        row.setRemark(form.getRemark().trim());
        if (row.getId() == null) {
            row.setCreatedBy(signature);
            row.setUpdatedBy(signature);
            budgetMapper.insert(row);
        } else {
            row.setUpdatedBy(signature);
            budgetMapper.updateById(row);
        }
        log.info("貢獻分預算已保存: period={}, deptId={}, budget={}, by={}",
                row.getPeriodCode(), deptId, row.getScoreBudget(), signature);
        // 预算变动会影响超限标记：刷新已生成的建议，避免拿着旧阈值放行
        refreshBudgetFlags(row.getPeriodCode());
        return budgets(row.getPeriodCode()).stream()
                .filter(b -> b.getId().equals(row.getId())).findFirst().orElseGet(() -> {
                    RdmGovernanceVO.Budget vo = new RdmGovernanceVO.Budget();
                    vo.setId(row.getId());
                    vo.setPeriodCode(row.getPeriodCode());
                    vo.setDeptId(row.getDeptId());
                    vo.setDeptName(row.getDeptName());
                    vo.setScoreBudget(row.getScoreBudget());
                    vo.setWarningRatio(row.getWarningRatio());
                    vo.setRemark(row.getRemark());
                    return vo;
                });
    }

    /** 删除预算 */
    @Transactional(rollbackFor = Exception.class)
    public void deleteBudget(Long id) {
        RdmScoreBudget row = budgetMapper.selectById(id);
        if (row == null) {
            return;
        }
        budgetMapper.deleteById(id);
        refreshBudgetFlags(row.getPeriodCode());
    }

    /* ==================== HR 建议 ==================== */

    /** 建议清单 */
    public List<RdmGovernanceVO.Suggestion> suggestions(String periodCode, String status, Long deptId) {
        String period = requirePeriod(periodCode);
        List<RdmHrSuggestion> rows = suggestionMapper.selectList(new LambdaQueryWrapper<RdmHrSuggestion>()
                .eq(RdmHrSuggestion::getPeriodCode, period)
                .eq(StringUtils.hasText(status), RdmHrSuggestion::getStatus, status)
                .eq(deptId != null, RdmHrSuggestion::getDeptId, deptId)
                .orderByDesc(RdmHrSuggestion::getTotalScore).orderByAsc(RdmHrSuggestion::getUserId));
        List<RdmGovernanceVO.Suggestion> list = new ArrayList<>();
        for (RdmHrSuggestion row : rows) {
            RdmGovernanceVO.Suggestion vo = RdmGovernanceVO.from(row);
            applyActionable(vo, row);
            list.add(vo);
        }
        return list;
    }

    /**
     * 从积分流水聚合建议（幂等）。
     * <p>分数变化会把该人已确认的建议退回待复核：人工确认只针对当时的数字，
     * 重算之后继续按旧确认推送等于偷偷改了考核依据。
     */
    @Transactional(rollbackFor = Exception.class)
    public int generate(String periodCode) {
        String period = requirePeriod(periodCode);
        List<Map<String, Object>> aggregates = jdbcTemplate.queryForList(
                "SELECT user_id, MAX(emp_no) AS emp_no, MAX(user_name) AS user_name, "
                        + "MAX(dept_id) AS dept_id, MAX(dept_name) AS dept_name, "
                        + "SUM(score) AS total_score, COUNT(*) AS record_count, COUNT(DISTINCT req_id) AS delivered_count, "
                        + "AVG(CASE WHEN acceptance_score BETWEEN 1 AND 5 THEN acceptance_score END) AS avg_acceptance, "
                        + "SUM(CASE WHEN first_pass = 1 THEN 1 ELSE 0 END) AS first_pass_count, "
                        + "MAX(rule_version) AS rule_version "
                        + "FROM rdm_score_record WHERE deleted = 0 AND period_code = ? AND score > 0 "
                        + "GROUP BY user_id HAVING COUNT(*) > 0", period);
        if (aggregates.isEmpty()) {
            throw new BusinessException("該周期還沒有任何積分流水，請先執行積分重算");
        }
        String signature = operatorResolver.operatorSignature(operatorResolver.currentUser());
        int written = 0;
        for (Map<String, Object> agg : aggregates) {
            Long userId = asLong(agg.get("user_id"));
            BigDecimal total = asDecimal(agg.get("total_score"));
            List<Map<String, Object>> detail = jdbcTemplate.queryForList(
                    "SELECT req_id, role_code, score, rule_version FROM rdm_score_record "
                            + "WHERE deleted = 0 AND period_code = ? AND user_id = ? ORDER BY score DESC LIMIT " + BREAKDOWN_LIMIT,
                    period, userId);
            // 分数变了要退回待复核，所以先取出旧值比较
            RdmHrSuggestion existing = suggestionMapper.selectOne(new LambdaQueryWrapper<RdmHrSuggestion>()
                    .eq(RdmHrSuggestion::getPeriodCode, period).eq(RdmHrSuggestion::getUserId, userId).last("LIMIT 1"));
            boolean scoreChanged = existing != null && existing.getTotalScore() != null
                    && existing.getTotalScore().compareTo(total) != 0;
            String sql = "INSERT INTO rdm_hr_suggestion (period_code, user_id, emp_no, user_name, dept_id, dept_name, "
                    + "total_score, record_count, delivered_count, avg_acceptance_score, first_pass_count, "
                    + "breakdown_json, rule_version, status, generated_at, created_by, updated_by, deleted) "
                    // 18 列 = 14 個參數 + generated_at=NOW() + 2 個簽名 + deleted=0；多一个 ? 就会在运行期报参数不足
                    + "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW(),?,?,0) "
                    + "ON DUPLICATE KEY UPDATE emp_no = VALUES(emp_no), user_name = VALUES(user_name), "
                    + "dept_id = VALUES(dept_id), dept_name = VALUES(dept_name), total_score = VALUES(total_score), "
                    + "record_count = VALUES(record_count), delivered_count = VALUES(delivered_count), "
                    + "avg_acceptance_score = VALUES(avg_acceptance_score), first_pass_count = VALUES(first_pass_count), "
                    + "breakdown_json = VALUES(breakdown_json), rule_version = VALUES(rule_version), "
                    + "status = CASE WHEN total_score <> VALUES(total_score) THEN 'draft' ELSE status END, "
                    + "generated_at = NOW(), updated_by = VALUES(updated_by), deleted = 0";
            Object[] args = new Object[]{
                    period, userId, agg.get("emp_no"), agg.get("user_name"), agg.get("dept_id"), agg.get("dept_name"),
                    total, asInt(agg.get("record_count")), asInt(agg.get("delivered_count")),
                    agg.get("avg_acceptance"), asInt(agg.get("first_pass_count")),
                    toJson(detail), agg.get("rule_version"), RdmHrSuggestion.STATUS_DRAFT, signature, signature};
            jdbcTemplate.update(com.mftb.admin.util.SqlArgs.requireArgCount(sql, args), args);
            if (scoreChanged && existing != null && !RdmHrSuggestion.STATUS_DRAFT.equals(existing.getStatus())) {
                log.info("建議分數已變化，退回待復核: period={}, userId={}, {} -> {}",
                        period, userId, existing.getStatus(), RdmHrSuggestion.STATUS_DRAFT);
            }
            written++;
        }
        refreshBudgetFlags(period);
        log.info("HR 績效建議已聚合: period={}, 人數={}, by={}", period, written, signature);
        return written;
    }

    /** 复核：确认或驳回 */
    @Transactional(rollbackFor = Exception.class)
    public RdmGovernanceVO.Suggestion review(Long id, RdmGovernanceDTO.Review form) {
        RdmHrSuggestion row = requireSuggestion(id);
        if (!RdmHrSuggestion.STATUS_DRAFT.equals(row.getStatus()) && !RdmHrSuggestion.STATUS_WITHDRAWN.equals(row.getStatus())) {
            throw new BusinessException("該建議已復核（" + row.getStatus() + "），不可重複操作");
        }
        boolean confirmed = Boolean.TRUE.equals(form == null ? null : form.getConfirmed());
        String remark = form == null ? null : trimToNull(form.getRemark());
        // 超限必须留下书面说明：否则预算控制只在数字好看时有效
        if (confirmed && Integer.valueOf(1).equals(row.getOverBudget()) && remark == null) {
            throw new BusinessException("該成員已超出部門預算，請填寫復核說明後再確認");
        }
        if (!confirmed && remark == null) {
            throw new BusinessException("驳回建議必須寫明原因，否則聚合時會反復生成同一條");
        }
        SysUser current = operatorResolver.currentUser();
        /*
         * 不能复核自己的绩效建议——与发布闸门的四眼原则同一口径，
         * 系统管理员保留例外仅限运维应急（否则单人环境下这段流程永远跑不通）。
         */
        if (current != null && current.getId().equals(row.getUserId()) && !operatorResolver.isAdmin(current)) {
            throw new BusinessException("不能復核自己的績效建議，請由 PMO 或主管處理");
        }
        row.setStatus(confirmed ? RdmHrSuggestion.STATUS_CONFIRMED : RdmHrSuggestion.STATUS_WITHDRAWN);
        row.setReviewerUserId(current == null ? null : current.getId());
        row.setReviewerName(current == null ? null : current.getName());
        row.setReviewTime(LocalDateTime.now());
        row.setReviewRemark(remark);
        row.setUpdatedBy(operatorResolver.operatorSignature(current));
        suggestionMapper.updateById(row);
        RdmGovernanceVO.Suggestion vo = RdmGovernanceVO.from(row);
        applyActionable(vo, row);
        return vo;
    }

    /**
     * 推送已确认的建议到考核单建议通道。
     * <p>只更新该周期内已有 RDM 产出指标行的考核单；没配指标的人不会被静默造条目（那等于替 HR 决定考核结构）。
     */
    @Transactional(rollbackFor = Exception.class)
    public int push(String periodCode) {
        String period = requirePeriod(periodCode);
        List<RdmHrSuggestion> confirmed = suggestionMapper.selectList(new LambdaQueryWrapper<RdmHrSuggestion>()
                .eq(RdmHrSuggestion::getPeriodCode, period)
                .eq(RdmHrSuggestion::getStatus, RdmHrSuggestion.STATUS_CONFIRMED));
        if (confirmed.isEmpty()) {
            throw new BusinessException("沒有已確認的建議：請先完成復核（狀態=已確認）再推送");
        }
        long overWithoutRemark = confirmed.stream()
                .filter(s -> Integer.valueOf(1).equals(s.getOverBudget()))
                .filter(s -> !StringUtils.hasText(s.getReviewRemark()))
                .count();
        if (overWithoutRemark > 0) {
            throw new BusinessException("有 " + overWithoutRemark + " 人超出預算但沒有復核說明，已阻斷推送");
        }
        String signature = operatorResolver.operatorSignature(operatorResolver.currentUser());
        LocalDateTime now = LocalDateTime.now();
        int pushed = 0;
        for (RdmHrSuggestion suggestion : confirmed) {
            int updated = jdbcTemplate.update(
                    "UPDATE hr_perf_score_item si "
                            + "JOIN hr_perf_assessment a ON a.id = si.assessment_id AND a.deleted = 0 "
                            + "JOIN hr_perf_plan p ON p.id = a.plan_id AND p.deleted = 0 "
                            + "JOIN hr_perf_cycle c ON c.id = p.cycle_id AND c.deleted = 0 "
                            + "JOIN hr_perf_indicator i ON i.id = si.indicator_id AND i.deleted = 0 "
                            + "AND i.indicator_type = ? "
                            + "SET si.suggested_score = ?, si.suggested_source = ?, si.suggested_at = ?, si.updated_by = ? "
                            + "WHERE si.deleted = 0 AND c.code = ? AND a.user_id = ?",
                    RdmConstants.INDICATOR_TYPE_RDM_OUTPUT, suggestion.getTotalScore(),
                    RdmConstants.SUGGEST_SOURCE_RDM, now, signature, period, suggestion.getUserId());
            if (updated == 0) {
                // 单条失败不回滚整批：先记下，让 PMO 知道谁没进考核单，而不是假装全推成功
                log.warn("績效建議未匹配到考核指標行: period={}, userId={}, name={}",
                        period, suggestion.getUserId(), suggestion.getUserName());
                continue;
            }
            suggestion.setStatus(RdmHrSuggestion.STATUS_PUSHED);
            suggestion.setPushedAt(now);
            suggestion.setUpdatedBy(signature);
            suggestionMapper.updateById(suggestion);
            pushed++;
        }
        jdbcTemplate.update("UPDATE rdm_score_record SET push_status = ?, pushed_at = ?, updated_by = ? "
                        + "WHERE deleted = 0 AND period_code = ? AND push_status = ?",
                RdmConstants.PUSH_SUGGESTED, now, signature, period, RdmConstants.PUSH_NONE);
        if (pushed == 0) {
            throw new BusinessException("該周期沒有匹配到 RDM 產出指標（" + RdmConstants.INDICATOR_TYPE_RDM_OUTPUT
                    + "）的考核單，請先在績效模板中新增該指標");
        }
        log.info("HR 績效建議已推送: period={}, 人數={}", period, pushed);
        return pushed;
    }

    /** 撤回已推送的建议：清空考核单建议通道，保留本地留痕 */
    @Transactional(rollbackFor = Exception.class)
    public RdmGovernanceVO.Suggestion withdraw(Long id, String reason) {
        RdmHrSuggestion row = requireSuggestion(id);
        if (!RdmHrSuggestion.STATUS_PUSHED.equals(row.getStatus())) {
            throw new BusinessException("只有已推送的建議可撤回");
        }
        if (!StringUtils.hasText(reason)) {
            throw new BusinessException("撤回必須填寫原因，HR 需要知道這條建議為什麼沒了");
        }
        SysUser current = operatorResolver.currentUser();
        jdbcTemplate.update(
                "UPDATE hr_perf_score_item si "
                        + "JOIN hr_perf_assessment a ON a.id = si.assessment_id AND a.deleted = 0 "
                        + "JOIN hr_perf_plan p ON p.id = a.plan_id AND p.deleted = 0 "
                        + "JOIN hr_perf_cycle c ON c.id = p.cycle_id AND c.deleted = 0 "
                        + "JOIN hr_perf_indicator i ON i.id = si.indicator_id AND i.deleted = 0 "
                        + "AND i.indicator_type = ? "
                        + "SET si.suggested_score = NULL, si.suggested_source = NULL, si.suggested_at = NULL, si.updated_by = ? "
                        + "WHERE si.deleted = 0 AND c.code = ? AND a.user_id = ?",
                RdmConstants.INDICATOR_TYPE_RDM_OUTPUT, operatorResolver.operatorSignature(current),
                row.getPeriodCode(), row.getUserId());
        row.setStatus(RdmHrSuggestion.STATUS_WITHDRAWN);
        /*
         * 撤回必须同时回退流水的推送标记：推送会把 rdm_score_record.push_status 置为已推建议，
         * 若撤回不回退，看板会长期显示“已推送”而考核单上的建议值其实已被清空（阶段 6 端到端实测的不对称）。
         */
        jdbcTemplate.update("UPDATE rdm_score_record SET push_status = ?, pushed_at = NULL, updated_by = ? "
                        + "WHERE deleted = 0 AND period_code = ? AND user_id = ? AND push_status = ?",
                RdmConstants.PUSH_NONE, operatorResolver.operatorSignature(current),
                row.getPeriodCode(), row.getUserId(), RdmConstants.PUSH_SUGGESTED);
        row.setReviewRemark(mergeRemark(row.getReviewRemark(), "撤回：" + reason.trim()));
        row.setReviewerUserId(current == null ? null : current.getId());
        row.setReviewerName(current == null ? null : current.getName());
        row.setReviewTime(LocalDateTime.now());
        row.setUpdatedBy(operatorResolver.operatorSignature(current));
        suggestionMapper.updateById(row);
        log.info("HR 績效建議已撤回: period={}, userId={}, reason={}", row.getPeriodCode(), row.getUserId(), reason);
        RdmGovernanceVO.Suggestion vo = RdmGovernanceVO.from(row);
        applyActionable(vo, row);
        return vo;
    }

    /* ==================== 辅助 ==================== */

    /** 预算变化后刷新建议上的占用与超限标记 */
    private void refreshBudgetFlags(String periodCode) {
        Map<Long, BigDecimal> used = usedScoreByDept(periodCode);
        BigDecimal total = used.values().stream().reduce(BigDecimal.ZERO, BigDecimal::add);
        for (RdmScoreBudget budget : budgetMapper.selectList(new LambdaQueryWrapper<RdmScoreBudget>()
                .eq(RdmScoreBudget::getPeriodCode, periodCode))) {
            boolean company = isCompany(budget.getDeptId());
            BigDecimal base = company ? total : used.getOrDefault(budget.getDeptId(), BigDecimal.ZERO);
            BigDecimal ratio = budget.getScoreBudget() == null || budget.getScoreBudget().signum() <= 0
                    ? null : base.multiply(HUNDRED).divide(budget.getScoreBudget(), 1, RoundingMode.HALF_UP).min(RATIO_CAP);
            Integer over = ratio != null && ratio.compareTo(HUNDRED) > 0 ? 1 : 0;
            // 全员预算覆盖所有人，部门预算只标记本部门：分两个分支写，不拼条件占位符
            if (company) {
                jdbcTemplate.update("UPDATE rdm_hr_suggestion SET budget_used_ratio = ?, over_budget = ?, updated_by = ? "
                        + "WHERE deleted = 0 AND period_code = ?", ratio, over, SYSTEM_OPERATOR, periodCode);
            } else {
                jdbcTemplate.update("UPDATE rdm_hr_suggestion SET budget_used_ratio = ?, over_budget = ?, updated_by = ? "
                        + "WHERE deleted = 0 AND period_code = ? AND dept_id = ?", ratio, over, SYSTEM_OPERATOR, periodCode,
                        budget.getDeptId());
            }
        }
    }

    /** 各部门本周期已产生的贡献分合计 */
    private Map<Long, BigDecimal> usedScoreByDept(String periodCode) {
        Map<Long, BigDecimal> map = new LinkedHashMap<>();
        jdbcTemplate.query("SELECT COALESCE(dept_id, 0) AS dept_id, SUM(score) AS total FROM rdm_score_record "
                        + "WHERE deleted = 0 AND period_code = ? GROUP BY COALESCE(dept_id, 0)",
                rs -> {
                    map.put(rs.getLong("dept_id"), rs.getBigDecimal("total"));
                }, periodCode);
        return map;
    }

    private String deptName(Long deptId) {
        if (deptId == null) {
            return null;
        }
        List<String> names = jdbcTemplate.queryForList("SELECT name FROM sys_department WHERE id = ? LIMIT 1",
                String.class, deptId);
        return names.isEmpty() ? null : names.get(0);
    }

    private RdmHrSuggestion requireSuggestion(Long id) {
        RdmHrSuggestion row = id == null ? null : suggestionMapper.selectById(id);
        if (row == null) {
            throw new BusinessException("建議記錄不存在");
        }
        return row;
    }

    /** 前端据此置灰：可确认的状态只有 draft/withdrawn，且必须有流水依据 */
    private static void applyActionable(RdmGovernanceVO.Suggestion vo, RdmHrSuggestion row) {
        boolean draftLike = RdmHrSuggestion.STATUS_DRAFT.equals(row.getStatus())
                || RdmHrSuggestion.STATUS_WITHDRAWN.equals(row.getStatus());
        if (row.getRecordCount() == null || row.getRecordCount() == 0) {
            vo.setActionable(false);
            vo.setBlockedReason("沒有積分流水依據");
            return;
        }
        if (RdmHrSuggestion.STATUS_PUSHED.equals(row.getStatus())) {
            vo.setActionable(false);
            vo.setBlockedReason("已推送，只能撤回");
            return;
        }
        vo.setActionable(draftLike);
        vo.setBlockedReason(draftLike ? null : "已復核，不可重複操作");
    }

    private String requirePeriod(String periodCode) {
        if (!StringUtils.hasText(periodCode)) {
            List<String> codes = jdbcTemplate.queryForList(
                    "SELECT code FROM hr_perf_cycle WHERE deleted = 0 AND status = 'published' "
                            + "ORDER BY period_start DESC LIMIT 1", String.class);
            if (codes.isEmpty()) {
                throw new BusinessException("還沒有可用的績效周期");
            }
            return codes.get(0);
        }
        List<String> codes = jdbcTemplate.queryForList(
                "SELECT code FROM hr_perf_cycle WHERE deleted = 0 AND code = ? LIMIT 1", String.class, periodCode.trim());
        if (codes.isEmpty()) {
            throw new BusinessException("績效周期不存在: " + periodCode);
        }
        return codes.get(0);
    }

    /** 系统作业的操作人签名（预算联动刷新不属于某个人的动作） */
    private static final String SYSTEM_OPERATOR = "system";

    private static boolean isCompany(Long deptId) {
        return deptId == null || deptId == RdmScoreBudget.COMPANY_DIM;
    }

    private static BigDecimal clampRatio(BigDecimal ratio) {
        if (ratio.signum() < 0) {
            throw new BusinessException("預警閾值不能為負數");
        }
        return ratio.compareTo(new BigDecimal("500")) > 0 ? new BigDecimal("500") : ratio;
    }

    private static String mergeRemark(String oldRemark, String append) {
        if (!StringUtils.hasText(oldRemark)) {
            return append;
        }
        String merged = oldRemark + "；" + append;
        return merged.length() > 490 ? merged.substring(merged.length() - 490) : merged;
    }

    private static String trimToNull(String value) {
        return StringUtils.hasText(value) ? value.trim() : null;
    }

    private static String toJson(Object value) {
        try {
            return JSON.writeValueAsString(value);
        } catch (Exception e) {
            // 依据快照存不下就等于申诉时无法复算，必须失败回滚
            throw new BusinessException("建議依據序列化失敗：" + e.getMessage());
        }
    }

    private static Long asLong(Object value) {
        return value == null ? null : ((Number) value).longValue();
    }

    private static Integer asInt(Object value) {
        return value == null ? 0 : ((Number) value).intValue();
    }

    private static BigDecimal asDecimal(Object value) {
        if (value == null) {
            return BigDecimal.ZERO;
        }
        return value instanceof BigDecimal ? (BigDecimal) value : new BigDecimal(value.toString());
    }
}
