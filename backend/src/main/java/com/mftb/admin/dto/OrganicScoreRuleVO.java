package com.mftb.admin.dto;

import lombok.Data;

/**
 * 自然流量评分规则 VO
 */
@Data
public class OrganicScoreRuleVO {

    private Long id;

    /** 规则编码 */
    private String ruleCode;

    /** 所属维度: 1=商業 2=店鋪 4=平台 */
    private Integer dimension;

    /** 规则名称 */
    private String name;

    /** 计分说明 */
    private String description;

    /** 计分方式: 1=规则加分 2=衰减函数 3=规则减分 4=金额倍率 5=梯度计分 */
    private Integer mode;

    /** 分值 */
    private Integer score;

    /** 统计天数 */
    private Integer statDays;

    /** 配送范围分层分数 JSON 字符串 */
    private String rangeScores;

    /** 梯度档位 JSON 字符串 */
    private String tiers;

    /** 计算周期: NIGHTLY / DAILY */
    private String calcCycle;

    /** 服务状态: 1=启用 2=停用 */
    private Integer status;

    /** 是否系统内置: 1=是 0=否 */
    private Integer builtin;

    /** 排序号 */
    private Integer sortOrder;

    /** 最后更新人 */
    private String updatedBy;

    /** 更新时间 */
    private String updateTime;
}
