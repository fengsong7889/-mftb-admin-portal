package com.mftb.admin.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
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
 */
class RdmMenuActionSyncTest {

    private JdbcTemplate jdbc;
    private RdmMenuInitializer initializer;

    @BeforeEach
    void setUp() {
        jdbc = mock(JdbcTemplate.class);
        initializer = new RdmMenuInitializer(jdbc, mock(SchemaVersionTracker.class),
                mock(com.mftb.admin.service.PermissionService.class), new ObjectMapper());
    }

    private void stubCurrentActions(String json) {
        when(jdbc.queryForList(anyString(), eq(String.class), anyString())).thenReturn(List.of(json));
    }

    @SuppressWarnings("unchecked")
    private List<String> captureWrittenActions() {
        ArgumentCaptor<String> captor = ArgumentCaptor.forClass(String.class);
        verify(jdbc).update(anyString(), captor.capture(), eq("rdm-requirement"));
        try {
            return new ObjectMapper().readValue(captor.getValue(), List.class);
        } catch (Exception e) {
            throw new AssertionError("写入的不是合法动作 JSON: " + captor.getValue(), e);
        }
    }

    @Test
    @DisplayName("窄集被补齐，且不丢原有动作")
    void narrowSetIsExpandedWithoutLosingExisting() {
        // 本环境的真实情况：create/edit 早已被摘掉，只剩 view/export
        stubCurrentActions("[\"view\",\"export\"]");

        ReflectionTestUtils.invokeMethod(initializer, "syncSeedActions");

        List<String> written = captureWrittenActions();
        // 种子 LIST_ACTIONS 的完整集，且顺序与授权字典一致（顺序漂了每天都会重复写库）
        assertEquals(List.of("view", "create", "edit", "export", "view_all", "dispatch", "contribute"), written);
    }

    @Test
    @DisplayName("只并集追加：管理员额外给的 delete 不会被刷掉")
    void extraCustomActionIsPreserved() {
        stubCurrentActions("[\"view\",\"create\",\"edit\",\"export\",\"delete\"]");

        ReflectionTestUtils.invokeMethod(initializer, "syncSeedActions");

        List<String> written = captureWrittenActions();
        assertTrue(written.contains("delete"), "并集追加不得删减现有动作: " + written);
        assertTrue(written.containsAll(List.of("view_all", "dispatch", "contribute")), written.toString());
    }

    @Test
    @DisplayName("已覆盖种子动作时零写入（每次启动重放幂等）")
    void skipsWriteWhenAlreadyCoversSeed() {
        stubCurrentActions("[\"view\",\"create\",\"edit\",\"export\",\"view_all\",\"dispatch\",\"contribute\"]");

        ReflectionTestUtils.invokeMethod(initializer, "syncSeedActions");

        verify(jdbc, never()).update(anyString(), org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());
    }

    @Test
    @DisplayName("菜单行不存在时抛出，不把没对齐当成已对齐")
    void failsWhenRowMissing() {
        when(jdbc.queryForList(anyString(), eq(String.class), anyString())).thenReturn(List.of());

        IllegalStateException ex = assertThrows(IllegalStateException.class,
                () -> ReflectionTestUtils.invokeMethod(initializer, "syncSeedActions"));
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
