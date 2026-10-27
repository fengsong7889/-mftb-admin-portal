package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.dto.PayrollEnrollmentVO;
import com.mftb.admin.entity.HrEmployment;
import com.mftb.admin.entity.Person;
import com.mftb.admin.entity.PayrollBenefitPlan;
import com.mftb.admin.entity.PayrollEnrollment;
import com.mftb.admin.mapper.HrEmploymentMapper;
import com.mftb.admin.mapper.PersonMapper;
import com.mftb.admin.mapper.PayrollBenefitPlanMapper;
import com.mftb.admin.mapper.PayrollEnrollmentMapper;
import com.mftb.admin.service.PayrollBenefitService;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 福利參保實現。
 * <p>
 * 三條口径：
 * <ol>
 *   <li>费率为 0~1 的小数，雇主与雇员分开；两者之和不得超过 1（超过说明填错了百分数）；</li>
 *   <li>缴费基数必须落在方案上下限内——越界时社保局会整批退回，不能靠人工记得；</li>
 *   <li>参保金额是"参保当时"的快照：费率后来调整不改写历史，工资单才能重现。</li>
 * </ol>
 */
@Service
@RequiredArgsConstructor
public class PayrollBenefitServiceImpl implements PayrollBenefitService {

    private static final List<String> PLAN_TYPES = List.of(
            "SOCIAL_INSURANCE", "HOUSING_FUND", "MEDICAL", "GROUP_LIFE", "OTHER");
    private static final List<String> JURISDICTIONS = List.of("CN", "HK", "MO");
    private static final List<String> CURRENCIES = List.of("CNY", "HKD", "MOP");

    private final PayrollBenefitPlanMapper planMapper;
    private final PayrollEnrollmentMapper enrollmentMapper;
    private final HrEmploymentMapper employmentMapper;
    private final PersonMapper personMapper;
    private final OperatorResolver operatorResolver;

    /* ==================== 參保方案 ==================== */

    @Override
    public PageResult<PayrollBenefitPlan> listPlans(long page, long size, String keyword, String planType,
                                                   String jurisdiction, Integer status) {
        LambdaQueryWrapper<PayrollBenefitPlan> wrapper = new LambdaQueryWrapper<>();
        if (StringUtils.hasText(keyword)) {
            String kw = keyword.trim();
            wrapper.and(w -> w.like(PayrollBenefitPlan::getCode, kw).or().like(PayrollBenefitPlan::getName, kw));
        }
        wrapper.eq(StringUtils.hasText(planType), PayrollBenefitPlan::getPlanType, planType);
        wrapper.eq(StringUtils.hasText(jurisdiction), PayrollBenefitPlan::getJurisdiction, jurisdiction);
        wrapper.eq(status != null, PayrollBenefitPlan::getStatus, status);
        wrapper.orderByAsc(PayrollBenefitPlan::getJurisdiction).orderByAsc(PayrollBenefitPlan::getCode);
        Page<PayrollBenefitPlan> result = planMapper.selectPage(
                new Page<>(PageResult.normalizePage(page), PageResult.normalizeSize(size)), wrapper);
        return new PageResult<>(result.getRecords(), result.getTotal());
    }

    @Override
    public PayrollBenefitPlan getPlan(Long id) {
        PayrollBenefitPlan entity = id == null ? null : planMapper.selectById(id);
        if (entity == null) {
            throw new BusinessException("參保方案不存在或已刪除");
        }
        return entity;
    }

    @Override
    @Transactional
    public PayrollBenefitPlan savePlan(PayrollBenefitPlan entity) {
        if (entity == null || !StringUtils.hasText(entity.getCode()) || !StringUtils.hasText(entity.getName())) {
            throw new BusinessException("方案編碼與名稱不能為空");
        }
        String type = StringUtils.hasText(entity.getPlanType()) ? entity.getPlanType().toUpperCase() : null;
        if (type == null || !PLAN_TYPES.contains(type)) {
            throw new BusinessException("方案類型只能是 SOCIAL_INSURANCE / HOUSING_FUND / MEDICAL / GROUP_LIFE / OTHER");
        }
        entity.setPlanType(type);
        String jurisdiction = StringUtils.hasText(entity.getJurisdiction())
                ? entity.getJurisdiction().toUpperCase() : null;
        if (jurisdiction == null || !JURISDICTIONS.contains(jurisdiction)) {
            throw new BusinessException("法域只能是 CN / HK / MO");
        }
        entity.setJurisdiction(jurisdiction);
        String currency = StringUtils.hasText(entity.getCurrency()) ? entity.getCurrency().toUpperCase() : null;
        if (currency == null || !CURRENCIES.contains(currency)) {
            throw new BusinessException("幣種只能是 CNY / HKD / MOP");
        }
        entity.setCurrency(currency);
        entity.setEmployerRatio(normalizeRatio(entity.getEmployerRatio(), "雇主比例"));
        entity.setEmployeeRatio(normalizeRatio(entity.getEmployeeRatio(), "雇員比例"));
        if (entity.getEmployerRatio().add(entity.getEmployeeRatio()).compareTo(BigDecimal.ONE) > 0) {
            throw new BusinessException("雇主與雇員比例之和不能超過 1（請填小數，如 10.5% 填 0.105）");
        }
        if (entity.getMinBase() != null && entity.getMinBase().compareTo(BigDecimal.ZERO) < 0) {
            throw new BusinessException("繳費基數下限不能為負數");
        }
        if (entity.getMaxBase() != null && entity.getMaxBase().compareTo(BigDecimal.ZERO) < 0) {
            throw new BusinessException("繳費基數上限不能為負數");
        }
        if (entity.getMinBase() != null && entity.getMaxBase() != null
                && entity.getMinBase().compareTo(entity.getMaxBase()) > 0) {
            throw new BusinessException("繳費基數下限不能大於上限");
        }
        if (entity.getEffectiveFrom() == null) {
            throw new BusinessException("方案生效日期不能為空");
        }
        if (entity.getEffectiveTo() != null && entity.getEffectiveTo().isBefore(entity.getEffectiveFrom())) {
            throw new BusinessException("方案結束日期不能早於生效日期");
        }
        entity.setCode(entity.getCode().trim());
        entity.setName(entity.getName().trim());
        Long duplicated = planMapper.selectCount(new LambdaQueryWrapper<PayrollBenefitPlan>()
                .eq(PayrollBenefitPlan::getCode, entity.getCode())
                .ne(entity.getId() != null, PayrollBenefitPlan::getId, entity.getId()));
        if (duplicated != null && duplicated > 0) {
            throw new BusinessException("方案編碼已存在：" + entity.getCode());
        }
        entity.setStatus(Integer.valueOf(0).equals(entity.getStatus()) ? 0 : 1);
        entity.setUpdatedBy(operatorResolver.currentOperatorAccount());
        if (entity.getId() == null) {
            planMapper.insert(entity);
        } else {
            getPlan(entity.getId());
            planMapper.updateById(entity);
        }
        return planMapper.selectById(entity.getId());
    }

    private BigDecimal normalizeRatio(BigDecimal ratio, String label) {
        if (ratio == null) {
            throw new BusinessException(label + "不能為空（如 10.5% 請填 0.105）");
        }
        if (ratio.compareTo(BigDecimal.ZERO) < 0 || ratio.compareTo(BigDecimal.ONE) > 0) {
            throw new BusinessException(label + "必須在 0~1 之間（如 10.5% 請填 0.105）");
        }
        return ratio.setScale(4, RoundingMode.HALF_UP);
    }

    @Override
    @Transactional
    public void deletePlan(Long id) {
        getPlan(id);
        Long used = enrollmentMapper.selectCount(new LambdaQueryWrapper<PayrollEnrollment>()
                .eq(PayrollEnrollment::getPlanId, id));
        if (used != null && used > 0) {
            throw new BusinessException("該方案已有 " + used + " 條參保記錄，只能停用不能刪除");
        }
        planMapper.deleteById(id);
    }

    /* ==================== 人員參保 ==================== */

    @Override
    public PageResult<PayrollEnrollmentVO> listEnrollments(long page, long size, Long employmentId, Long planId,
                                                           LocalDate asOf, Boolean activeOnly) {
        LambdaQueryWrapper<PayrollEnrollment> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(employmentId != null, PayrollEnrollment::getEmploymentId, employmentId);
        wrapper.eq(planId != null, PayrollEnrollment::getPlanId, planId);
        if (asOf != null) {
            wrapper.le(PayrollEnrollment::getEffectiveFrom, asOf)
                    .and(w -> w.isNull(PayrollEnrollment::getEffectiveTo)
                            .or().ge(PayrollEnrollment::getEffectiveTo, asOf));
        } else if (Boolean.TRUE.equals(activeOnly)) {
            wrapper.isNull(PayrollEnrollment::getEffectiveTo);
        }
        wrapper.orderByDesc(PayrollEnrollment::getEffectiveFrom).orderByAsc(PayrollEnrollment::getSeqNo);
        Page<PayrollEnrollment> result = enrollmentMapper.selectPage(
                new Page<>(PageResult.normalizePage(page), PageResult.normalizeSize(size)), wrapper);
        // 一页一次批量补展示字段，避免逐行查询（N+1）
        Map<Long, HrEmployment> employmentMap = new HashMap<>();
        Map<Long, Person> personMap = new HashMap<>();
        Map<Long, PayrollBenefitPlan> planMap = new HashMap<>();
        Set<Long> employmentIds = result.getRecords().stream()
                .map(PayrollEnrollment::getEmploymentId).collect(Collectors.toSet());
        Set<Long> planIds = result.getRecords().stream()
                .map(PayrollEnrollment::getPlanId).collect(Collectors.toSet());
        if (!employmentIds.isEmpty()) {
            employmentMapper.selectBatchIds(employmentIds).forEach(item -> employmentMap.put(item.getId(), item));
        }
        Set<Long> personIds = employmentMap.values().stream()
                .map(HrEmployment::getPersonId).filter(java.util.Objects::nonNull).collect(Collectors.toSet());
        if (!personIds.isEmpty()) {
            personMapper.selectBatchIds(personIds).forEach(item -> personMap.put(item.getId(), item));
        }
        if (!planIds.isEmpty()) {
            planMapper.selectBatchIds(planIds).forEach(item -> planMap.put(item.getId(), item));
        }
        List<PayrollEnrollmentVO> rows = result.getRecords().stream().map(item -> {
            PayrollEnrollmentVO vo = new PayrollEnrollmentVO();
            vo.setId(item.getId());
            vo.setEmploymentId(item.getEmploymentId());
            vo.setPlanId(item.getPlanId());
            vo.setBaseAmount(item.getBaseAmount());
            vo.setEmployeeAmount(item.getEmployeeAmount());
            vo.setEmployerAmount(item.getEmployerAmount());
            vo.setCurrency(item.getCurrency());
            vo.setEffectiveFrom(item.getEffectiveFrom());
            vo.setEffectiveTo(item.getEffectiveTo());
            vo.setSeqNo(item.getSeqNo());
            vo.setStopReason(item.getStopReason());
            vo.setUpdatedBy(item.getUpdatedBy());
            HrEmployment employment = employmentMap.get(item.getEmploymentId());
            if (employment != null) {
                vo.setEmploymentNo(employment.getEmploymentNo());
                Person person = personMap.get(employment.getPersonId());
                if (person != null) {
                    vo.setPersonName(person.getName());
                    vo.setPersonNo(person.getPersonNo());
                }
            }
            PayrollBenefitPlan plan = planMap.get(item.getPlanId());
            if (plan != null) {
                vo.setPlanName(plan.getName());
                vo.setPlanType(plan.getPlanType());
            }
            return vo;
        }).collect(Collectors.toList());
        return new PageResult<>(rows, result.getTotal());
    }

    @Override
    public PayrollEnrollment getEnrollment(Long id) {
        PayrollEnrollment entity = id == null ? null : enrollmentMapper.selectById(id);
        if (entity == null) {
            throw new BusinessException("參保記錄不存在或已刪除");
        }
        return entity;
    }

    @Override
    @Transactional
    public PayrollEnrollment saveEnrollment(PayrollEnrollment entity) {
        if (entity == null || entity.getEmploymentId() == null || entity.getPlanId() == null) {
            throw new BusinessException("請選擇雇傭記錄與參保方案");
        }
        HrEmployment employment = employmentMapper.selectById(entity.getEmploymentId());
        if (employment == null) {
            throw new BusinessException("雇傭記錄不存在");
        }
        if (!Integer.valueOf(1).equals(employment.getStatus())) {
            throw new BusinessException("該雇傭已終止，不能再新增參保");
        }
        PayrollBenefitPlan plan = getPlan(entity.getPlanId());
        if (!Integer.valueOf(1).equals(plan.getStatus())) {
            throw new BusinessException("該參保方案已停用，不能新增參保");
        }
        if (entity.getEffectiveFrom() == null) {
            throw new BusinessException("參保生效日期不能為空");
        }
        if (entity.getEffectiveTo() != null && entity.getEffectiveTo().isBefore(entity.getEffectiveFrom())) {
            throw new BusinessException("停保日期不能早於參保日期");
        }
        if (plan.getEffectiveFrom() != null && entity.getEffectiveFrom().isBefore(plan.getEffectiveFrom())) {
            throw new BusinessException("參保生效日期早於方案生效日期（" + plan.getEffectiveFrom() + "）");
        }
        if (plan.getEffectiveTo() != null && entity.getEffectiveFrom().isAfter(plan.getEffectiveTo())) {
            throw new BusinessException("參保生效日期晚於方案結束日期（" + plan.getEffectiveTo() + "）");
        }
        BigDecimal baseAmount = entity.getBaseAmount();
        if (baseAmount == null || baseAmount.compareTo(BigDecimal.ZERO) < 0) {
            throw new BusinessException("繳費基數不能為空或負數");
        }
        if (plan.getMinBase() != null && baseAmount.compareTo(plan.getMinBase()) < 0) {
            throw new BusinessException("繳費基數低於方案下限 " + plan.getMinBase());
        }
        if (plan.getMaxBase() != null && baseAmount.compareTo(plan.getMaxBase()) > 0) {
            throw new BusinessException("繳費基數高於方案上限 " + plan.getMaxBase());
        }
        // 金额快照：按本方案当前费率算好并落库，方案后续调费率不改写历史
        entity.setEmployeeAmount(baseAmount.multiply(plan.getEmployeeRatio()).setScale(2, RoundingMode.HALF_UP));
        entity.setEmployerAmount(baseAmount.multiply(plan.getEmployerRatio()).setScale(2, RoundingMode.HALF_UP));
        entity.setCurrency(plan.getCurrency());
        if (entity.getSeqNo() == null || entity.getSeqNo() < 1) {
            entity.setSeqNo(1);
        }
        List<PayrollEnrollment> others = enrollmentMapper.selectList(new LambdaQueryWrapper<PayrollEnrollment>()
                .eq(PayrollEnrollment::getEmploymentId, entity.getEmploymentId())
                .eq(PayrollEnrollment::getPlanId, entity.getPlanId())
                .ne(entity.getId() != null, PayrollEnrollment::getId, entity.getId()));
        for (PayrollEnrollment other : others) {
            boolean overlapped = (other.getEffectiveTo() == null
                    || !other.getEffectiveTo().isBefore(entity.getEffectiveFrom()))
                    && (entity.getEffectiveTo() == null
                    || !entity.getEffectiveTo().isBefore(other.getEffectiveFrom()));
            if (overlapped) {
                throw new BusinessException("該雇傭在同一方案的參保期間重疊，請先停保上一段（#"
                        + other.getId() + "）");
            }
        }
        entity.setUpdatedBy(operatorResolver.currentOperatorAccount());
        if (entity.getId() == null) {
            enrollmentMapper.insert(entity);
        } else {
            getEnrollment(entity.getId());
            enrollmentMapper.updateById(entity);
        }
        return enrollmentMapper.selectById(entity.getId());
    }

    @Override
    @Transactional
    public void deleteEnrollment(Long id) {
        getEnrollment(id);
        enrollmentMapper.deleteById(id);
    }
}
