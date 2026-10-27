package com.mftb.admin.service;

import com.mftb.admin.dto.StoreDataConfigDTO;

/**
 * 门店金字招牌数据配置服务
 */
public interface StoreDataConfigService {

    /**
     * 查询门店数据配置；门店尚无配置时按 storeId 种子确定性随机预生成并落库
     */
    StoreDataConfigDTO getConfig(Long storeId);

    /**
     * 更新门店数据配置（不存在则插入）
     */
    void updateConfig(Long storeId, StoreDataConfigDTO dto);

    /**
     * 按 storeId 种子确定性随机生成一批配置数据（mulberry32，与前端 mock 算法一致）
     */
    static StoreDataConfigDTO generate(Long storeId) {
        long seed = (storeId * 2654435761L) & 0xFFFFFFFFL;
        Mulberry32 rng = new Mulberry32((int) seed);
        int monthlyOrders = rng.between(300, 2000);
        StoreDataConfigDTO dto = new StoreDataConfigDTO();
        dto.setMonthlyOrders(monthlyOrders);
        // 复购订单约占月订单 10%~30%
        dto.setMonthlyRepurchaseOrders((int) Math.round(monthlyOrders * (0.1 + rng.next() * 0.2)));
        // 好评订单约占月订单 40%~80%
        dto.setMonthlyPositiveOrders((int) Math.round(monthlyOrders * (0.4 + rng.next() * 0.4)));
        // 访问量约为月订单 2~5 倍
        dto.setMonthlyVisits(monthlyOrders * rng.between(2, 5));
        dto.setStoreFavorites(rng.between(100, 1000));
        // 顾客数约占月订单 50%~90%
        dto.setMonthlyCustomers((int) Math.round(monthlyOrders * (0.5 + rng.next() * 0.4)));
        return dto;
    }

    /** mulberry32 确定性随机数生成器（与前端实现保持逐位一致） */
    final class Mulberry32 {
        private int state;

        Mulberry32(int seed) {
            this.state = seed;
        }

        /** [0, 1) 均匀分布 */
        double next() {
            state += 0x6D2B79F5;
            int t = state;
            t = (t ^ (t >>> 15)) * (t | 1);
            t = (t + (t ^ (t >>> 7)) * (t | 61)) ^ t;
            return Integer.toUnsignedLong(t ^ (t >>> 14)) / 4294967296.0;
        }

        /** [min, max] 闭区间整数 */
        int between(int min, int max) {
            return (int) Math.round(min + next() * (max - min));
        }
    }
}
