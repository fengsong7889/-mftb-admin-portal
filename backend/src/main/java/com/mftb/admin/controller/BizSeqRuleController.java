package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.entity.SysBizSeqRule;
import com.mftb.admin.util.BizSeqService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 编号生成规则查询接口
 * <p>
 * 规则与前端「规则配置 > 编号生成规则」界面一致, 为后端编号生成的唯一配置来源;
 * 安全加固: 添加 rule-config view 权限（R-24 安全审计修复）
 */
@RestController
@RequestMapping("/api/biz-seq-rules")
@RequiredArgsConstructor
public class BizSeqRuleController {

    private final BizSeqService bizSeqService;

    /** 查询全部启用中的编号生成规则 */
    @GetMapping
    @RequirePermission(menu = "rule-config", action = "view")
    public Result<List<SysBizSeqRule>> list() {
        return Result.success(bizSeqService.listActiveRules());
    }

    /** 按规则标识查询单条规则 */
    @GetMapping("/{ruleKey}")
    @RequirePermission(menu = "rule-config", action = "view")
    public Result<SysBizSeqRule> detail(@PathVariable String ruleKey) {
        SysBizSeqRule rule = bizSeqService.getRule(ruleKey);
        return Result.success(rule);
    }
}
