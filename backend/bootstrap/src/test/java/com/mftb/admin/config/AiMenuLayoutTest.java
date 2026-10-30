package com.mftb.admin.config;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 人工智能系统菜单布局的静态约束。
 *
 * <p>为什么用单测守：目标结构只在启动期由 {@link AiMenuLayoutInitializer} 落到数据库，
 * 单元测试不连库也能挡住「分组 key 打错父级」「叶子重复归位」「改名时漏了历史名」
 * 这类改动——它们一旦上线，表现是菜单消失或名称回退，排查成本很高。
 */
class AiMenuLayoutTest {

    private static final Set<String> GROUP_KEYS = new HashSet<>(
            AiMenuLayout.GROUPS.stream().map(AiMenuLayout.Group::key).toList());

    @Test
    void 分组key必须唯一且使用独立前缀() {
        Set<String> seen = new HashSet<>();
        Set<Integer> sorts = new HashSet<>();
        for (AiMenuLayout.Group group : AiMenuLayout.GROUPS) {
            assertTrue(group.key().startsWith("ai-grp-"),
                    "一级分组 key 必须用 ai-grp- 前缀，避免与 agent-% / ai-assistant-% 的启动断言冲突：" + group.key());
            assertTrue(seen.add(group.key()), "分组 key 重复：" + group.key());
            assertTrue(sorts.add(group.sort()), "分组排序重复：" + group.sort());
            assertFalse(group.name().isBlank(), "分组缺少中文名：" + group.key());
            assertFalse(group.nameEn().isBlank(), "分组缺少英文名：" + group.key());
            assertFalse(group.icon().isBlank(), "分组缺少图标：" + group.key());
        }
    }

    @Test
    void 每个菜单只归位一次且父级必须存在() {
        List<AiMenuLayout.Placement> all = allPlacements();
        Set<String> keys = new HashSet<>();
        for (AiMenuLayout.Placement placement : all) {
            assertTrue(keys.add(placement.key()), "同一菜单被重复归位：" + placement.key());
            assertFalse(GROUP_KEYS.contains(placement.key()),
                    "菜单 key 不能与一级分组 key 相同：" + placement.key());
            assertTrue(GROUP_KEYS.contains(placement.parentKey())
                            || AiMenuLayout.SUB_GROUPS.stream()
                            .anyMatch(sub -> sub.key().equals(placement.parentKey())),
                    "父级必须是已登记的分组或二级目录：" + placement.key() + " → " + placement.parentKey());
            assertFalse(placement.name().isBlank(), "缺少中文名：" + placement.key());
            assertFalse(placement.nameEn().isBlank(), "缺少英文名：" + placement.key());
            assertFalse(placement.icon() == null || placement.icon().isBlank(),
                    "菜单缺少图标：" + placement.key());
            for (String legacy : placement.legacyNames()) {
                assertFalse(legacy.equals(placement.name()),
                        "历史名与新名相同会导致无条件改名：" + placement.key());
            }
        }
    }

    @Test
    void 二级目录必须先于叶子归位且都有一级父级() {
        for (AiMenuLayout.Placement sub : AiMenuLayout.SUB_GROUPS) {
            assertTrue(GROUP_KEYS.contains(sub.parentKey()),
                    "二级目录必须直接挂一级分组：" + sub.key() + " → " + sub.parentKey());
        }
    }

    @Test
    void 全系统菜单图标不得重复() {
        // 背景：曾出现「總覽/平台總覽/助手總覽」三处同用 DashboardOutlined，用户无法靠图标区分层级。
        // 新增/改图标时若命中本断言，换一个语义贴切且未在 AI 系统用过的注册图标（见 MenuIcon.tsx）。
        Set<String> icons = new HashSet<>();
        for (AiMenuLayout.Group group : AiMenuLayout.GROUPS) {
            assertTrue(icons.add(group.icon()), "菜单图标重复：" + group.icon()
                    + "（分组 " + group.key() + "）");
        }
        for (AiMenuLayout.Placement placement : allPlacements()) {
            assertTrue(icons.add(placement.icon()), "菜单图标重复：" + placement.icon()
                    + "（菜单 " + placement.key() + "）");
        }
    }

    @Test
    void 功能入口数量不得无故减少() {
        // 32 = 2026-10 盘点口径的叶子入口数；新增/合并入口时同步调整并在 inventory.md 登记
        assertEquals(32, AiMenuLayout.LEAVES.size(),
                "功能入口数量变化会直接影响用户对菜单的认知，必须同步 docs/system-portal/inventory.md");
    }

    @Test
    void 退役分组不得再被归位() {
        for (String retired : AiMenuLayout.RETIRED_GROUP_KEYS) {
            assertFalse(allPlacements().stream().anyMatch(p -> p.key().equals(retired)),
                    "已退役的历史分组不能再出现在归位清单：" + retired);
            assertFalse(GROUP_KEYS.contains(retired),
                    "已退役的历史分组不能再作为目标父级：" + retired);
        }
    }

    private static List<AiMenuLayout.Placement> allPlacements() {
        List<AiMenuLayout.Placement> all = new ArrayList<>(AiMenuLayout.SUB_GROUPS);
        all.addAll(AiMenuLayout.LEAVES);
        return all;
    }
}
