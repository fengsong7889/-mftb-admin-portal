package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 瀑布流坑位明细实体
 * 一个坑位只能展示一种算法，同一算法可配置在多个坑位
 */
@Data
@TableName("biz_ad_waterfall_slot")
public class AdWaterfallSlot {

    @TableId
    private Long id;

    /** 瀑布流策略ID（biz_ad_waterfall.id） */
    private Long waterfallId;

    /** 坑位序号（从1开始） */
    private Integer slotPosition;

    /** 算法ID（biz_ad_algorithm.id） */
    private Long algoId;

    /** 算法名称快照 */
    private String algoName;

    /** 算法类型快照: 1=无敌星星 2=新店广告 3=盘活复苏 ... */
    private Integer algoType;

    /** 坑位状态: 1=启用 2=停用 */
    private Integer status;

    /** 逻辑删除 */
    @TableLogic
    private Integer deleted;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
