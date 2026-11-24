/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 相似推荐允许投流算法集合实体（联合主键 binding_id + traffic_algorithm_id）。
 */
@Data
@TableName("biz_ad_waterfall_recommendation_traffic")
public class AdWaterfallRecommendationTraffic {

    private Long bindingId;

    /** 允许的投流算法主键（type15 真实主键，不是定价 ID） */
    private Long trafficAlgorithmId;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
}
