package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.OrganicScoreConfigVO;
import com.mftb.admin.dto.OrganicScoreDimensionRequest;
import com.mftb.admin.dto.OrganicScoreRuleRequest;
import com.mftb.admin.dto.OrganicScoreRuleVO;
import com.mftb.admin.service.OrganicScoreService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * 自然流量评分配置接口
 */
@RestController
@RequestMapping("/api/organic-score")
@RequiredArgsConstructor
public class OrganicScoreController {

    private final OrganicScoreService organicScoreService;

    /** 获取完整配置（维度权重 + 全部评分规则） */
    @GetMapping
    @RequirePermission(menu = "promotion-algorithm")
    public Result<OrganicScoreConfigVO> getConfig() {
        return Result.success(organicScoreService.getConfig());
    }

    /** 批量更新维度权重 */
    @PutMapping("/dimensions")
    @RequirePermission(menu = "promotion-algorithm", action = "edit")
    public Result<Void> updateDimensionWeights(@RequestBody List<OrganicScoreDimensionRequest> requests) {
        organicScoreService.updateDimensionWeights(requests);
        return Result.success();
    }

    /** 新增评分规则 */
    @PostMapping("/rules")
    @RequirePermission(menu = "promotion-algorithm", action = "create")
    public Result<OrganicScoreRuleVO> createRule(@Valid @RequestBody OrganicScoreRuleRequest request) {
        return Result.success("新增成功", organicScoreService.createRule(request));
    }

    /** 编辑评分规则 */
    @PutMapping("/rules/{id}")
    @RequirePermission(menu = "promotion-algorithm", action = "edit")
    public Result<OrganicScoreRuleVO> updateRule(@PathVariable Long id, @Valid @RequestBody OrganicScoreRuleRequest request) {
        return Result.success("编辑成功", organicScoreService.updateRule(id, request));
    }

    /** 切换规则状态（启用/停用） */
    @PutMapping("/rules/{id}/toggle")
    @RequirePermission(menu = "promotion-algorithm", action = "edit")
    public Result<Void> toggleRuleStatus(@PathVariable Long id) {
        organicScoreService.toggleRuleStatus(id);
        return Result.success();
    }

    /** 更新规则分值（表格内联编辑） */
    @PutMapping("/rules/{id}/score")
    @RequirePermission(menu = "promotion-algorithm", action = "edit")
    public Result<Void> updateRuleScore(@PathVariable Long id, @RequestBody Map<String, Integer> body) {
        Integer score = body.get("score");
        organicScoreService.updateRuleScore(id, score);
        return Result.success();
    }

    /** 删除自定义评分规则 */
    @DeleteMapping("/rules/{id}")
    @RequirePermission(menu = "promotion-algorithm", action = "delete")
    public Result<Void> deleteRule(@PathVariable Long id) {
        organicScoreService.deleteRule(id);
        return Result.success();
    }
}
