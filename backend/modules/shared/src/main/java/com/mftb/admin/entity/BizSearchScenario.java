package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 搜索场景策略实体（方案 §7.6/§11.1「场景策略」）。
 * <p>五场景共用一套检索内核，此处配置字段权重(R/Q/D/H)、候选窗口与广告上限。
 * 权重合计须为 100%、相关性 R 不低于 60%、店内广告上限=0、首页≤2；真实生效由搜索内核消费（B1，依赖 ES）。
 */
@Data
@TableName("biz_search_scenario")
public class BizSearchScenario {

    @TableId
    private Long id;

    private String scenarioNo;

    /** 场景: 1=首页 2=频道 3=店内 */
    private Integer surface;

    /** 业务频道: 1=美食外卖 2=超市百货 3=团购到店 */
    private Integer bizChannel;

    /** 对象类型: 1=商家 2=商品 3=套餐 */
    private Integer objectType;

    private Integer weightRelevance;

    private Integer weightQuality;

    private Integer weightDistance;

    private Integer weightHeat;

    private Integer candidateWindow;

    /** 首屏广告上限（店内=0，首页≤2） */
    private Integer adLimitPerPage;

    /** 过滤/排序规则(JSON) */
    private String filterRule;

    /** 1=启用 2=停用 */
    private Integer status;

    private String createdBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    private String updatedBy;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}
