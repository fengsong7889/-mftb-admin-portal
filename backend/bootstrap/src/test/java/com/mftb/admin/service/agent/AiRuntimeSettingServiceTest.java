package com.mftb.admin.service.agent;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.entity.AiRuntimeSetting;
import com.mftb.admin.mapper.AiRuntimeSettingMapper;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 运行参数：未配置回落默认值；保存只接受已登记键并做范围校验。
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class AiRuntimeSettingServiceTest {

    @Mock private AiRuntimeSettingMapper settingMapper;
    @Mock private AiConfigAuditService auditService;
    @Mock private OperatorResolver operatorResolver;

    private AiRuntimeSettingService service;

    @BeforeEach
    void setUp() {
        service = new AiRuntimeSettingService(settingMapper, auditService, operatorResolver);
        when(operatorResolver.currentOperatorName()).thenReturn("alice");
    }

    @Test
    @DisplayName("未配置或值损坏时回落默认值")
    void fallsBackToDefault() {
        when(settingMapper.selectById(any())).thenReturn(null);
        assertEquals(50, service.getInt(AiRuntimeSettingService.MEMORY_MAX_COUNT, 50));
        assertTrue(service.getBool(AiRuntimeSettingService.MEMORY_AUTO_SUGGEST, true));

        AiRuntimeSetting broken = new AiRuntimeSetting();
        broken.setSettingKey(AiRuntimeSettingService.MEMORY_PROMPT_TOP);
        broken.setSettingValue("abc");
        when(settingMapper.selectById(AiRuntimeSettingService.MEMORY_PROMPT_TOP)).thenReturn(broken);
        assertEquals(10, service.getInt(AiRuntimeSettingService.MEMORY_PROMPT_TOP, 10));
    }

    @Test
    @DisplayName("保存拒绝未登记键与越界值")
    void rejectsUnknownKeyAndOutOfRange() {
        assertThrows(BusinessException.class, () -> service.save(Map.of("foo.bar", "1")));
        assertThrows(BusinessException.class,
                () -> service.save(Map.of(AiRuntimeSettingService.MEMORY_MAX_COUNT, "9999")));
        assertThrows(BusinessException.class,
                () -> service.save(Map.of(AiRuntimeSettingService.MEMORY_RETENTION_DAYS, "abc")));
        verify(settingMapper, never()).insert(any(AiRuntimeSetting.class));
    }

    @Test
    @DisplayName("首次保存插入默认行并写审计")
    void insertsOnFirstSave() {
        when(settingMapper.selectById(AiRuntimeSettingService.MEMORY_MAX_COUNT)).thenReturn(null);

        service.save(Map.of(AiRuntimeSettingService.MEMORY_MAX_COUNT, "80"));

        verify(settingMapper).insert(any(AiRuntimeSetting.class));
        verify(auditService).record(any(), any(), any(), any(), any());
    }

    @Test
    @DisplayName("列表合并默认值，未落库项也能看到系统默认")
    void listMergesDefaults() {
        when(settingMapper.selectList(any())).thenReturn(List.of());

        List<Map<String, Object>> rows = service.list();

        assertEquals(4, rows.size());
        assertFalse(rows.isEmpty());
        assertEquals("50", rows.get(0).get("defaultValue"));
    }
}
