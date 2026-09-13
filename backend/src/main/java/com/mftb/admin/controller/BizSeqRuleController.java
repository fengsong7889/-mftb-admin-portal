package com.mftb.admin.controller;

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
 * 该菜单无独立权限码, 仅提供只读查询
 */
@RestController
@RequestMapping("/api/biz-seq-rules")
@RequiredArgsConstructor
public class BizSeqRuleController {

    private final BizSeqService bizSeqService;

    /** 查询全部启用中的编号生成规则 */
    @GetMapping
    public Result<List<SysBizSeqRule>> list() {
        return Result.success(bizSeqService.listActiveRules());
    }

    /** 按规则标识查询单条规则 */
    @GetMapping("/{ruleKey}")
    public Result<SysBizSeqRule> detail(@PathVariable String ruleKey) {
        SysBizSeqRule rule = bizSeqService.getRule(ruleKey);
        return Result.success(rule);
    }
}
