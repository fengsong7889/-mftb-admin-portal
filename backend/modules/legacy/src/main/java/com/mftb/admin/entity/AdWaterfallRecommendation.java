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
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 瀑布流相似推荐场景绑定实体。
 * <p>一个瀑布流一个场景唯一一行；关闭用 enabled=0 表达，不删除主记录。
 */
@Data
@TableName("biz_ad_waterfall_recommendation")
public class AdWaterfallRecommendation {

    @TableId
    private Long id;

    /** 瀑布流策略主键 */
    private Long waterfallId;

    /** 场景: 1=详情返回瀑布流 2/3=预留首期不可启用 */
    private Integer sceneCode;

    /** 相似推荐算法主键（type17） */
    private Long algorithmId;

    /** 引用的不可变版本主键 */
    private Long algorithmRevisionId;

    /** 启用: 0=关闭 1=启用 */
    private Integer enabled;

    /** 候选范围: 1=全部合格商家 2=仅有效投流商家 */
    private Integer candidateScope;

    /** 业务类型: 1=外卖到家 2=团购到店 */
    private Integer businessType;

    /** 业务频道: 1=美食外卖 2=超市百货 3=团购到店 */
    private Integer bizChannel;

    /** 乐观锁版本 */
    private Long version;

    private String updatedBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
