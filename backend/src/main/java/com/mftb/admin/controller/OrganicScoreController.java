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
 * <p>
 * 路径中的规则标识支持两种格式：数字ID（如 7）或规则编码（如 COM_07）
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

    /** 编辑评分规则（路径参数支持数字ID或规则编码） */
    @PutMapping("/rules/{identifier}")
    @RequirePermission(menu = "promotion-algorithm", action = "edit")
    public Result<OrganicScoreRuleVO> updateRule(@PathVariable String identifier, @Valid @RequestBody OrganicScoreRuleRequest request) {
        return Result.success("编辑成功", organicScoreService.updateRuleByIdentifier(identifier, request));
    }

    /** 切换规则状态（启用/停用） */
    @PutMapping("/rules/{identifier}/toggle")
    @RequirePermission(menu = "promotion-algorithm", action = "edit")
    public Result<Void> toggleRuleStatus(@PathVariable String identifier) {
        organicScoreService.toggleRuleStatusByIdentifier(identifier);
        return Result.success();
    }

    /** 更新规则分值（表格内联编辑） */
    @PutMapping("/rules/{identifier}/score")
    @RequirePermission(menu = "promotion-algorithm", action = "edit")
    public Result<Void> updateRuleScore(@PathVariable String identifier, @RequestBody Map<String, Object> body) {
        Object raw = body.get("score");
        Integer score = null;
        if (raw instanceof Number num) {
            score = num.intValue();
        } else if (raw instanceof String str && !str.isBlank()) {
            try {
                score = Integer.parseInt(str.trim());
            } catch (NumberFormatException ignored) {
                // 非数字字符串，保持 null
            }
        }
        organicScoreService.updateRuleScoreByIdentifier(identifier, score);
        return Result.success();
    }

    /** 删除自定义评分规则 */
    @DeleteMapping("/rules/{identifier}")
    @RequirePermission(menu = "promotion-algorithm", action = "delete")
    public Result<Void> deleteRule(@PathVariable String identifier) {
        organicScoreService.deleteRuleByIdentifier(identifier);
        return Result.success();
    }
}
