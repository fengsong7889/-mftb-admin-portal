package com.mftb.admin.service;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.RdmConfigVO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.startsWith;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * RdmConfigService 的校验失败必须是 {@link BusinessException}。
 *
 * <p>为什么值得单独钉住：这些校验原先抛 {@code IllegalArgumentException}，会落到
 * GlobalExceptionHandler 的兜底分支，前端只看到「系統繁忙, 請稍後重試」。
 * 管理员在「狀態與流轉」页停用状态时，真实原因是「尚有 N 個需求處於該狀態」，
 * 被兜底文案吃掉后既不知道下一步该做什么，也看不出是配置问题还是系统故障
 * （深度测试时该页开关切换 100% 失败却无任何可读提示，即为此因）。
 *
 * <p>纯 Mockito 离线单测，不连库。
 */
class RdmConfigServiceValidationTest {

    private JdbcTemplate jdbcTemplate;
    private RdmConfigService service;

    @BeforeEach
    void setUp() {
        jdbcTemplate = mock(JdbcTemplate.class);
        service = new RdmConfigService(jdbcTemplate);
    }

    @Test
    @DisplayName("停用状态时仍有需求占用 → 抛业务异常且带占用数量，绝不落库")
    void disableOccupiedStatusThrowsBusinessExceptionWithCount() {
        when(jdbcTemplate.queryForObject(anyString(), any(Class.class), any(Object[].class))).thenReturn(2);

        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.setStatusEnabled("evaluating", false, "Bee(MF00001)"));

        assertTrue(ex.getMessage().contains("尚有 2 個需求"), "必须把占用数量告诉管理员：" + ex.getMessage());
        assertTrue(ex.getMessage().contains("不能停用"), ex.getMessage());
        verify(jdbcTemplate, never()).update(anyString(), any(Object[].class));
    }

    @Test
    @DisplayName("状态编码为空 → 业务异常（不是系统繁忙）")
    void blankStatusCodeThrowsBusinessException() {
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.setStatusEnabled("  ", true, "Bee(MF00001)"));
        assertTrue(ex.getMessage().contains("狀態編碼不能為空"), ex.getMessage());
        verify(jdbcTemplate, never()).update(anyString(), any(Object[].class));
    }

    @Test
    @DisplayName("SLA 预警阈值不小于标准时效 → 业务异常（预警晚于逾期等于没有预警）")
    void warnHoursNotLessThanSlaHoursThrowsBusinessException() {
        RdmConfigVO.Sla sla = new RdmConfigVO.Sla();
        sla.setStatusCode("developing");
        sla.setSlaHours(24);
        sla.setWarnHours(24);
        sla.setEscalateRole("PM");

        BusinessException ex = assertThrows(BusinessException.class, () -> service.saveSla(sla));
        assertTrue(ex.getMessage().contains("預警閾值"), ex.getMessage());
        verify(jdbcTemplate, never()).update(anyString(), any(Object[].class));
    }

    @Test
    @DisplayName("分发矩阵缺 scopeValue → 业务异常（后端按编码精确匹配，只填显示名的规则永远匹不上）")
    void routingWithoutScopeValueThrowsBusinessException() {
        RdmConfigVO.Routing routing = new RdmConfigVO.Routing();
        routing.setScopeType("SYSTEM");
        routing.setScopeValue("");
        routing.setScopeName("廣告推薦系統");
        routing.setPmUserId(51L);
        routing.setPmName("周忠浩");

        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.saveRouting(routing, "Bee(MF00001)"));
        assertTrue(ex.getMessage().contains("必填"), ex.getMessage());
        verify(jdbcTemplate, never()).update(anyString(), any(Object[].class));
    }

    @Test
    @DisplayName("流转规则不存在 → 业务异常并带上 id，便于定位是哪条规则被删")
    void transitionRuleMissingThrowsBusinessException() {
        doReturn(0).when(jdbcTemplate).update(anyString(), eq(1), anyString(), eq(999L));

        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.setTransitionEnabled(999L, true, "Bee(MF00001)"));
        assertTrue(ex.getMessage().contains("999"), ex.getMessage());
    }

    /* ==================== 分发矩阵：enabled 语义与真删除 ==================== */

    /** 构造一条合法的分配规则（只关心 enabled/id 两个变量） */
    private RdmConfigVO.Routing validRouting(Long id, Boolean enabled) {
        RdmConfigVO.Routing r = new RdmConfigVO.Routing();
        r.setId(id);
        r.setScopeType("MENU");
        r.setScopeValue("rdm-requirement");
        r.setScopeName("需求跟進清單");
        r.setPmUserId(51L);
        r.setPmName("周忠浩");
        r.setLoadCapacity(8);
        r.setPriority(10);
        r.setEnabled(enabled);
        return r;
    }

    @Test
    @DisplayName("新增时勾停用 → INSERT 必须落 status=0（旧写法写死 1，界面开关是假的）")
    void insertHonoursDisabledFlag() {
        ArgumentCaptor<Object[]> args = ArgumentCaptor.forClass(Object[].class);

        service.saveRouting(validRouting(null, false), "Bee(MF00001)");

        verify(jdbcTemplate).update(startsWith("INSERT INTO rdm_routing_rule"), args.capture());
        // 参数顺序：scope_type(0), scope_value(1), scope_name(2), pm_user_id(3), pm_name(4),
        // backup_pm_user_id(5), backup_pm_name(6), load_capacity(7), priority(8), status(9)
        Object[] a = args.getValue();
        assertEquals(0, a[9], "enabled=false 必须落 status=0，实际=" + a[9]);
    }

    @Test
    @DisplayName("新增未表态（enabled=null）→ 按啟用落库，保持与原默认一致")
    void insertDefaultsToEnabledWhenFlagMissing() {
        ArgumentCaptor<Object[]> args = ArgumentCaptor.forClass(Object[].class);

        service.saveRouting(validRouting(null, null), "Bee(MF00001)");

        verify(jdbcTemplate).update(startsWith("INSERT INTO rdm_routing_rule"), args.capture());
        assertEquals(1, args.getValue()[9]);
    }

    @Test
    @DisplayName("更新时 enabled=null → SET 子句不能包含 status（否则只想改容量会静默停用）")
    void updateWithNullEnabledDoesNotTouchStatus() {
        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        when(jdbcTemplate.update(anyString(), any(Object[].class))).thenReturn(1);

        service.saveRouting(validRouting(7L, null), "Bee(MF00001)");

        verify(jdbcTemplate).update(sql.capture(), any(Object[].class));
        assertFalse(sql.getValue().contains("status = ?"), "不应重写 status：" + sql.getValue());
    }

    @Test
    @DisplayName("更新影响 0 行（行已被并发移除）→ 业务异常，不能回「已保存」")
    void updateZeroRowsThrowsBusinessException() {
        when(jdbcTemplate.update(anyString(), any(Object[].class))).thenReturn(0);

        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.saveRouting(validRouting(999L, true), "Bee(MF00001)"));
        assertTrue(ex.getMessage().contains("刷新"), ex.getMessage());
    }

    @Test
    @DisplayName("移除规则 → 走逻辑删且带 updated_by；刷新后不应复活")
    void deleteRoutingSoftDeletes() {
        when(jdbcTemplate.update(anyString(), any(Object[].class))).thenReturn(1);
        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);

        service.deleteRouting(3L, "Bee(MF00001)");

        verify(jdbcTemplate).update(sql.capture(), eq("Bee(MF00001)"), eq(3L));
        assertTrue(sql.getValue().contains("deleted = 1"), sql.getValue());
        assertTrue(sql.getValue().contains("updated_by = ?"), "必须留操作人签名：" + sql.getValue());
    }

    @Test
    @DisplayName("移除不存在的规则 → 业务异常（不能让前端拿到 200 以为删掉了）")
    void deleteMissingRoutingThrowsBusinessException() {
        when(jdbcTemplate.update(anyString(), any(Object[].class))).thenReturn(0);

        BusinessException ex = assertThrows(BusinessException.class, () -> service.deleteRouting(888L, "Bee(MF00001)"));
        assertTrue(ex.getMessage().contains("不存在或已被移除"), ex.getMessage());
    }

    @Test
    @DisplayName("移除未选行（id=null）→ 业务异常且不落库")
    void deleteRoutingWithoutIdThrowsBusinessException() {
        BusinessException ex = assertThrows(BusinessException.class, () -> service.deleteRouting(null, "Bee(MF00001)"));
        assertTrue(ex.getMessage().contains("請選擇"), ex.getMessage());
        verify(jdbcTemplate, never()).update(anyString(), any(Object[].class));
    }
}
