package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 广告格子占用计数器实体（防并发超卖）
 * <p>
 * 「无敌星星/盘活复苏」按 每日限量(dailySalesLimit) 控制库存，库存校验原本是
 * 「读活跃明细聚合 → 应用层比较」的非原子操作，并发下单可超卖。
 * 本表以「先占位再落单」的原子计数替代该比较：下单时 taken+1（受 taken &lt; limit 约束），
 * 退款/取消时 taken-1，与订单明细同事务提交。
 * <p>
 * 库存展示(inventory)仍以活跃明细聚合为准，本表仅用于下单原子性。
 */
@Data
@TableName("biz_ad_cell_quota")
public class AdCellQuota {

    @TableId
    private Long id;

    /** 广告模块: star(无敌星星) / revive(盘活复苏) */
    private String module;

    /** 投放日期 */
    private LocalDate bizDate;

    /** 商圈 */
    private Integer region;

    /** 餐段时段: breakfast/lunch/afternoon/dinner/supper；无餐段维度的模块存空串 */
    private String mealSlot;

    /** 已占用个数（活跃明细数） */
    private Integer taken;

    /** 更新时间 */
    private LocalDateTime updatedAt;
}
