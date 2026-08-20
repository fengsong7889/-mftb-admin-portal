package com.mftb.admin.service;

import com.mftb.admin.dto.OrganicScoreConfigVO;
import com.mftb.admin.dto.OrganicScoreDimensionRequest;
import com.mftb.admin.dto.OrganicScoreRuleRequest;
import com.mftb.admin.dto.OrganicScoreRuleVO;

import java.util.List;

/**
 * 自然流量评分配置管理服务
 */
public interface OrganicScoreService {

    /** 获取完整配置（维度权重 + 全部评分规则） */
    OrganicScoreConfigVO getConfig();

    /** 批量更新维度权重 */
    void updateDimensionWeights(List<OrganicScoreDimensionRequest> requests);

    /** 新增评分规则 */
    OrganicScoreRuleVO createRule(OrganicScoreRuleRequest request);

    /** 编辑评分规则（按数字ID） */
    OrganicScoreRuleVO updateRule(Long id, OrganicScoreRuleRequest request);

    /** 编辑评分规则（按数字ID或规则编码） */
    OrganicScoreRuleVO updateRuleByIdentifier(String identifier, OrganicScoreRuleRequest request);

    /** 切换规则状态（启用/停用）（按数字ID） */
    void toggleRuleStatus(Long id);

    /** 切换规则状态（按数字ID或规则编码） */
    void toggleRuleStatusByIdentifier(String identifier);

    /** 删除自定义评分规则（按数字ID） */
    void deleteRule(Long id);

    /** 删除自定义评分规则（按数字ID或规则编码） */
    void deleteRuleByIdentifier(String identifier);

    /** 更新规则分值（表格内联编辑）（按数字ID） */
    void updateRuleScore(Long id, Integer score);

    /** 更新规则分值（按数字ID或规则编码） */
    void updateRuleScoreByIdentifier(String identifier, Integer score);
}
