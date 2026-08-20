package com.mftb.admin.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;

/**
 * 自然流量评分规则新增/编辑请求
 */
@Data
public class OrganicScoreRuleRequest {

    /** 所属维度: 1=商業 2=店鋪 4=平台 */
    @NotNull(message = "维度不能为空")
    private Integer dimension;

    /** 规则名称 */
    @NotBlank(message = "规则名称不能为空")
    private String name;

    /** 计分说明 */
    @NotBlank(message = "计分说明不能为空")
    private String description;

    /** 计分方式: 1=规则加分 2=衰减函数 3=规则减分 4=金额倍率 5=梯度计分 6=条件计分 */
    @NotNull(message = "计分方式不能为空")
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

    /** 屏蔽商家列表 JSON 字符串 */
    private String blockedMerchants;

    /** 服务状态: 1=启用 2=停用 */
    @NotNull(message = "状态不能为空")
    private Integer status;
}
