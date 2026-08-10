package com.mftb.admin.dto;

import lombok.Data;

import java.util.List;

/**
 * 自然流量评分完整配置 VO（维度权重 + 评分规则）
 */
@Data
public class OrganicScoreConfigVO {

    /** 维度权重列表 */
    private List<OrganicScoreDimensionVO> dimensions;

    /** 评分规则列表 */
    private List<OrganicScoreRuleVO> rules;
}
