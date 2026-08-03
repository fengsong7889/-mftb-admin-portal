package com.mftb.admin.util;

/**
 * 广告算法类型编码 → 广告类型名称
 * <p>
 * 财务明细「变动类别」记录广告类型（如無敵星星），便于按广告算法追溯消费/退款。
 * 新增广告算法时在此登记类型名称。
 */
public final class AdAlgoTypeNames {

    /** 未知类型的兜底名称 */
    public static final String FALLBACK = "廣告消費";

    private AdAlgoTypeNames() {
    }

    /** 广告类型名称: 1=無敵星星 2=新店廣告 3=盤活復蘇 4=流量廣告 5=人氣商家 */
    public static String of(Integer algoType) {
        if (algoType == null) {
            return FALLBACK;
        }
        return switch (algoType) {
            case 1 -> "無敵星星";
            case 2 -> "新店廣告";
            case 3 -> "盤活復蘇";
            case 4 -> "流量廣告";
            case 5 -> "人氣商家";
            default -> FALLBACK;
        };
    }
}
