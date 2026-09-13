package com.mftb.admin.service;

import java.time.LocalDate;

/**
 * 广告格子占用计数器服务（防并发超卖）
 * <p>
 * 「无敌星星/盘活复苏」下单时先占位（taken+1，受每日限量约束），
 * 退款/取消时释放（taken-1）；占位/释放与订单写入同事务提交。
 */
public interface AdCellQuotaService {

    /** 模块标识: 无敌星星 */
    String MODULE_STAR = "star";

    /** 模块标识: 盘活复苏 */
    String MODULE_REVIVE = "revive";

    /**
     * 原子占位一个格子: 计数 +1，达到每日限量时抛出业务异常
     *
     * @param module   广告模块（MODULE_STAR / MODULE_REVIVE）
     * @param bizDate  投放日期
     * @param region   商圈
     * @param mealSlot 餐段（无餐段维度传空串）
     * @param limit    该格子每日限量
     * @throws com.mftb.admin.common.BusinessException 格子已售罄
     */
    void takeCell(String module, LocalDate bizDate, Integer region, String mealSlot, int limit);

    /**
     * 释放一个格子占用（退款/取消时调用），计数下限钳位到 0
     */
    void releaseCell(String module, LocalDate bizDate, Integer region, String mealSlot);
}
