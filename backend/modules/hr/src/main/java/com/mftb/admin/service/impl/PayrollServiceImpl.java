package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.HrEmployment;
import com.mftb.admin.entity.PayrollComponent;
import com.mftb.admin.entity.PayrollSalaryStandard;
import com.mftb.admin.mapper.HrEmploymentMapper;
import com.mftb.admin.mapper.PayrollComponentMapper;
import com.mftb.admin.mapper.PayrollSalaryStandardMapper;
import com.mftb.admin.service.PayrollService;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/**
 * 薪酬基础实现。
 * <p>
 * 三条口径：
 * <ol>
 *   <li>项目类型只允许 EARNING / DEDUCTION / EMPLOYER_COST——三类汇总口径不同，混了工资单与成本报表对不上；</li>
 *   <li>金额必须 DECIMAL 且非负、币种必填（CNY/HKD/MOP 首期三地）；</li>
 *   <li>同一雇佣的薪酬标准区间不得重叠：重叠会让"某月工资"有两个候选值，核算必然错。</li>
 * </ol>
 */
@Service
@RequiredArgsConstructor
public class PayrollServiceImpl implements PayrollService {

    private static final List<String> COMPONENT_TYPES = List.of("EARNING", "DEDUCTION", "EMPLOYER_COST");
    private static final List<String> CHANGE_TYPES = List.of("HIRE", "ADJUST", "PROMOTION", "ANNUAL");
    private static final List<String> CURRENCIES = List.of("CNY", "HKD", "MOP");

    private final PayrollComponentMapper componentMapper;
    private final PayrollSalaryStandardMapper standardMapper;
    private final HrEmploymentMapper employmentMapper;
    private final OperatorResolver operatorResolver;

    /* ==================== 薪酬项目 ==================== */

    @Override
    public PageResult<PayrollComponent> listComponents(long page, long size, String keyword,
                                                       String componentType, Integer status) {
        LambdaQueryWrapper<PayrollComponent> wrapper = new LambdaQueryWrapper<>();
        if (StringUtils.hasText(keyword)) {
            String kw = keyword.trim();
            wrapper.and(w -> w.like(PayrollComponent::getCode, kw).or().like(PayrollComponent::getName, kw));
        }
        wrapper.eq(StringUtils.hasText(componentType), PayrollComponent::getComponentType, componentType);
        wrapper.eq(status != null, PayrollComponent::getStatus, status);
        wrapper.orderByAsc(PayrollComponent::getSortOrder).orderByAsc(PayrollComponent::getId);
        Page<PayrollComponent> result = componentMapper.selectPage(
                new Page<>(PageResult.normalizePage(page), PageResult.normalizeSize(size)), wrapper);
        return new PageResult<>(result.getRecords(), result.getTotal());
    }

    @Override
    public PayrollComponent getComponent(Long id) {
        PayrollComponent entity = id == null ? null : componentMapper.selectById(id);
        if (entity == null) {
            throw new BusinessException("薪酬项目不存在或已删除");
        }
        return entity;
    }

    @Override
    @Transactional
    public PayrollComponent saveComponent(PayrollComponent entity) {
        if (entity == null || !StringUtils.hasText(entity.getCode()) || !StringUtils.hasText(entity.getName())) {
            throw new BusinessException("項目編碼與名稱不能為空");
        }
        String type = StringUtils.hasText(entity.getComponentType())
                ? entity.getComponentType().toUpperCase() : null;
        if (type == null || !COMPONENT_TYPES.contains(type)) {
            throw new BusinessException("薪酬項目類型只能是 EARNING / DEDUCTION / EMPLOYER_COST");
        }
        entity.setComponentType(type);
        if (StringUtils.hasText(entity.getCurrency())) {
            String currency = entity.getCurrency().toUpperCase();
            if (!CURRENCIES.contains(currency)) {
                throw new BusinessException("幣種只能是 CNY / HKD / MOP");
            }
            entity.setCurrency(currency);
        }
        entity.setCode(entity.getCode().trim());
        entity.setName(entity.getName().trim());
        Long duplicated = componentMapper.selectCount(new LambdaQueryWrapper<PayrollComponent>()
                .eq(PayrollComponent::getCode, entity.getCode())
                .ne(entity.getId() != null, PayrollComponent::getId, entity.getId()));
        if (duplicated != null && duplicated > 0) {
            throw new BusinessException("薪酬項目編碼已存在：" + entity.getCode());
        }
        entity.setTaxable(Integer.valueOf(1).equals(entity.getTaxable()) ? 1 : 0);
        entity.setStatus(Integer.valueOf(0).equals(entity.getStatus()) ? 0 : 1);
        if (entity.getSortOrder() == null) {
            entity.setSortOrder(0);
        }
        entity.setUpdatedBy(operatorResolver.currentOperatorAccount());
        if (entity.getId() == null) {
            componentMapper.insert(entity);
        } else {
            getComponent(entity.getId());
            componentMapper.updateById(entity);
        }
        return componentMapper.selectById(entity.getId());
    }

    @Override
    @Transactional
    public void deleteComponent(Long id) {
        getComponent(id);
        // 项目尚未被工资单引用（D3 之前没有核算结果），允许删除；D3 起改为"有工资单引用则拒绝"
        componentMapper.deleteById(id);
    }

    /* ==================== 薪酬标准 ==================== */

    @Override
    public PageResult<PayrollSalaryStandard> listStandards(Long employmentId, LocalDate asOf, long page, long size) {
        LambdaQueryWrapper<PayrollSalaryStandard> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(employmentId != null, PayrollSalaryStandard::getEmploymentId, employmentId);
        if (asOf != null) {
            wrapper.le(PayrollSalaryStandard::getEffectiveFrom, asOf)
                    .and(w -> w.isNull(PayrollSalaryStandard::getEffectiveTo)
                            .or().ge(PayrollSalaryStandard::getEffectiveTo, asOf));
        }
        wrapper.orderByDesc(PayrollSalaryStandard::getEffectiveFrom)
                .orderByAsc(PayrollSalaryStandard::getSeqNo);
        Page<PayrollSalaryStandard> result = standardMapper.selectPage(
                new Page<>(PageResult.normalizePage(page), PageResult.normalizeSize(size)), wrapper);
        return new PageResult<>(result.getRecords(), result.getTotal());
    }

    @Override
    public PayrollSalaryStandard getStandard(Long id) {
        PayrollSalaryStandard entity = id == null ? null : standardMapper.selectById(id);
        if (entity == null) {
            throw new BusinessException("薪酬標準不存在或已刪除");
        }
        return entity;
    }

    @Override
    @Transactional
    public PayrollSalaryStandard saveStandard(PayrollSalaryStandard entity) {
        if (entity == null || entity.getEmploymentId() == null) {
            throw new BusinessException("請選擇雇傭記錄");
        }
        HrEmployment employment = employmentMapper.selectById(entity.getEmploymentId());
        if (employment == null) {
            throw new BusinessException("雇傭記錄不存在");
        }
        if (!Integer.valueOf(1).equals(employment.getStatus())) {
            throw new BusinessException("該雇傭已終止，不能再維護薪酬標準");
        }
        if (entity.getBaseAmount() == null || entity.getBaseAmount().compareTo(BigDecimal.ZERO) < 0) {
            throw new BusinessException("基本工資不能為空或負數");
        }
        String currency = StringUtils.hasText(entity.getCurrency()) ? entity.getCurrency().toUpperCase() : null;
        if (currency == null || !CURRENCIES.contains(currency)) {
            throw new BusinessException("幣種只能是 CNY / HKD / MOP");
        }
        entity.setCurrency(currency);
        if (entity.getEffectiveFrom() == null) {
            throw new BusinessException("生效日期不能為空");
        }
        if (entity.getEffectiveTo() != null && entity.getEffectiveTo().isBefore(entity.getEffectiveFrom())) {
            throw new BusinessException("生效截止不能早於生效日期");
        }
        String changeType = StringUtils.hasText(entity.getChangeType())
                ? entity.getChangeType().toUpperCase() : "ADJUST";
        if (!CHANGE_TYPES.contains(changeType)) {
            throw new BusinessException("變更類型只能是 HIRE / ADJUST / PROMOTION / ANNUAL");
        }
        entity.setChangeType(changeType);
        if (entity.getSeqNo() == null || entity.getSeqNo() < 1) {
            entity.setSeqNo(1);
        }
        // 区间重叠会让"某月工资"出现两个候选值；这里排除自身后逐条比较
        List<PayrollSalaryStandard> others = standardMapper.selectList(new LambdaQueryWrapper<PayrollSalaryStandard>()
                .eq(PayrollSalaryStandard::getEmploymentId, entity.getEmploymentId())
                .ne(entity.getId() != null, PayrollSalaryStandard::getId, entity.getId()));
        for (PayrollSalaryStandard other : others) {
            boolean overlapped = (other.getEffectiveTo() == null
                    || !other.getEffectiveTo().isBefore(entity.getEffectiveFrom()))
                    && (entity.getEffectiveTo() == null
                    || !entity.getEffectiveTo().isBefore(other.getEffectiveFrom()));
            if (overlapped) {
                throw new BusinessException("該雇傭的薪酬標準期間重疊，請先結束上一段標準（#"
                        + other.getId() + "）");
            }
        }
        entity.setUpdatedBy(operatorResolver.currentOperatorAccount());
        if (entity.getId() == null) {
            standardMapper.insert(entity);
        } else {
            getStandard(entity.getId());
            standardMapper.updateById(entity);
        }
        return standardMapper.selectById(entity.getId());
    }

    @Override
    @Transactional
    public void deleteStandard(Long id) {
        getStandard(id);
        // 已被工资单锁定引用的标准不能删（D3 落地后在此处加校验，当前无核算结果）
        standardMapper.deleteById(id);
    }
}
