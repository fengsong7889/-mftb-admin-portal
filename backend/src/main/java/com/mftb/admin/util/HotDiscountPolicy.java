package com.mftb.admin.util;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.AdDiscountTier;
import com.mftb.admin.dto.AdPricingHotVO;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** 人气商家配置、试算和下单共用的规则；金额规则不允许降级为示例数据。 */
public final class HotDiscountPolicy {
    public static final String SHARED = "shared";
    public static final String INDEPENDENT = "independent";
    public static final String SMALL = "small";
    public static final String LARGE = "large";
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Set<String> SMALL_KEYS = Set.of("small_red", "small_orange", "small_amber",
            "small_purple", "small_magenta", "small_pink", "small_blue", "small_green",
            "small_teal", "small_brown", "small_gold");
    private static final Set<String> LARGE_KEYS = Set.of("large_grid", "large_carousel", "large_triple", "large_hero");
    private static final Map<String, String> LEGACY_NAMES = Map.ofEntries(
            Map.entry("活力红", "small_red"), Map.entry("活力紅", "small_red"), Map.entry("暖橙", "small_orange"),
            Map.entry("明黄", "small_amber"), Map.entry("明黃", "small_amber"), Map.entry("魅紫", "small_purple"),
            Map.entry("洋红", "small_magenta"), Map.entry("洋紅", "small_magenta"), Map.entry("桃粉", "small_pink"),
            Map.entry("天蓝", "small_blue"), Map.entry("天藍", "small_blue"), Map.entry("鲜绿", "small_green"),
            Map.entry("鮮綠", "small_green"), Map.entry("湖青", "small_teal"), Map.entry("深棕", "small_brown"),
            Map.entry("鎏金", "small_gold"), Map.entry("大图拼列", "large_grid"), Map.entry("大圖拼列", "large_grid"),
            Map.entry("阶梯轮播", "large_carousel"), Map.entry("階梯輪播", "large_carousel"),
            Map.entry("三图并列", "large_triple"), Map.entry("三圖並列", "large_triple"),
            Map.entry("单品大图", "large_hero"), Map.entry("單品大圖", "large_hero"));

    private HotDiscountPolicy() { }

    public static String mode(String value) {
        if (value == null) return SHARED;
        if (!Set.of(SHARED, INDEPENDENT).contains(value)) throw new BusinessException("折扣模式無效");
        return value;
    }

    public static List<AdDiscountTier> normalize(List<AdDiscountTier> tiers) {
        if (tiers == null) return List.of();
        Set<Integer> days = new HashSet<>();
        List<AdDiscountTier> result = new ArrayList<>();
        for (AdDiscountTier tier : tiers) {
            if (tier == null || tier.minDays() == null || tier.discount() == null) {
                throw new BusinessException("請填寫完整梯度");
            }
            int threshold;
            try { threshold = tier.minDays().intValueExact(); }
            catch (ArithmeticException e) { throw new BusinessException("購買天數必須為整數"); }
            if (threshold < 1 || threshold > 9999 || !days.add(threshold)) {
                throw new BusinessException("梯度天數須為1–9999且不能重複");
            }
            BigDecimal discount = tier.discount().stripTrailingZeros();
            if (discount.compareTo(new BigDecimal("0.1")) < 0 || discount.compareTo(BigDecimal.valueOf(100)) > 0
                    || discount.scale() > 1) throw new BusinessException("折扣須為0.01–10折，最多兩位小數");
            result.add(new AdDiscountTier(BigDecimal.valueOf(threshold), discount));
        }
        result.sort(Comparator.comparing(AdDiscountTier::minDays));
        return result;
    }

    public static List<AdDiscountTier> parse(String json) {
        if (json == null || json.isBlank() || "null".equals(json)) return List.of();
        try { return normalize(JSON.readValue(json, new TypeReference<List<AdDiscountTier>>() { })); }
        catch (BusinessException e) { throw e; }
        catch (Exception e) { throw new BusinessException("折扣配置無法解析，請聯繫管理員"); }
    }

    public static boolean enabled(Boolean explicit, String sharedTiers) {
        return explicit != null ? explicit : !parse(sharedTiers).isEmpty();
    }

    public record Metadata(String templateKey, String displayMode) { }

    public static Metadata metadata(String name, String templateKey, String displayMode) {
        if (displayMode != null && !Set.of(SMALL, LARGE).contains(displayMode)) {
            throw new BusinessException("皮膚展示模式無效");
        }
        String key = templateKey;
        if (key == null) {
            String candidate = LEGACY_NAMES.get(name);
            if (candidate != null && (displayMode == null || displayMode.equals(templateMode(candidate)))) key = candidate;
        }
        if (key == null) return new Metadata(null, displayMode);
        String expected = templateMode(key);
        if (displayMode != null && !expected.equals(displayMode)) throw new BusinessException("皮膚模板與展示模式不一致");
        return new Metadata(key, expected);
    }

    private static String templateMode(String key) {
        if (SMALL_KEYS.contains(key)) return SMALL;
        if (LARGE_KEYS.contains(key)) return LARGE;
        throw new BusinessException("皮膚模板無效");
    }

    public record Effective(String source, List<AdDiscountTier> tiers) {
        public AdDiscountTier match(int days) {
            return tiers.stream().filter(t -> t.minDays().intValueExact() <= days)
                    .max(Comparator.comparing(AdDiscountTier::minDays)).orElse(null);
        }
    }

    public static Effective resolve(AdPricingHotVO pricing, AdPricingHotVO.SkinPriceItem skin) {
        if (!enabled(pricing.getDiscountEnabled(), pricing.getDiscountTiers())) return new Effective("none", List.of());
        if (SHARED.equals(mode(pricing.getDiscountMode()))) return new Effective(SHARED, parse(pricing.getDiscountTiers()));
        if (SMALL.equals(skin.getDisplayMode())) return new Effective(SMALL, parse(pricing.getSmallDiscountTiers()));
        if (LARGE.equals(skin.getDisplayMode())) return new Effective(LARGE, parse(pricing.getLargeDiscountTiers()));
        throw new BusinessException("皮膚大小圖歸屬未確認，暫不能使用獨立折扣");
    }
}
