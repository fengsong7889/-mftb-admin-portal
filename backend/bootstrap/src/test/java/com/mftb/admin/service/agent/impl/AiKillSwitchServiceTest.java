package com.mftb.admin.service.agent.impl;

import com.mftb.admin.service.SysConfigService;
import com.mftb.admin.service.agent.AiKillSwitchService.Status;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.when;

/** V0 §八 V0-7：AI 紧急熔断开关的读写、缓存与状态查询 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class AiKillSwitchServiceTest {

    @Mock private SysConfigService sysConfigService;

    @InjectMocks private AiKillSwitchServiceImpl service;

    @Test
    void defaultsToFalseWhenConfigMissing() {
        when(sysConfigService.getConfigValue("ai_kill_switch")).thenReturn(null);
        assertFalse(service.isEngaged());
    }

    @Test
    void readsTrueFlagIgnoringCase() {
        when(sysConfigService.getConfigValue("ai_kill_switch")).thenReturn(" TRUE ");
        assertTrue(service.isEngaged());
    }

    @Test
    void toggleUpdatesCacheAndPersistsFourKeys() {
        Map<String, String> store = new HashMap<>();
        doAnswer(inv -> { store.put(inv.getArgument(0), inv.getArgument(1)); return null; })
                .when(sysConfigService).updateConfig(anyString(), anyString());
        when(sysConfigService.getConfigValue(anyString()))
                .thenAnswer(inv -> store.get(inv.<String>getArgument(0)));

        service.toggle(true, "admin", "生产事故演练");

        assertEquals("true", store.get("ai_kill_switch"));
        assertEquals("admin", store.get("ai_kill_switch_operator"));
        assertEquals("生产事故演练", store.get("ai_kill_switch_reason"));
        assertTrue(service.isEngaged());

        service.toggle(false, "admin", "恢复");
        assertFalse(service.isEngaged());
        assertEquals("false", store.get("ai_kill_switch"));
    }

    @Test
    void currentReturnsDashForMissingMetadata() {
        when(sysConfigService.getConfigValue("ai_kill_switch")).thenReturn("true");
        when(sysConfigService.getConfigValue("ai_kill_switch_operator")).thenReturn(null);
        when(sysConfigService.getConfigValue("ai_kill_switch_reason")).thenReturn("");
        Status st = service.current();
        assertTrue(st.engaged());
        assertEquals("-", st.operator());
        assertEquals("-", st.reason());
    }
}
