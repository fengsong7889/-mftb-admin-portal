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

    /** 编辑评分规则 */
    OrganicScoreRuleVO updateRule(Long id, OrganicScoreRuleRequest request);

    /** 切换规则状态（启用/停用） */
    void toggleRuleStatus(Long id);

    /** 删除自定义评分规则 */
    void deleteRule(Long id);

    /** 更新规则分值（表格内联编辑） */
    void updateRuleScore(Long id, Integer score);
}
