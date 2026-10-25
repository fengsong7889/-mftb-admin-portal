package com.mftb.admin.service;

import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.PayrollRuleSet;
import com.mftb.admin.entity.PayrollTaxBracket;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/**
 * 薪酬規則服務（D3 第一批）：規則集 + 個稅級距 + 缺配置即拒絕。
 * <p>
 * 核心约定：<b>代码里没有任何默认税率或社保参数</b>。社保基数上下限由各统筹区每年单独公布，
 * 内置一套"通用默认值"必然在某个城市算出错数。缺少配置时抛业务异常并说明缺什么，
 * 由业务补配置后再试算。
 */
public interface PayrollRuleService {

    PageResult<PayrollRuleSet> listRuleSets(long page, long size, String keyword, String jurisdiction, Integer status);

    PayrollRuleSet getRuleSet(Long id);

    PayrollRuleSet saveRuleSet(PayrollRuleSet entity);

    void deleteRuleSet(Long id);

    List<PayrollTaxBracket> listBrackets(Long ruleSetId);

    /** 整体替换某规则集的级距（级距是一个整体，逐条改容易出现空档/重叠） */
    List<PayrollTaxBracket> saveBrackets(Long ruleSetId, List<PayrollTaxBracket> brackets);

    /**
     * 按城市 + 日期取唯一生效规则集。
     * <p>取不到或有多个同时生效都直接报错——不能挑一个"看起来对"的算。
     */
    PayrollRuleSet resolveRuleSet(String cityCode, LocalDate onDate);

    /** 按规则集算月度个税：先减基本减除费用，再套超额累进 */
    BigDecimal monthlyTax(PayrollRuleSet ruleSet, BigDecimal taxableBase);
}
