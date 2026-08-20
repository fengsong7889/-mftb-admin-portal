package com.mftb.admin.dto;

import lombok.Data;

import java.math.BigDecimal;

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

    /** 计分方式: 1=规则加分 2=衰减函数 3=规则减分 4=金额倍率 5=梯度计分 6=条件计分 */
    private Integer mode;

    /** 分值 */
    private Integer score;

    /** 前提条件 */
    private String prerequisites;

    /** 统计天数 */
    private Integer statDays;

    /** 历史基线天数 */
    private Integer statDaysTotal;

    /** 近期对比天数 */
    private Integer statDaysRecent;

    /** 配送范围分层分数 JSON 字符串 */
    private String rangeScores;

    /** 分时段配送范围分数 JSON 字符串 */
    private String timeRangeScores;

    /** 梯度档位 JSON 字符串 */
    private String tiers;

    /** 条件计分项 JSON 字符串 */
    private String conditionItems;

    /** 计算周期: NIGHTLY / DAILY / SCHEDULED */
    private String calcCycle;

    /** 定时监控间隔小时数 */
    private BigDecimal calcIntervalHours;

    /** 高峰时段定义 JSON */
    private String peakTimeRanges;

    /** 每单固定扣分 */
    private Integer deductionPerOrder;

    /** 衰减系数 */
    private BigDecimal decayCoefficient;

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
