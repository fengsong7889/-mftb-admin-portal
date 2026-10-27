package com.mftb.admin.config;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 需求入口锚点收敛的「动作归宿映射」测试。
 *
 * <p>这批断言是「平移 + 切注解 + 软删」原子批次的地基：真正搬授权之前，先把
 * rdm-intake 每个动作的去向钉成单一事实源。之所以值得单独测，是因为这一步的失败模式
 * 全是静默的 —— 漏配一个动作不会报错，只会让持有它的人在退役当天悄悄失去能力。
 *
 * <p>钉死四件事：
 * <ol>
 *   <li>改写正确：intake:view → requirement:view_all，intake:edit → requirement:dispatch；</li>
 *   <li>不扩权：目标动作集只来自映射，绝不把源动作原样带上（同名搬运会把 intake:view
 *       扫到人人都能看的 requirement:view 宽权限上）；</li>
 *   <li>不降权：种子声明给 rdm-intake 的每个动作都必须有归宿，漏一个就启动失败；</li>
 *   <li>不指向幽灵：目标菜单 key 必须在菜单种子里存在，目标动作必须在授权字典里。</li>
 * </ol>
 */
class RdmAnchorRemapTest {

    private static final String INTAKE = "rdm-intake";
    private static final String REQUIREMENT = "rdm-requirement";
    private static final String ITERATION = "rdm-delivery-iteration";

    private static Set<String> setOf(String... values) {
        return new LinkedHashSet<>(Arrays.asList(values));
    }

    /** 读私有静态常量，避免测试自己抄一份字面量而与种子漂移 */
    @SuppressWarnings("unchecked")
    private static <T> T seed(String fieldName) {
        return (T) ReflectionTestUtils.getField(RdmMenuInitializer.class, fieldName);
    }

    @Test
    @DisplayName("全量查看权与分配权各自改写到新锚点，不会互相串")
    void viewAndEditRewriteToDistinctAnchors() {
        Map<String, Set<String>> fromView = RdmMenuInitializer.remapAnchorGrants(INTAKE, setOf("view"));
        assertEquals(Map.of(REQUIREMENT, setOf("view_all")), fromView);

        Map<String, Set<String>> fromEdit = RdmMenuInitializer.remapAnchorGrants(INTAKE, setOf("edit"));
        assertEquals(Map.of(REQUIREMENT, setOf("dispatch")), fromEdit);
    }

    /**
     * 这条是本表存在的理由：直接把 intake:view 平移到 rdm-requirement 上，
     * 接住它的是「人人可看」的宽权限动作 view，等于全量可见权被抹平成普通查看权；
     * 反过来若把 view 扫成 view 之外的动作就是扩权。映射必须精确到 view_all。
     */
    @Test
    @DisplayName("不扩权：目标只拿到映射声明的动作，不会顺带拿到源动作名")
    void remapNeverCarriesSourceActionNameAlong() {
        Set<String> granted = RdmMenuInitializer.remapAnchorGrants(INTAKE, setOf("view")).get(REQUIREMENT);
        assertTrue(granted.contains("view_all"));
        assertFalse(granted.contains("view"), "intake:view 不能被原样搬成 requirement:view，那是宽权限动作");
        assertFalse(granted.contains("dispatch"), "可见权不能推导出分配权");
    }

    @Test
    @DisplayName("沟通权与提交权分开：intake:create 落到 contribute，不是 create")
    void contributeDoesNotBecomeCreate() {
        Set<String> granted = RdmMenuInitializer.remapAnchorGrants(INTAKE, setOf("create")).get(REQUIREMENT);
        assertEquals(setOf("contribute"), granted);
    }

    @Test
    @DisplayName("删除迭代的归宿是迭代菜单，不是需求清单")
    void deleteLandsOnIterationMenu() {
        assertEquals(Map.of(ITERATION, setOf("delete")),
                RdmMenuInitializer.remapAnchorGrants(INTAKE, setOf("delete")));
    }

    @Test
    @DisplayName("并集分流：五个动作一次搬，按目标菜单分组且动作互不污染")
    void splitsUnionByTargetMenu() {
        Map<String, Set<String>> result = RdmMenuInitializer.remapAnchorGrants(
                INTAKE, new TreeSet<>(setOf("view", "edit", "create", "export", "delete")));
        assertEquals(2, result.size());
        assertEquals(setOf("view_all", "dispatch", "contribute", "export"), result.get(REQUIREMENT));
        assertEquals(setOf("delete"), result.get(ITERATION));
    }

    /**
     * 覆盖率断言：种子登记给 rdm-intake 的每一个可授动作都必须有归宿。
     * <p>读 {@code FULL_ACTIONS} 常量而不是测试里抄一份，管理员日后往种子里加动作时这条会跟着失败。
     */
    @Test
    @DisplayName("不降权：种子给 rdm-intake 的全部动作都有归宿")
    void everySeedDeclaredIntakeActionHasDestination() {
        String fullActions = seed("FULL_ACTIONS");
        Set<String> declared = new LinkedHashSet<>(Arrays.asList(
                fullActions.replaceAll("[\\[\\]\"]", "").split(",")));
        // 先确认这条断言测的还是那张表：FULL_ACTIONS 至少覆盖 view/create/edit/delete/export
        assertTrue(declared.containsAll(setOf("view", "create", "edit", "delete", "export")), declared.toString());

        Map<String, Set<String>> result = RdmMenuInitializer.remapAnchorGrants(INTAKE, declared);
        Set<String> covered = new LinkedHashSet<>();
        result.values().forEach(covered::addAll);
        assertEquals(declared.size(), covered.size(),
                "有动作没归宿：映射结果 " + result + "，声明集 " + declared);
    }

    @Test
    @DisplayName("未知动作抛出：不能把没归宿的能力当成已迁移")
    void unknownActionFailsLoud() {
        IllegalStateException ex = assertThrows(IllegalStateException.class,
                () -> RdmMenuInitializer.remapAnchorGrants(INTAKE, setOf("view", "import")));
        assertTrue(ex.getMessage().contains("import"), ex.getMessage());
    }

    @Test
    @DisplayName("空动作集不产生任何写入目标（重放与无授权角色安全空转）")
    void emptyActionsProduceNoTargets() {
        assertTrue(RdmMenuInitializer.remapAnchorGrants(INTAKE, Set.of()).isEmpty());
    }

    /**
     * 映射的两侧都必须真实存在，否则退役当天才会发现授权写进了幽灵菜单或勾不到的动作。
     * <p>字典取自同一个类的 {@code ACTION_ORDER} 与 {@code MENUS}，避免测试另建一份标准。
     */
    @Test
    @DisplayName("目标菜单与目标动作都必须在种子/字典内")
    void targetsMustExistInSeedAndActionDictionary() {
        List<String> actionOrder = seed("ACTION_ORDER");
        String[][] menus = seed("MENUS");
        Set<String> menuKeys = new LinkedHashSet<>();
        for (String[] menu : menus) {
            menuKeys.add(menu[0]);
        }
        String[][] remap = seed("ANCHOR_REMAP");
        for (String[] row : remap) {
            assertTrue(menuKeys.contains(row[0]), "映射源菜单不在种子里: " + row[0]);
            assertTrue(menuKeys.contains(row[2]), "映射目标菜单不在种子里（会写成幽灵授权）: " + row[2]);
            assertTrue(actionOrder.contains(row[1]), "映射源动作未登记在授权字典: " + row[1]);
            assertTrue(actionOrder.contains(row[3]), "映射目标动作未登记在授权字典（授权中心勾不到）: " + row[3]);
            assertFalse(row[0].equals(row[2]) && row[1].equals(row[3]),
                    "同菜单同动作的恒等映射不该出现在改写表里（那是 RETIRED_MENU_MERGE 的职责）: "
                            + Arrays.toString(row));
        }
    }
}
