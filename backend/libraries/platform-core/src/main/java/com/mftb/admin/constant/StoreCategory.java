package com.mftb.admin.constant;

/**
 * 门店品类字典（稳定编码 + 繁体中文名）。
 * <p>
 * 用途：金字招牌「{品類}」文案（如「全澳火鍋熱門店鋪」）取门店自身品类；
 * 编码落库于 {@code biz_store.category}，禁止前端自由文本，避免同一品类出现多种写法。
 * <p>
 * 与前端 {@code src/constants/storeCategory.ts} 保持同源，增删品类必须两端同步。
 */
public enum StoreCategory {

    CHINESE("chinese", "中餐"),
    WESTERN("western", "西餐"),
    HOTPOT("hotpot", "火鍋"),
    JAPANESE("japanese", "日式料理"),
    KOREAN("korean", "韓式料理"),
    SOUTHEAST_ASIAN("southeast_asian", "東南亞料理"),
    DESSERT("dessert", "甜品"),
    SNACK("snack", "小食"),
    DRINK("drink", "飲品"),
    BAKERY("bakery", "烘焙"),
    BBQ("bbq", "燒烤"),
    VEGETARIAN("vegetarian", "素食"),
    OTHER("other", "其他");

    private final String code;
    private final String label;

    StoreCategory(String code, String label) {
        this.code = code;
        this.label = label;
    }

    public String getCode() {
        return code;
    }

    public String getLabel() {
        return label;
    }

    /** 按编码取枚举，未知编码返回 null（由调用方决定拒绝或忽略） */
    public static StoreCategory of(String code) {
        if (code == null) {
            return null;
        }
        String normalized = code.trim();
        for (StoreCategory item : values()) {
            if (item.code.equals(normalized)) {
                return item;
            }
        }
        return null;
    }

    /** 按编码取展示名，未知/空编码返回 null（文案降级为不带品类） */
    public static String labelOf(String code) {
        StoreCategory item = of(code);
        return item == null ? null : item.getLabel();
    }
}
