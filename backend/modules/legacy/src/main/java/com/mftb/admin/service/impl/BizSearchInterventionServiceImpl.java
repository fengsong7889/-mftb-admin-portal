package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.entity.BizSearchIntervention;
import com.mftb.admin.mapper.BizSearchInterventionMapper;
import com.mftb.admin.service.BizSearchInterventionService;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Set;

/**
 * 搜索商家干预规则服务实现。后端强制乘数区间、有效期上限与原因必填（方案 §9）。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class BizSearchInterventionServiceImpl implements BizSearchInterventionService {

    private static final Set<Integer> TARGET_TYPES = Set.of(1, 2);
    private static final Set<Integer> ACTION_TYPES = Set.of(1, 2, 3, 4);
    private static final BigDecimal DEMOTE_MIN = new BigDecimal("0.30");
    private static final BigDecimal BOOST_MAX = new BigDecimal("1.20");

    private final BizSearchInterventionMapper mapper;
    private final OperatorResolver operatorResolver;

    @Override
    public List<BizSearchIntervention> list(Integer actionType, Integer approvalStatus, Integer status) {
        LambdaQueryWrapper<BizSearchIntervention> wrapper = new LambdaQueryWrapper<>();
        if (actionType != null) wrapper.eq(BizSearchIntervention::getActionType, actionType);
        if (approvalStatus != null) wrapper.eq(BizSearchIntervention::getApprovalStatus, approvalStatus);
        if (status != null) wrapper.eq(BizSearchIntervention::getStatus, status);
        wrapper.orderByDesc(BizSearchIntervention::getId);
        return mapper.selectList(wrapper);
    }

    @Override
    public long create(BizSearchIntervention rule) {
        validate(rule);
        rule.setId(null);
        if (!StringUtils.hasText(rule.getRuleNo())) rule.setRuleNo("GY" + System.currentTimeMillis());
        if (rule.getMultiplier() == null) rule.setMultiplier(BigDecimal.ONE);
        if (rule.getApprovalStatus() == null) rule.setApprovalStatus(1);
        if (rule.getStatus() == null) rule.setStatus(1);
        String operator = operatorResolver.currentOperatorName();
        rule.setCreatedBy(operator);
        rule.setUpdatedBy(operator);
        mapper.insert(rule);
        return rule.getId();
    }

    @Override
    public void update(Long id, BizSearchIntervention rule) {
        BizSearchIntervention existing = mapper.selectById(id);
        if (existing == null) throw new BusinessException("干预规则不存在");
        validate(rule);
        rule.setId(id);
        rule.setRuleNo(existing.getRuleNo());
        rule.setApprovalStatus(existing.getApprovalStatus()); // 改内容需重新审批
        rule.setUpdatedBy(operatorResolver.currentOperatorName());
        mapper.updateById(rule);
    }

    @Override
    public void approve(Long id, boolean approved, String approver) {
        BizSearchIntervention existing = mapper.selectById(id);
        if (existing == null) throw new BusinessException("干预规则不存在");
        if (!StringUtils.hasText(approver)) throw new BusinessException("审批人不能为空");
        existing.setApprovalStatus(approved ? 2 : 3);
        existing.setApprover(approver);
        existing.setUpdatedBy(operatorResolver.currentOperatorName());
        mapper.updateById(existing);
    }

    @Override
    public void delete(Long id) {
        BizSearchIntervention existing = mapper.selectById(id);
        if (existing == null) throw new BusinessException("干预规则不存在");
        mapper.deleteById(id);
    }

    private void validate(BizSearchIntervention r) {
        if (!StringUtils.hasText(r.getRuleName())) throw new BusinessException("干预规则名称不能为空");
        if (r.getRuleName().trim().length() > 60) throw new BusinessException("干预规则名称最多 60 字");
        if (r.getTargetType() == null || !TARGET_TYPES.contains(r.getTargetType())) throw new BusinessException("非法的目标类型");
        if (!StringUtils.hasText(r.getTargetId())) throw new BusinessException("目标集团/门店不能为空");
        if (r.getActionType() == null || !ACTION_TYPES.contains(r.getActionType())) throw new BusinessException("非法的干预动作");
        if (!StringUtils.hasText(r.getReason())) throw new BusinessException("干预原因不能为空");
        if (r.getStartDate() == null || r.getEndDate() == null) throw new BusinessException("生效起止日期必填");
        if (r.getEndDate().isBefore(r.getStartDate())) throw new BusinessException("结束日期不得早于开始日期");
        long days = ChronoUnit.DAYS.between(r.getStartDate(), r.getEndDate()) + 1;
        int action = r.getActionType();
        BigDecimal m = r.getMultiplier() == null ? BigDecimal.ONE : r.getMultiplier();
        switch (action) {
            case 1 -> { // 泛词降权：乘数 0.30~1.00，≤7 天
                if (m.compareTo(DEMOTE_MIN) < 0 || m.compareTo(BigDecimal.ONE) > 0) throw new BusinessException("泛词降权乘数须在 0.30~1.00");
                if (days > 7) throw new BusinessException("泛词降权有效期不得超過 7 天");
            }
            case 2 -> { // 精确准入：无乘数，≤14 天
                if (m.compareTo(BigDecimal.ONE) != 0) throw new BusinessException("精确准入不设乘数");
                if (days > 14) throw new BusinessException("精确准入有效期不得超過 14 天");
            }
            case 3 -> { // 临时扶持：乘数 1.00~1.20，≤7 天
                if (m.compareTo(BigDecimal.ONE) < 0 || m.compareTo(BOOST_MAX) > 0) throw new BusinessException("临时扶持乘数须在 1.00~1.20");
                if (days > 7) throw new BusinessException("临时扶持有效期不得超過 7 天");
            }
            case 4 -> { // 同集团打散：无乘数，≤7 天
                if (m.compareTo(BigDecimal.ONE) != 0) throw new BusinessException("同集团打散不设乘数");
                if (days > 7) throw new BusinessException("同集团打散有效期不得超過 7 天");
            }
            default -> throw new BusinessException("非法的干预动作");
        }
    }
}
