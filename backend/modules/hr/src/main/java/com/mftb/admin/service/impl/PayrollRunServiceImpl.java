package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.dto.PayrollPayslipDetailVO;
import com.mftb.admin.dto.PayrollPayslipVO;
import com.mftb.admin.entity.HrEmployment;
import com.mftb.admin.entity.PayrollBenefitPlan;
import com.mftb.admin.entity.PayrollEnrollment;
import com.mftb.admin.entity.PayrollPayslip;
import com.mftb.admin.entity.PayrollPayslipItem;
import com.mftb.admin.entity.PayrollRuleSet;
import com.mftb.admin.entity.PayrollRun;
import com.mftb.admin.entity.PayrollSalaryStandard;
import com.mftb.admin.entity.Person;
import com.mftb.admin.mapper.HrEmploymentMapper;
import com.mftb.admin.mapper.PayrollBenefitPlanMapper;
import com.mftb.admin.mapper.PayrollEnrollmentMapper;
import com.mftb.admin.mapper.PayrollPayslipItemMapper;
import com.mftb.admin.mapper.PayrollPayslipMapper;
import com.mftb.admin.mapper.PayrollRunMapper;
import com.mftb.admin.mapper.PayrollSalaryStandardMapper;
import com.mftb.admin.mapper.PersonMapper;
import com.mftb.admin.service.PayrollRuleService;
import com.mftb.admin.service.PayrollRunService;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 核算批次實現。
 * <p>
 * 口径：
 * <ol>
 *   <li>批次绑定城市与规则集；建批时解析不到规则直接拒绝（不提供默认费率）；</li>
 *   <li>试算按期间取"当时生效"的薪酬标准与参保，缺薪酬标准整批拒绝并列出是谁；</li>
 *   <li>缺参保不阻断，但写入警告——没参保是事实，不该被当成异常，也不能被静默忽略；</li>
 *   <li>锁定后不可重算：已发工资不能因后续调薪而变数。</li>
 * </ol>
 * <p>
 * 未做（明确留白）：中途入离职按天折算、累计预扣的跨月累计、补发补扣。
 * 当前按整月计算，这三项必须在正式发薪前补齐。
 */
@Service
@RequiredArgsConstructor
public class PayrollRunServiceImpl implements PayrollRunService {

    private static final String STATUS_DRAFT = "DRAFT";
    private static final String STATUS_CALCULATED = "CALCULATED";
    private static final String STATUS_LOCKED = "LOCKED";

    private final PayrollRunMapper runMapper;
    private final PayrollPayslipMapper payslipMapper;
    private final PayrollPayslipItemMapper itemMapper;
    private final PayrollSalaryStandardMapper standardMapper;
    private final PayrollEnrollmentMapper enrollmentMapper;
    private final PayrollBenefitPlanMapper planMapper;
    private final HrEmploymentMapper employmentMapper;
    private final PersonMapper personMapper;
    private final PayrollRuleService ruleService;
    private final OperatorResolver operatorResolver;

    /* ==================== 批次 ==================== */

    @Override
    public PageResult<PayrollRun> listRuns(long page, long size, String period, String cityCode, String status) {
        LambdaQueryWrapper<PayrollRun> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(StringUtils.hasText(period), PayrollRun::getPeriod, period);
        wrapper.eq(StringUtils.hasText(cityCode), PayrollRun::getCityCode, cityCode);
        wrapper.eq(StringUtils.hasText(status), PayrollRun::getStatus, status);
        wrapper.orderByDesc(PayrollRun::getPeriod).orderByAsc(PayrollRun::getCityCode);
        Page<PayrollRun> result = runMapper.selectPage(
                new Page<>(PageResult.normalizePage(page), PageResult.normalizeSize(size)), wrapper);
        return new PageResult<>(result.getRecords(), result.getTotal());
    }

    @Override
    public PayrollRun getRun(Long id) {
        PayrollRun run = id == null ? null : runMapper.selectById(id);
        if (run == null) {
            throw new BusinessException("核算批次不存在或已刪除");
        }
        return run;
    }

    @Override
    @Transactional
    public PayrollRun createRun(PayrollRun entity) {
        if (entity == null || !StringUtils.hasText(entity.getPeriod())) {
            throw new BusinessException("請填寫工資月（YYYY-MM）");
        }
        String period = entity.getPeriod().trim();
        if (!period.matches("^\\d{4}-(0[1-9]|1[0-2])$")) {
            throw new BusinessException("工資月格式必須是 YYYY-MM");
        }
        if (!StringUtils.hasText(entity.getCityCode())) {
            throw new BusinessException("請選擇統籌區/城市");
        }
        LocalDate periodStart = YearMonth.parse(period).atDay(1);
        PayrollRuleSet ruleSet = ruleService.resolveRuleSet(entity.getCityCode(), periodStart);
        Long duplicated = runMapper.selectCount(new LambdaQueryWrapper<PayrollRun>()
                .eq(PayrollRun::getPeriod, period)
                .eq(PayrollRun::getCityCode, entity.getCityCode().trim()));
        if (duplicated != null && duplicated > 0) {
            throw new BusinessException("城市 " + entity.getCityCode() + " 的 " + period + " 批次已存在");
        }
        entity.setPeriod(period);
        entity.setCityCode(entity.getCityCode().trim());
        entity.setRuleSetId(ruleSet.getId());
        entity.setCurrency(ruleSet.getCurrency());
        entity.setStatus(STATUS_DRAFT);
        entity.setUpdatedBy(operatorResolver.currentOperatorAccount());
        runMapper.insert(entity);
        return runMapper.selectById(entity.getId());
    }

    @Override
    @Transactional
    public PayrollRun calculate(Long runId) {
        PayrollRun run = getRun(runId);
        if (STATUS_LOCKED.equals(run.getStatus())) {
            throw new BusinessException("批次已鎖定，不能重新試算");
        }
        YearMonth ym = YearMonth.parse(run.getPeriod());
        LocalDate periodStart = ym.atDay(1);
        LocalDate periodEnd = ym.atEndOfMonth();
        PayrollRuleSet ruleSet = ruleService.resolveRuleSet(run.getCityCode(), periodStart);

        List<HrEmployment> employments = employmentMapper.selectList(new LambdaQueryWrapper<HrEmployment>()
                .eq(HrEmployment::getStatus, 1)
                .eq(HrEmployment::getJurisdiction, ruleSet.getJurisdiction())
                .le(HrEmployment::getStartDate, periodEnd)
                .and(w -> w.isNull(HrEmployment::getEndDate).or().ge(HrEmployment::getEndDate, periodStart)));
        if (employments.isEmpty()) {
            throw new BusinessException("法域 " + ruleSet.getJurisdiction() + " 在 " + run.getPeriod()
                    + " 沒有在職雇傭，無需試算");
        }

        List<String> errors = new ArrayList<>();
        List<String> warnings = new ArrayList<>();
        Map<Long, PayrollSalaryStandard> standardMap = new HashMap<>();
        Map<Long, List<PayrollEnrollment>> enrollmentMap = new HashMap<>();
        Map<Long, PayrollBenefitPlan> planMap = new HashMap<>();

        for (HrEmployment employment : employments) {
            List<PayrollSalaryStandard> standards = standardMapper.selectList(
                    new LambdaQueryWrapper<PayrollSalaryStandard>()
                            .eq(PayrollSalaryStandard::getEmploymentId, employment.getId())
                            .le(PayrollSalaryStandard::getEffectiveFrom, periodStart)
                            .and(w -> w.isNull(PayrollSalaryStandard::getEffectiveTo)
                                    .or().ge(PayrollSalaryStandard::getEffectiveTo, periodStart))
                            .orderByDesc(PayrollSalaryStandard::getEffectiveFrom)
                            .orderByAsc(PayrollSalaryStandard::getSeqNo));
            if (standards.isEmpty()) {
                errors.add("雇傭 " + employment.getEmploymentNo() + " 缺少 " + run.getPeriod() + " 生效的薪酬標準");
            } else {
                standardMap.put(employment.getId(), standards.get(0));
            }
            List<PayrollEnrollment> enrollments = enrollmentMapper.selectList(
                    new LambdaQueryWrapper<PayrollEnrollment>()
                            .eq(PayrollEnrollment::getEmploymentId, employment.getId())
                            .le(PayrollEnrollment::getEffectiveFrom, periodEnd)
                            .and(w -> w.isNull(PayrollEnrollment::getEffectiveTo)
                                    .or().ge(PayrollEnrollment::getEffectiveTo, periodStart)));
            enrollmentMap.put(employment.getId(), enrollments);
            if (enrollments.isEmpty()) {
                warnings.add("雇傭 " + employment.getEmploymentNo() + " 在 " + run.getPeriod() + " 沒有參保記錄");
            }
            for (PayrollEnrollment enrollment : enrollments) {
                planMap.computeIfAbsent(enrollment.getPlanId(),
                        id -> planMapper.selectById(id));
            }
        }
        if (!errors.isEmpty()) {
            String detail = errors.stream().limit(5).collect(Collectors.joining("；"));
            if (errors.size() > 5) {
                detail += "；另有 " + (errors.size() - 5) + " 條";
            }
            throw new BusinessException("試算被拒絕：" + detail);
        }

        // 先清后写：试算可反复做，旧结果不应残留
        List<PayrollPayslip> olds = payslipMapper.selectList(new LambdaQueryWrapper<PayrollPayslip>()
                .eq(PayrollPayslip::getRunId, runId));
        if (!olds.isEmpty()) {
            List<Long> oldIds = olds.stream().map(PayrollPayslip::getId).toList();
            itemMapper.delete(new LambdaQueryWrapper<PayrollPayslipItem>()
                    .in(PayrollPayslipItem::getPayslipId, oldIds));
            payslipMapper.delete(new LambdaQueryWrapper<PayrollPayslip>()
                    .eq(PayrollPayslip::getRunId, runId));
        }

        for (HrEmployment employment : employments) {
            PayrollSalaryStandard standard = standardMap.get(employment.getId());
            BigDecimal gross = scale(standard.getBaseAmount());
            List<PayrollEnrollment> enrollments = enrollmentMap.getOrDefault(employment.getId(), List.of());
            BigDecimal employeeSocial = enrollments.stream()
                    .map(item -> scale(item.getEmployeeAmount()))
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            BigDecimal employerSocial = enrollments.stream()
                    .map(item -> scale(item.getEmployerAmount()))
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            BigDecimal taxableBase = gross.subtract(employeeSocial);
            BigDecimal tax = ruleService.monthlyTax(ruleSet, taxableBase);
            BigDecimal net = taxableBase.subtract(tax);

            PayrollPayslip payslip = new PayrollPayslip();
            payslip.setRunId(runId);
            payslip.setEmploymentId(employment.getId());
            payslip.setPersonId(employment.getPersonId());
            payslip.setCurrency(ruleSet.getCurrency());
            payslip.setGrossAmount(gross);
            payslip.setDeductionAmount(employeeSocial.add(tax));
            payslip.setEmployerCostAmount(gross.add(employerSocial));
            payslip.setNetAmount(net);
            payslip.setTaxableBase(taxableBase);
            payslip.setTaxAmount(tax);
            payslip.setRuleSetId(ruleSet.getId());
            payslip.setStatus(STATUS_CALCULATED);
            payslipMapper.insert(payslip);

            int sort = 0;
            itemMapper.insert(item(payslip.getId(), "BASE_SALARY", employment.getId(), null,
                    standard.getChangeType() == null ? "基本工資" : "基本工資", gross, 1, sort++));
            for (PayrollEnrollment enrollment : enrollments) {
                PayrollBenefitPlan plan = planMap.get(enrollment.getPlanId());
                String planName = plan == null ? ("參保方案#" + enrollment.getPlanId()) : plan.getName();
                itemMapper.insert(item(payslip.getId(), "SOCIAL_EMPLOYEE", null, enrollment.getPlanId(),
                        planName, scale(enrollment.getEmployeeAmount()), 0, sort++));
                itemMapper.insert(item(payslip.getId(), "SOCIAL_EMPLOYER", null, enrollment.getPlanId(),
                        planName, scale(enrollment.getEmployerAmount()), 0, sort++));
            }
            itemMapper.insert(item(payslip.getId(), "TAX", null, null, "個人所得稅", tax, 0, sort));
        }

        run.setRuleSetId(ruleSet.getId());
        run.setCurrency(ruleSet.getCurrency());
        run.setStatus(STATUS_CALCULATED);
        run.setCalculatedAt(LocalDateTime.now());
        run.setWarnings(warnings.isEmpty() ? null : String.join("；", warnings));
        run.setUpdatedBy(operatorResolver.currentOperatorAccount());
        runMapper.updateById(run);
        return runMapper.selectById(runId);
    }

    @Override
    @Transactional
    public PayrollRun lock(Long runId) {
        PayrollRun run = getRun(runId);
        if (STATUS_LOCKED.equals(run.getStatus())) {
            throw new BusinessException("批次已鎖定");
        }
        if (!STATUS_CALCULATED.equals(run.getStatus())) {
            throw new BusinessException("請先完成試算再鎖定");
        }
        run.setStatus(STATUS_LOCKED);
        run.setLockedAt(LocalDateTime.now());
        run.setUpdatedBy(operatorResolver.currentOperatorAccount());
        runMapper.updateById(run);
        PayrollPayslip patch = new PayrollPayslip();
        patch.setStatus(STATUS_LOCKED);
        payslipMapper.update(patch, new LambdaQueryWrapper<PayrollPayslip>()
                .eq(PayrollPayslip::getRunId, runId));
        return runMapper.selectById(runId);
    }

    @Override
    @Transactional
    public void deleteRun(Long id) {
        PayrollRun run = getRun(id);
        if (!STATUS_DRAFT.equals(run.getStatus())) {
            throw new BusinessException("只有草稿批次可以刪除；已試算的批次請保留以便追溯");
        }
        runMapper.deleteById(id);
    }

    /* ==================== 工資單 ==================== */

    @Override
    public PageResult<PayrollPayslipVO> listPayslips(Long runId, long page, long size) {
        getRun(runId);
        Page<PayrollPayslip> result = payslipMapper.selectPage(
                new Page<>(PageResult.normalizePage(page), PageResult.normalizeSize(size)),
                new LambdaQueryWrapper<PayrollPayslip>()
                        .eq(PayrollPayslip::getRunId, runId)
                        .orderByAsc(PayrollPayslip::getEmploymentId));
        Set<Long> employmentIds = result.getRecords().stream()
                .map(PayrollPayslip::getEmploymentId).collect(Collectors.toCollection(LinkedHashSet::new));
        Map<Long, HrEmployment> employmentMap = new HashMap<>();
        Map<Long, Person> personMap = new HashMap<>();
        if (!employmentIds.isEmpty()) {
            employmentMapper.selectBatchIds(employmentIds).forEach(item -> employmentMap.put(item.getId(), item));
        }
        Set<Long> personIds = employmentMap.values().stream()
                .map(HrEmployment::getPersonId).filter(java.util.Objects::nonNull)
                .collect(Collectors.toSet());
        if (!personIds.isEmpty()) {
            personMapper.selectBatchIds(personIds).forEach(item -> personMap.put(item.getId(), item));
        }
        List<PayrollPayslipVO> rows = result.getRecords().stream().map(item -> {
            PayrollPayslipVO vo = new PayrollPayslipVO();
            vo.setId(item.getId());
            vo.setRunId(item.getRunId());
            vo.setEmploymentId(item.getEmploymentId());
            vo.setPersonId(item.getPersonId());
            vo.setCurrency(item.getCurrency());
            vo.setGrossAmount(item.getGrossAmount());
            vo.setDeductionAmount(item.getDeductionAmount());
            vo.setEmployerCostAmount(item.getEmployerCostAmount());
            vo.setNetAmount(item.getNetAmount());
            vo.setTaxableBase(item.getTaxableBase());
            vo.setTaxAmount(item.getTaxAmount());
            vo.setRuleSetId(item.getRuleSetId());
            vo.setStatus(item.getStatus());
            HrEmployment employment = employmentMap.get(item.getEmploymentId());
            if (employment != null) {
                vo.setEmploymentNo(employment.getEmploymentNo());
                Person person = personMap.get(employment.getPersonId());
                if (person != null) {
                    vo.setPersonName(person.getName());
                    vo.setPersonNo(person.getPersonNo());
                }
            }
            return vo;
        }).collect(Collectors.toList());
        return new PageResult<>(rows, result.getTotal());
    }

    @Override
    public PayrollPayslipDetailVO getPayslipDetail(Long payslipId) {
        PayrollPayslip payslip = payslipId == null ? null : payslipMapper.selectById(payslipId);
        if (payslip == null) {
            throw new BusinessException("工資單不存在或已刪除");
        }
        PayrollPayslipVO vo = new PayrollPayslipVO();
        vo.setId(payslip.getId());
        vo.setRunId(payslip.getRunId());
        vo.setEmploymentId(payslip.getEmploymentId());
        vo.setPersonId(payslip.getPersonId());
        vo.setCurrency(payslip.getCurrency());
        vo.setGrossAmount(payslip.getGrossAmount());
        vo.setDeductionAmount(payslip.getDeductionAmount());
        vo.setEmployerCostAmount(payslip.getEmployerCostAmount());
        vo.setNetAmount(payslip.getNetAmount());
        vo.setTaxableBase(payslip.getTaxableBase());
        vo.setTaxAmount(payslip.getTaxAmount());
        vo.setRuleSetId(payslip.getRuleSetId());
        vo.setStatus(payslip.getStatus());
        HrEmployment employment = employmentMapper.selectById(payslip.getEmploymentId());
        if (employment != null) {
            vo.setEmploymentNo(employment.getEmploymentNo());
            Person person = employment.getPersonId() == null ? null : personMapper.selectById(employment.getPersonId());
            if (person != null) {
                vo.setPersonName(person.getName());
                vo.setPersonNo(person.getPersonNo());
            }
        }
        PayrollPayslipDetailVO detail = new PayrollPayslipDetailVO();
        detail.setPayslip(vo);
        detail.setItems(itemMapper.selectList(new LambdaQueryWrapper<PayrollPayslipItem>()
                .eq(PayrollPayslipItem::getPayslipId, payslipId)
                .orderByAsc(PayrollPayslipItem::getSortOrder)));
        return detail;
    }

    private PayrollPayslipItem item(Long payslipId, String type, Long componentId, Long planId,
                                    String name, BigDecimal amount, int taxable, int sort) {
        PayrollPayslipItem item = new PayrollPayslipItem();
        item.setPayslipId(payslipId);
        item.setItemType(type);
        item.setComponentId(componentId);
        item.setPlanId(planId);
        item.setItemName(name);
        item.setAmount(scale(amount));
        item.setTaxable(taxable);
        item.setSortOrder(sort);
        return item;
    }

    private BigDecimal scale(BigDecimal value) {
        return (value == null ? BigDecimal.ZERO : value).setScale(2, RoundingMode.HALF_UP);
    }
}
