package com.mftb.admin.util;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.Map;

/**
 * 广告销售公共计算工具: 梯度折扣匹配与数值读取
 * <p>
 * 供 AdSales 系列服务（热门/回春/星级/招牌）复用，避免各实现内重复定义。
 */
public final class AdCalcUtils {

    private AdCalcUtils() {
    }

    /**
     * 匹配梯度折扣: 按阈值键降序取第一个满足「数量 >= 阈值」的梯度
     *
     * @param discountTiersJson 梯度配置 JSON 数组，每项含阈值键与 discount 字段
     * @param thresholdKey      阈值键名（如 minDays / minSlots）
     * @param count             购买数量（格子数/天数等）
     * @return 折扣百分比（如 95 = 95折）, 无匹配返回 100
     */
    public static BigDecimal matchDiscountTier(String discountTiersJson, String thresholdKey, int count) {
        List<Map<String, Object>> tiers = JsonUtils.parseMapList(discountTiersJson);
        tiers.sort((a, b) -> Integer.compare(intOf(b, thresholdKey), intOf(a, thresholdKey)));
        for (Map<String, Object> tier : tiers) {
            if (count >= intOf(tier, thresholdKey)) {
                BigDecimal discount = decimalOf(tier, "discount");
                if (discount != null && discount.compareTo(BigDecimal.ZERO) > 0) {
                    return discount;
                }
            }
        }
        return BigDecimal.valueOf(100);
    }

    /** 从 Map 中读取 int 值（缺失或非 Number 时返回 0） */
    public static int intOf(Map<String, Object> map, String key) {
        Object value = map.get(key);
        return value instanceof Number number ? number.intValue() : 0;
    }

    /** 从 Map 中读取 BigDecimal 值（缺失或非 Number 时返回 null） */
    public static BigDecimal decimalOf(Map<String, Object> map, String key) {
        Object value = map.get(key);
        if (value instanceof Number number) {
            return new BigDecimal(number.toString());
        }
        return null;
    }

    /** 金额保留两位小数（四舍五入） */
    public static BigDecimal round2(BigDecimal value) {
        return value.setScale(2, RoundingMode.HALF_UP);
    }
}
