package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.mftb.admin.constant.HrPerfConstants;
import com.mftb.admin.entity.HrPerfAssessment;
import com.mftb.admin.entity.HrPerfPlan;
import com.mftb.admin.entity.HrPerfScoreItem;
import com.mftb.admin.entity.HrPerfTemplate;
import com.mftb.admin.mapper.HrPerfAssessmentMapper;
import com.mftb.admin.mapper.HrPerfPlanMapper;
import com.mftb.admin.mapper.HrPerfScoreItemMapper;
import com.mftb.admin.mapper.HrPerfTemplateMapper;
import com.mftb.admin.service.HrPerfCallbackService;
import com.mftb.admin.util.HrPerfGradeUtils;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 績效考核确认回调实现（独立事务：批量下发失败只回滚本回调，不影响 OA 流程落库）。
 * <p>
 * 幂等：计划已确认则直接跳过；驳回只处理仍处于待确认的计划。
 * 最终得分优先取校准值，其次上级加权值，最后自评级值（正常流程三者必有其一，提交前已校验）。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class HrPerfCallbackServiceImpl implements HrPerfCallbackService {

    private final HrPerfPlanMapper planMapper;
    private final HrPerfAssessmentMapper assessmentMapper;
    private final HrPerfScoreItemMapper scoreItemMapper;
    private final HrPerfTemplateMapper templateMapper;
    private final OperatorResolver operatorResolver;

    @Override
    public boolean isPerfProcess(String processCode) {
        return HrPerfConstants.PROCESS_CODE.equals(processCode);
    }

    @Override
    @Transactional(propagation = Propagation.REQUIRES_NEW, rollbackFor = Exception.class)
    public void onFlowApproved(String flowNo) {
        HrPerfPlan plan = findByFlowNo(flowNo);
        if (plan == null || HrPerfConstants.PLAN_CONFIRMED.equals(plan.getStatus())) {
            return;
        }
        HrPerfTemplate template = plan.getTemplateId() == null
                ? null : templateMapper.selectById(plan.getTemplateId());
        String operator = operatorResolver.currentOperatorName();
        LocalDateTime now = LocalDateTime.now();

        List<HrPerfAssessment> targets = assessmentMapper.selectList(new LambdaQueryWrapper<HrPerfAssessment>()
                .eq(HrPerfAssessment::getPlanId, plan.getId())
                .eq(HrPerfAssessment::getStatus, HrPerfConstants.A_CONFIRM_PENDING));
        for (HrPerfAssessment a : targets) {
            BigDecimal score = firstNonNull(a.getCalibratedScore(), a.getSupervisorScore(), a.getSelfScore());
            a.setFinalScore(score);
            a.setFinalGrade(StringUtils.hasText(a.getCalibratedGrade())
                    ? a.getCalibratedGrade() : mapGrade(template, score));
            a.setStatus(HrPerfConstants.A_CONFIRMED);
            a.setConfirmedAt(now);
            a.setUpdatedBy(operator);
            a.setUpdatedAt(now);
            assessmentMapper.updateById(a);
            // 指标最终分随结果一并下发，供员工查看逐项依据
            for (HrPerfScoreItem item : scoreItemMapper.selectList(new LambdaQueryWrapper<HrPerfScoreItem>()
                    .eq(HrPerfScoreItem::getAssessmentId, a.getId()))) {
                BigDecimal itemFinal = firstNonNull(item.getSupervisorScore(), item.getSelfScore());
                if (itemFinal != null && itemFinal.compareTo(nullToZero(item.getFinalScore())) != 0) {
                    item.setFinalScore(itemFinal);
                    item.setUpdatedBy(operator);
                    item.setUpdatedAt(now);
                    scoreItemMapper.updateById(item);
                }
            }
        }
        plan.setStatus(HrPerfConstants.PLAN_CONFIRMED);
        plan.setUpdatedBy(operator);
        plan.setUpdatedAt(now);
        planMapper.updateById(plan);
        log.info("績效結果已下發: plan={}, flowNo={}, 確認人數={}", plan.getReqNo(), flowNo, targets.size());
    }

    @Override
    @Transactional(propagation = Propagation.REQUIRES_NEW, rollbackFor = Exception.class)
    public void onFlowRejected(String flowNo) {
        HrPerfPlan plan = findByFlowNo(flowNo);
        if (plan == null || !HrPerfConstants.PLAN_CONFIRM_PENDING.equals(plan.getStatus())) {
            return;
        }
        String operator = operatorResolver.currentOperatorName();
        LocalDateTime now = LocalDateTime.now();
        // 清空流程绑定，允许 HR 改判后重新提交（updateById 默认忽略 null 字段，必须用 UpdateWrapper 显式置空）
        planMapper.update(null, new LambdaUpdateWrapper<HrPerfPlan>()
                .eq(HrPerfPlan::getId, plan.getId())
                .set(HrPerfPlan::getStatus, HrPerfConstants.PLAN_RUNNING)
                .set(HrPerfPlan::getFlowNo, null)
                .set(HrPerfPlan::getUpdatedBy, operator)
                .set(HrPerfPlan::getUpdatedAt, now));
        plan.setStatus(HrPerfConstants.PLAN_RUNNING);
        plan.setFlowNo(null);
        List<HrPerfAssessment> targets = assessmentMapper.selectList(new LambdaQueryWrapper<HrPerfAssessment>()
                .eq(HrPerfAssessment::getPlanId, plan.getId())
                .eq(HrPerfAssessment::getStatus, HrPerfConstants.A_CONFIRM_PENDING));
        for (HrPerfAssessment a : targets) {
            a.setStatus(HrPerfConstants.A_CALIBRATION_PENDING);
            a.setUpdatedBy(operator);
            a.setUpdatedAt(now);
            assessmentMapper.updateById(a);
        }
        log.info("績效確認被駁回，退回待校準: plan={}, flowNo={}, 回退人數={}", plan.getReqNo(), flowNo, targets.size());
    }

    /** 按模板等级方案取"分值下限不超过得分"的最高等级；无匹配时返回空而不是造一个等级 */
    private String mapGrade(HrPerfTemplate template, BigDecimal score) {
        if (template == null) {
            return null;
        }
        // 口径与台账/校验共用 HrPerfGradeUtils，避免"下发的等级"和"报表统计的等级"算成两套
        return HrPerfGradeUtils.match(HrPerfGradeUtils.parse(template.getGradeScheme()), score);
    }

    private HrPerfPlan findByFlowNo(String flowNo) {
        if (!StringUtils.hasText(flowNo)) {
            return null;
        }
        return planMapper.selectOne(new LambdaQueryWrapper<HrPerfPlan>()
                .eq(HrPerfPlan::getFlowNo, flowNo)
                .last("LIMIT 1"));
    }

    @SafeVarargs
    private static <T> T firstNonNull(T... values) {
        for (T v : values) {
            if (v != null) {
                return v;
            }
        }
        return null;
    }

    private static BigDecimal nullToZero(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v;
    }
}
