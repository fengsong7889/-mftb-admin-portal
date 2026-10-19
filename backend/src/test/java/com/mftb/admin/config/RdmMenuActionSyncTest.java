package com.mftb.admin.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.constant.RdmConstants;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 可授动作集对齐（{@code syncSeedActions}）测试。
 *
 * <p>这一步的失败模式都是静默的：动作没落到 sys_menu.actions 上不会报错，只会让授权中心
 * 勾不到那一项；等到退役旧锚点时，本该接住能力的人拿不到授权，表现为「按钮不见了」。
 * 所以这里钉四条：
 * <ol>
 *   <li>只并集追加 —— 管理员在该菜单额外自定义的动作必须保留（不能被刷掉）；</li>
 *   <li>写入顺序稳定 —— 按 {@code ACTION_ORDER} 重组，否则每次重放都被判为「有变更」而反复写库；</li>
 *   <li>已覆盖时零写入 —— 保证每次启动重放幂等；</li>
 *   <li>查不到行/白名单写错时抛，不能把「没对齐」当成「已对齐」。</li>
 * </ol>
 *
 * <p>v3.17 起白名单有两个菜单（rdm-requirement、rdm-dashboard-project），所以桩必须**按菜单 key
 * 分别给值**：一个笼统的 stub 会让两个迭代都拿到同一份「当前动作集」，谁被写、写了几次都分不清，
 * 正好是这条迁移最不该含糊的地方（多写 = 每次启动重复刷库，漏写 = 能力勾不到）。
 */
class RdmMenuActionSyncTest {

    /** rdm-requirement 的种子集（LIST_ACTIONS），顺序按 ACTION_ORDER */
    private static final List<String> REQUIREMENT_SEED =
            List.of("view", "create", "edit", "export", "view_all", "dispatch", "contribute");
    /** rdm-dashboard-project 的种子集（PROJECT_ACTIONS） */
    private static final List<String> PROJECT_SEED = List.of("view", "create", "edit", "export");

    private JdbcTemplate jdbc;
    private RdmMenuInitializer initializer;

    @BeforeEach
    void setUp() {
        jdbc = mock(JdbcTemplate.class);
        initializer = new RdmMenuInitializer(jdbc, mock(SchemaVersionTracker.class),
                mock(com.mftb.admin.service.PermissionService.class), new ObjectMapper());
    }

    /** 按菜单 key 分发「当前可授集」：白名单里每个菜单各查各的，重放时才看得出谁还需要写 */
    private void stubActionsPerMenu(String requirementJson, String projectJson) {
        when(jdbc.queryForList(anyString(), eq(String.class), anyString())).thenAnswer(invocation -> {
            String menuKey = invocation.getArgument(2);
            return List.of(RdmConstants.MENU_DASHBOARD_PROJECT.equals(menuKey) ? projectJson : requirementJson);
        });
    }

    private List<String> parse(String json) {
        try {
            return new ObjectMapper().readValue(json, List.class);
        } catch (Exception e) {
            throw new AssertionError("写入的不是合法动作 JSON: " + json, e);
        }
    }

    /** 取某个菜单本次被写入的动作集；写了 0 次或多于 1 次都算失败 */
    @SuppressWarnings("unchecked")
    private List<String> captureWrittenActions(String menuKey) {
        ArgumentCaptor<String> actionsCaptor = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> keyCaptor = ArgumentCaptor.forClass(String.class);
        verify(jdbc, atLeastOnce()).update(anyString(), actionsCaptor.capture(), keyCaptor.capture());
        List<String> matched = new ArrayList<>();
        List<String> keys = keyCaptor.getAllValues();
        for (int i = 0; i < keys.size(); i++) {
            if (menuKey.equals(keys.get(i))) {
                matched.add(actionsCaptor.getAllValues().get(i));
            }
        }
        assertEquals(1, matched.size(), menuKey + " 本次写入次数应为 1，实际 " + matched.size());
        return parse(matched.get(0));
    }

    @Test
    @DisplayName("窄集被补齐，且不丢原有动作")
    void narrowSetIsExpandedWithoutLosingExisting() {
        // 本环境的真实情况：create/edit 早已被摘掉，只剩 view/export（项目菜单已就位，不参与本轮写入）
        stubActionsPerMenu("[\"view\",\"export\"]", "[\"view\",\"create\",\"edit\",\"export\"]");

        ReflectionTestUtils.invokeMethod(initializer, "syncSeedActions");

        List<String> written = captureWrittenActions(RdmConstants.MENU_REQUIREMENT);
        // 种子 LIST_ACTIONS 的完整集，且顺序与授权字典一致（顺序漂了每天都会重复写库）
        assertEquals(REQUIREMENT_SEED, written);
    }

    @Test
    @DisplayName("項目總覽补齐 create/edit：暂停/新增项目的写权锚点")
    void projectActionsExpandedToSeed() {
        stubActionsPerMenu("[\"view\",\"create\",\"edit\",\"export\",\"view_all\",\"dispatch\",\"contribute\"]",
                "[\"view\",\"export\"]");

        ReflectionTestUtils.invokeMethod(initializer, "syncSeedActions");

        // v3.17 之前这张表没有 rdm-dashboard-project，非超管点「暫停項目」只能拿到 403
        assertEquals(PROJECT_SEED, captureWrittenActions(RdmConstants.MENU_DASHBOARD_PROJECT));
    }

    @Test
    @DisplayName("只并集追加：管理员额外给的 delete 不会被刷掉")
    void extraCustomActionIsPreserved() {
        // 缺 view_all/dispatch/contribute → 需要写；但已带管理员额外给的 delete → 必须原样保留
        stubActionsPerMenu("[\"view\",\"create\",\"edit\",\"export\",\"delete\"]",
                "[\"view\",\"create\",\"edit\",\"export\"]");

        ReflectionTestUtils.invokeMethod(initializer, "syncSeedActions");

        List<String> written = captureWrittenActions(RdmConstants.MENU_REQUIREMENT);
        assertTrue(written.contains("delete"), "并集追加不得删减现有动作: " + written);
        assertTrue(written.containsAll(REQUIREMENT_SEED), written.toString());
    }

    @Test
    @DisplayName("已覆盖种子动作时零写入（每次启动重放幂等）")
    void skipsWriteWhenAlreadyCoversSeed() {
        stubActionsPerMenu("[\"view\",\"create\",\"edit\",\"export\",\"view_all\",\"dispatch\",\"contribute\"]",
                "[\"view\",\"create\",\"edit\",\"export\"]");

        ReflectionTestUtils.invokeMethod(initializer, "syncSeedActions");

        verify(jdbc, never()).update(anyString(), any(), any());
    }

    @Test
    @DisplayName("菜单行不存在时抛出，不把没对齐当成已对齐")
    void failsWhenRowMissing() {
        when(jdbc.queryForList(anyString(), eq(String.class), anyString())).thenReturn(List.of());

        IllegalStateException ex = assertThrows(IllegalStateException.class,
                () -> ReflectionTestUtils.invokeMethod(initializer, "syncSeedActions"));
        // 白名单第一项先被处理：抛错必须点名是哪个菜单，否则排障只能靠猜
        assertTrue(ex.getMessage().contains("rdm-requirement"), ex.getMessage());
    }

    @Test
    @DisplayName("白名单写错菜单 key 时抛出，不静默空转")
    void failsWhenMenuNotInSeed() {
        IllegalStateException ex = assertThrows(IllegalStateException.class,
                () -> ReflectionTestUtils.invokeMethod(initializer, "seedActionsOf", "rdm-not-exist"));
        assertTrue(ex.getMessage().contains("rdm-not-exist"), ex.getMessage());
    }
}
