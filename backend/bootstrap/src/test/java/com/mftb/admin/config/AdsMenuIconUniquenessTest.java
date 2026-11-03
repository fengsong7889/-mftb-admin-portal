/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.config;

import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 广告推广（ads）系统菜单图标唯一性门禁 —— 把 AI 系统已有的断言（{@link AiMenuLayoutTest}）扩展到 ads。
 *
 * <p>背景：AGENTS.md「菜单图标唯一性规范」要求同一业务系统内所有菜单图标（一级分组、二级目录、叶子）
 * 互不重复，但此前只有 AI 系统有静态断言，ads 系统靠人工核对，已经攒下两组重复
 * （{@code FileTextOutlined} = 秒殺商品登記 + 消費明細；{@code ShoppingFilled} = 廣告銷售 + 團購管理）。
 * 本用例先把门禁立起来，历史重复以「例外登记」形式挂账（含原因/风险/补偿/负责人/到期），
 * 之后任何新增或改动的图标只要在本系统内撞色就直接红，杜绝继续无声累积。
 *
 * <p>图标真值来源（与运行时同源，不引入第二套口径）：
 * <ul>
 *   <li>{@code DataInitializer.MENU_ICON_DEFAULTS} —— menu_key → 默认图标，启动期幂等校正 sys_menu.icon；</li>
 *   <li>{@link #AD_HOC_ICON_WRITES} —— 少数菜单的图标不走默认表，而是 DataInitializer 里的定向
 *       {@code UPDATE sys_menu SET icon = ...}，属于默认表的盲区，必须在下面清单里显式登记，
 *       否则门禁会把它看成「没有图标」而静默失明。</li>
 * </ul>
 *
 * <p>范围真值：{@code sys_menu.system_code = 'ads' AND deleted = 0}，归属唯一真值见
 * {@code docs/system-portal/inventory.md}。ads 菜单增删或改名时必须同步 {@link #ADS_MENU_KEYS}，
 * 复核 SQL：{@code SELECT menu_key, icon FROM sys_menu WHERE deleted=0 AND system_code='ads' ORDER BY menu_key}。
 */
class AdsMenuIconUniquenessTest {

    /** ads 系统在用菜单（含分组与叶子）：2026-11-03 按库内快照盘点，新增/下线菜单时同步本数。 */
    private static final List<String> ADS_MENU_KEYS = List.of(
            "promotion-dashboard", "promotion-waterfall", "promotion-slot-config", "promotion-algorithm",
            "promotion-word-library", "ad-sales", "merchant_promotion", "gift-manage", "gift-detail",
            "gift-consume-detail", "group-purchase", "group-purchase-dashboard", "flash-sale-register",
            "flash-sale-price", "flash-sale-stats", "traffic-sandbox", "merchant-score-insight",
            "waterfall-simulation", "algorithm-simulation", "merchant-promotion-diagnose");

    /** 实验沙盘子树（2026-11 「商家權重分」口径改造涉及的入口，禁止申请任何图标例外）。 */
    private static final List<String> SANDBOX_SUBTREE_KEYS = List.of(
            "traffic-sandbox", "merchant-score-insight", "waterfall-simulation",
            "algorithm-simulation", "merchant-promotion-diagnose");

    /**
     * 默认图标表的盲区：图标由 DataInitializer 的定向 UPDATE 写入，不在 MENU_ICON_DEFAULTS 内。
     * key → icon；出处见 DataInitializer「UPDATE sys_menu SET icon = 'ShoppingFilled' WHERE menu_key = 'group-purchase'」。
     */
    private static final Map<String, String> AD_HOC_ICON_WRITES = Map.of(
            "group-purchase", "ShoppingFilled");

    /** 历史重复图标的例外登记（AGENTS.md 元规则 10：原因、风险、补偿、负责人、到期时间缺一不可）。 */
    private record IconException(String icon, String keyA, String keyB,
                                 String reason, String risk, String remedy, String owner, String expires) {
    }

    private static final List<IconException> REGISTERED_EXCEPTIONS = List.of(
            new IconException("FileTextOutlined", "flash-sale-register", "gift-consume-detail",
                    "两项建项时都取了「明细/登记」语义的文档图标，当时无查重门禁",
                    "侧边栏两处同图标叠在一起，用户无法靠图标区分入口",
                    "下一批次按本门禁换掉 gift-consume-detail 的图标（同步 MenuIcon.tsx 注册表与 inventory.md）",
                    "fengsong7889", "2026-12-31"),
            new IconException("ShoppingFilled", "ad-sales", "group-purchase",
                    "團購管理沿用廣告銷售的购物车图标，当时无查重门禁",
                    "两个不同业务域同图标，跨域浏览时易点错",
                    "下一批次把 group-purchase 改为 ShoppingCartOutlined 之类的未占用图标",
                    "fengsong7889", "2026-12-31"));

    /** 反射读取 DataInitializer 的私有默认图标表：为了不让「加门禁」反过来改动 config 主代码。 */
    @SuppressWarnings("unchecked")
    private static Map<String, String> seedIconDefaults() {
        try {
            Field field = DataInitializer.class.getDeclaredField("MENU_ICON_DEFAULTS");
            field.setAccessible(true);
            return (Map<String, String>) field.get(null);
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException(
                    "无法读取 MENU_ICON_DEFAULTS：种子常量被改名或移除会让本门禁静默失明，必须同步修正本用例", e);
        }
    }

    /** 取某菜单的门禁视角图标：默认表优先，其次定向 UPDATE 盲区清单；两处都没有则返回 null。 */
    private static String iconOf(Map<String, String> defaults, String menuKey) {
        String icon = defaults.get(menuKey);
        return icon != null ? icon : AD_HOC_ICON_WRITES.get(menuKey);
    }

    @Test
    void ads在册菜单都必须能解析到图标() {
        Map<String, String> defaults = seedIconDefaults();
        List<String> unresolved = new ArrayList<>();
        for (String key : ADS_MENU_KEYS) {
            if (iconOf(defaults, key) == null) {
                unresolved.add(key);
            }
        }
        assertTrue(unresolved.isEmpty(),
                "以下 ads 菜单既不在默认图标表、也未登记进盲区清单，门禁会漏判它们：" + unresolved
                        + "；请补 MENU_ICON_DEFAULTS 或在 AD_HOC_ICON_WRITES 登记出处");
    }

    @Test
    void ads系统内菜单图标不得重复() {
        Map<String, String> defaults = seedIconDefaults();
        Map<String, List<String>> keysByIcon = new LinkedHashMap<>();
        for (String key : ADS_MENU_KEYS) {
            String icon = iconOf(defaults, key);
            if (icon != null) {
                keysByIcon.computeIfAbsent(icon, k -> new ArrayList<>()).add(key);
            }
        }

        List<String> violations = new ArrayList<>();
        List<IconException> staleExceptions = new ArrayList<>(REGISTERED_EXCEPTIONS);
        for (Map.Entry<String, List<String>> entry : keysByIcon.entrySet()) {
            if (entry.getValue().size() <= 1) {
                continue;
            }
            List<String> sharing = entry.getValue();
            // 一个图标被 3 个及以上菜单共用时，两两例外登记也无法覆盖，必须直接判失败
            if (sharing.size() != 2) {
                violations.add("图标 " + entry.getKey() + " 被 " + sharing.size() + " 个菜单共用：" + sharing);
                continue;
            }
            // 同一图标被两个菜单共用时, 在册清单里的先后顺序会随盘点变动, 因此按集合而非顺序比对例外
            Set<String> sharingKeys = new HashSet<>(sharing);
            boolean registered = REGISTERED_EXCEPTIONS.stream().anyMatch(ex -> ex.icon().equals(entry.getKey())
                    && sharingKeys.equals(Set.of(ex.keyA(), ex.keyB())));
            if (registered) {
                staleExceptions.removeIf(ex -> ex.icon().equals(entry.getKey()));
            } else {
                violations.add("图标 " + entry.getKey() + " 重复于 " + sharing
                        + "；请换本系统未占用的注册图标（见 MenuIcon.tsx），或按 IconException 登记例外并写明到期时间");
            }
        }
        assertTrue(violations.isEmpty(), "ads 系统菜单图标违反唯一性：" + violations);

        // 例外清单不得变成永久挂账：库里已经不重复了还留着例外，同样要清理
        for (IconException stale : staleExceptions) {
            Set<String> sharing = new HashSet<>(keysByIcon.getOrDefault(stale.icon(), List.of()));
            assertTrue(sharing.equals(Set.of(stale.keyA(), stale.keyB())),
                    "例外登记已失效（图标 " + stale.icon() + " 当前不再重复），请从 REGISTERED_EXCEPTIONS 移除");
        }
    }

    @Test
    void 实验沙盘子树图标不得重复且不得申请例外() {
        Map<String, String> defaults = seedIconDefaults();
        Map<String, String> icons = new HashMap<>();
        for (String key : SANDBOX_SUBTREE_KEYS) {
            String icon = iconOf(defaults, key);
            assertNotNull(icon, "实验沙盘子菜单 " + key + " 解析不到图标，口径改造的入口门禁失效");
            icons.put(key, icon);
        }
        long distinct = icons.values().stream().distinct().count();
        assertEquals(SANDBOX_SUBTREE_KEYS.size(), distinct,
                "实验沙盘分组内图标必须两两不同（用户靠图标区分层级），实际：" + icons);
        // 商家權重分（325 置首 + 326 更名）的入口图标锚定，防止被顺手改成与其它子项同色
        assertEquals("TrophyOutlined", icons.get("merchant-score-insight"),
                "商家權重分的入口图标锚定 TrophyOutlined，改动必须同步设计方案与本断言");
        for (IconException ex : REGISTERED_EXCEPTIONS) {
            assertFalse(SANDBOX_SUBTREE_KEYS.contains(ex.keyA()) || SANDBOX_SUBTREE_KEYS.contains(ex.keyB()),
                    "实验沙盘子树不允许挂图标例外：" + ex.icon() + " → " + ex.keyA() + "/" + ex.keyB());
        }
    }

    @Test
    void 图标例外登记必须写全补偿与到期时间() {
        for (IconException ex : REGISTERED_EXCEPTIONS) {
            assertFalse(ex.reason().isBlank(), "例外缺少原因：" + ex.icon());
            assertFalse(ex.risk().isBlank(), "例外缺少风险：" + ex.icon());
            assertFalse(ex.remedy().isBlank(), "例外缺少补偿措施：" + ex.icon());
            assertFalse(ex.owner().isBlank(), "例外缺少负责人：" + ex.icon());
            assertTrue(ex.expires().matches("\\d{4}-\\d{2}-\\d{2}"),
                    "例外到期时间必须是 yyyy-MM-dd，长期挂账不允许：" + ex.icon());
        }
    }
}
