package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.PayrollRuleSet;
import com.mftb.admin.entity.PayrollTaxBracket;
import com.mftb.admin.mapper.PayrollRuleSetMapper;
import com.mftb.admin.mapper.PayrollTaxBracketMapper;
import com.mftb.admin.service.PayrollRuleService;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;

/**
 * 薪酬規則實現。
 * <p>
 * 三条口径：
 * <ol>
 *   <li>级距必须首尾相接且从 0 起、最高档无上限——有空档就会漏税，重叠就会重复征税；</li>
 *   <li>同一城市同一日期只允许一个生效规则集，多于一个直接拒绝（宁可停下来让人核对）；</li>
 *   <li>个税 = 应纳税所得额 × 税率 - 速算扣除数，结果不得为负。</li>
 * </ol>
 */
@Service
@RequiredArgsConstructor
public class PayrollRuleServiceImpl implements PayrollRuleService {

    private static final List<String> JURISDICTIONS = List.of("CN", "HK", "MO");
    private static final List<String> CURRENCIES = List.of("CNY", "HKD", "MOP");

    private final PayrollRuleSetMapper ruleSetMapper;
    private final PayrollTaxBracketMapper bracketMapper;
    private final OperatorResolver operatorResolver;

    /* ==================== 規則集 ==================== */

    @Override
    public PageResult<PayrollRuleSet> listRuleSets(long page, long size, String keyword, String jurisdiction,
                                                   Integer status) {
        LambdaQueryWrapper<PayrollRuleSet> wrapper = new LambdaQueryWrapper<>();
        if (StringUtils.hasText(keyword)) {
            String kw = keyword.trim();
            wrapper.and(w -> w.like(PayrollRuleSet::getCode, kw)
                    .or().like(PayrollRuleSet::getName, kw)
                    .or().like(PayrollRuleSet::getCityName, kw));
        }
        wrapper.eq(StringUtils.hasText(jurisdiction), PayrollRuleSet::getJurisdiction, jurisdiction);
        wrapper.eq(status != null, PayrollRuleSet::getStatus, status);
        wrapper.orderByDesc(PayrollRuleSet::getEffectiveFrom).orderByAsc(PayrollRuleSet::getCityCode);
        Page<PayrollRuleSet> result = ruleSetMapper.selectPage(
                new Page<>(PageResult.normalizePage(page), PageResult.normalizeSize(size)), wrapper);
        return new PageResult<>(result.getRecords(), result.getTotal());
    }

    @Override
    public PayrollRuleSet getRuleSet(Long id) {
        PayrollRuleSet entity = id == null ? null : ruleSetMapper.selectById(id);
        if (entity == null) {
            throw new BusinessException("薪酬規則集不存在或已刪除");
        }
        return entity;
    }

    @Override
    @Transactional
    public PayrollRuleSet saveRuleSet(PayrollRuleSet entity) {
        if (entity == null || !StringUtils.hasText(entity.getCode()) || !StringUtils.hasText(entity.getName())) {
            throw new BusinessException("規則集編碼與名稱不能為空");
        }
        String jurisdiction = StringUtils.hasText(entity.getJurisdiction())
                ? entity.getJurisdiction().toUpperCase() : null;
        if (jurisdiction == null || !JURISDICTIONS.contains(jurisdiction)) {
            throw new BusinessException("法域只能是 CN / HK / MO");
        }
        entity.setJurisdiction(jurisdiction);
        if (!StringUtils.hasText(entity.getCityCode())) {
            throw new BusinessException("統籌區/城市代碼不能為空（內地如 4403，港澳填 HK / MO）");
        }
        String currency = StringUtils.hasText(entity.getCurrency()) ? entity.getCurrency().toUpperCase() : null;
        if (currency == null || !CURRENCIES.contains(currency)) {
            throw new BusinessException("幣種只能是 CNY / HKD / MOP");
        }
        entity.setCurrency(currency);
        if (entity.getBasicDeduction() == null || entity.getBasicDeduction().compareTo(BigDecimal.ZERO) < 0) {
            throw new BusinessException("基本減除費用不能為空或負數（沒有免稅額請填 0）");
        }
        if (entity.getEffectiveFrom() == null) {
            throw new BusinessException("生效日期不能為空");
        }
        if (entity.getEffectiveTo() != null && entity.getEffectiveTo().isBefore(entity.getEffectiveFrom())) {
            throw new BusinessException("結束日期不能早於生效日期");
        }
        entity.setCode(entity.getCode().trim());
        entity.setCityCode(entity.getCityCode().trim());
        Long duplicated = ruleSetMapper.selectCount(new LambdaQueryWrapper<PayrollRuleSet>()
                .eq(PayrollRuleSet::getCode, entity.getCode())
                .ne(entity.getId() != null, PayrollRuleSet::getId, entity.getId()));
        if (duplicated != null && duplicated > 0) {
            throw new BusinessException("規則集編碼已存在：" + entity.getCode());
        }
        validateNoOverlap(entity);
        entity.setStatus(Integer.valueOf(0).equals(entity.getStatus()) ? 0 : 1);
        entity.setUpdatedBy(operatorResolver.currentOperatorAccount());
        if (entity.getId() == null) {
            ruleSetMapper.insert(entity);
        } else {
            getRuleSet(entity.getId());
            ruleSetMapper.updateById(entity);
        }
        return ruleSetMapper.selectById(entity.getId());
    }

    /** 同一城市同一日期的规则集不得重叠：重叠时试算不知道该用哪套 */
    private void validateNoOverlap(PayrollRuleSet entity) {
        List<PayrollRuleSet> others = ruleSetMapper.selectList(new LambdaQueryWrapper<PayrollRuleSet>()
                .eq(PayrollRuleSet::getCityCode, entity.getCityCode())
                .ne(entity.getId() != null, PayrollRuleSet::getId, entity.getId()));
        for (PayrollRuleSet other : others) {
            boolean overlapped = (other.getEffectiveTo() == null
                    || !other.getEffectiveTo().isBefore(entity.getEffectiveFrom()))
                    && (entity.getEffectiveTo() == null
                    || !entity.getEffectiveTo().isBefore(other.getEffectiveFrom()));
            if (overlapped) {
                throw new BusinessException("城市 " + entity.getCityCode() + " 的規則集期間重疊（#"
                        + other.getId() + "），請先結束上一套規則");
            }
        }
    }

    @Override
    @Transactional
    public void deleteRuleSet(Long id) {
        getRuleSet(id);
        Long brackets = bracketMapper.selectCount(new LambdaQueryWrapper<PayrollTaxBracket>()
                .eq(PayrollTaxBracket::getRuleSetId, id));
        if (brackets != null && brackets > 0) {
            throw new BusinessException("該規則集已有 " + brackets + " 檔級距，只能停用不能刪除");
        }
        ruleSetMapper.deleteById(id);
    }

    /* ==================== 個稅級距 ==================== */

    @Override
    public List<PayrollTaxBracket> listBrackets(Long ruleSetId) {
        getRuleSet(ruleSetId);
        return bracketMapper.selectList(new LambdaQueryWrapper<PayrollTaxBracket>()
                .eq(PayrollTaxBracket::getRuleSetId, ruleSetId)
                .orderByAsc(PayrollTaxBracket::getLevelNo));
    }

    @Override
    @Transactional
    public List<PayrollTaxBracket> saveBrackets(Long ruleSetId, List<PayrollTaxBracket> brackets) {
        getRuleSet(ruleSetId);
        if (brackets == null || brackets.isEmpty()) {
            throw new BusinessException("級距不能為空：沒有級距就無法計算個稅");
        }
        List<PayrollTaxBracket> sorted = brackets.stream()
                .sorted(Comparator.comparing(PayrollTaxBracket::getLowerBound))
                .toList();
        BigDecimal expectedLower = BigDecimal.ZERO;
        for (int i = 0; i < sorted.size(); i++) {
            PayrollTaxBracket bracket = sorted.get(i);
            if (bracket.getLowerBound() == null || bracket.getRate() == null) {
                throw new BusinessException("第 " + (i + 1) + " 檔缺少下限或稅率");
            }
            if (bracket.getLowerBound().compareTo(expectedLower) != 0) {
                throw new BusinessException("第 " + (i + 1) + " 檔下限必須等於上一檔上限（"
                        + expectedLower + "），不允許有空檔或重疊");
            }
            if (bracket.getRate().compareTo(BigDecimal.ZERO) < 0
                    || bracket.getRate().compareTo(BigDecimal.ONE) > 0) {
                throw new BusinessException("第 " + (i + 1) + " 檔稅率必須在 0~1 之間（10% 填 0.10）");
            }
            boolean last = i == sorted.size() - 1;
            if (last) {
                if (bracket.getUpperBound() != null) {
                    throw new BusinessException("最高檔上限必須留空（表示無上限），否則超出的部分無人徵稅");
                }
            } else {
                if (bracket.getUpperBound() == null
                        || bracket.getUpperBound().compareTo(bracket.getLowerBound()) <= 0) {
                    throw new BusinessException("第 " + (i + 1) + " 檔上限必須大於下限");
                }
                expectedLower = bracket.getUpperBound();
            }
        }
        // 级距是整体：先清后写，避免逐条改出现半套规则
        bracketMapper.delete(new LambdaQueryWrapper<PayrollTaxBracket>()
                .eq(PayrollTaxBracket::getRuleSetId, ruleSetId));
        for (int i = 0; i < sorted.size(); i++) {
            PayrollTaxBracket bracket = sorted.get(i);
            bracket.setId(null);
            bracket.setRuleSetId(ruleSetId);
            bracket.setLevelNo(i + 1);
            if (bracket.getQuickDeduction() == null) {
                bracket.setQuickDeduction(BigDecimal.ZERO);
            }
            bracketMapper.insert(bracket);
        }
        return listBrackets(ruleSetId);
    }

    /* ==================== 解析與算稅 ==================== */

    @Override
    public PayrollRuleSet resolveRuleSet(String cityCode, LocalDate onDate) {
        if (!StringUtils.hasText(cityCode) || onDate == null) {
            throw new BusinessException("缺少城市或日期，無法確定適用哪套薪酬規則");
        }
        List<PayrollRuleSet> matched = ruleSetMapper.selectList(new LambdaQueryWrapper<PayrollRuleSet>()
                .eq(PayrollRuleSet::getCityCode, cityCode.trim())
                .eq(PayrollRuleSet::getStatus, 1)
                .le(PayrollRuleSet::getEffectiveFrom, onDate)
                .and(w -> w.isNull(PayrollRuleSet::getEffectiveTo)
                        .or().ge(PayrollRuleSet::getEffectiveTo, onDate)));
        if (matched.isEmpty()) {
            throw new BusinessException("城市 " + cityCode + " 在 " + onDate
                    + " 沒有生效的薪酬規則集，請先在薪酬規則中配置（系統不提供默認費率）");
        }
        if (matched.size() > 1) {
            throw new BusinessException("城市 " + cityCode + " 在 " + onDate + " 有 "
                    + matched.size() + " 套規則集同時生效，請先收斂為一套");
        }
        return matched.get(0);
    }

    @Override
    public BigDecimal monthlyTax(PayrollRuleSet ruleSet, BigDecimal taxableBase) {
        if (ruleSet == null || taxableBase == null) {
            throw new BusinessException("缺少規則集或應納稅所得額，無法計算個稅");
        }
        List<PayrollTaxBracket> brackets = listBrackets(ruleSet.getId());
        if (brackets.isEmpty()) {
            throw new BusinessException("規則集「" + ruleSet.getName() + "」尚未配置個稅級距，無法試算");
        }
        BigDecimal deduction = ruleSet.getBasicDeduction() == null ? BigDecimal.ZERO : ruleSet.getBasicDeduction();
        BigDecimal taxable = taxableBase.subtract(deduction);
        if (taxable.compareTo(BigDecimal.ZERO) <= 0) {
            return BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
        }
        for (PayrollTaxBracket bracket : brackets) {
            boolean aboveLower = taxable.compareTo(bracket.getLowerBound()) >= 0;
            boolean belowUpper = bracket.getUpperBound() == null
                    || taxable.compareTo(bracket.getUpperBound()) < 0;
            if (aboveLower && belowUpper) {
                BigDecimal tax = taxable.multiply(bracket.getRate()).subtract(bracket.getQuickDeduction());
                return tax.compareTo(BigDecimal.ZERO) < 0
                        ? BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP)
                        : tax.setScale(2, RoundingMode.HALF_UP);
            }
        }
        throw new BusinessException("應納稅所得額 " + taxable + " 未落入任何級距，請檢查級距配置是否連續");
    }
}
