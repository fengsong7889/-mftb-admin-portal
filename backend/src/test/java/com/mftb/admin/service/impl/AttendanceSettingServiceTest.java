package com.mftb.admin.service.impl;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.AttendanceConstants;
import com.mftb.admin.dto.AttendanceSettingItem;
import com.mftb.admin.service.AttendanceSettingService;
import com.mftb.admin.service.SysConfigService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 假勤设置测试。
 * <p>
 * 钉住两条产品口径：只读说明项绝不能被写入（改了没人读=假闭环，比没有这个页面更危险），
 * 以及可编辑项必须落在引擎真读的 sys_config key 上。
 */
class AttendanceSettingServiceTest {

    @Mock
    private SysConfigService sysConfigService;

    private AttendanceSettingService service;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        service = new AttendanceSettingServiceImpl(sysConfigService);
    }

    @Test
    @DisplayName("只读口径说明与可编辑参数分开，未配置时可编辑项回落默认值")
    void listSeparatesReadOnlyFromEditable() {
        when(sysConfigService.getConfigValues(org.mockito.ArgumentMatchers.anyCollection())).thenReturn(Map.of());

        List<AttendanceSettingItem> items = service.list();

        AttendanceSettingItem grain = find(items, "grain");
        assertFalse(grain.isEditable(), "计算粒度是代码口径，做成可编辑就是假闭环");
        assertFalse(find(items, "grace").isEditable(), "宽限真值在考勤组，本页不得提供全局覆盖");
        assertFalse(find(items, "syncTime").isEditable(), "cron 属发布配置，不在业务界面改");

        AttendanceSettingItem threshold = find(items, "otThreshold");
        assertTrue(threshold.isEditable());
        assertEquals(AttendanceConstants.CFG_OVERTIME_THRESHOLD_MIN, threshold.getConfigKey());
        assertEquals(String.valueOf(AttendanceConstants.DEFAULT_OVERTIME_THRESHOLD_MIN), threshold.getValue(),
                "未配置时必须展示引擎真正使用的默认值，不能显示空");
        assertEquals(AttendanceConstants.CFG_OVERTIME_STEP_MIN, find(items, "otStep").getConfigKey());
        assertEquals(AttendanceConstants.CFG_FREEZE_DAY, find(items, "freezeDay").getConfigKey());
    }

    @Test
    @DisplayName("已配置的参数按 sys_config 回显")
    void listShowsConfiguredValues() {
        when(sysConfigService.getConfigValues(org.mockito.ArgumentMatchers.anyCollection())).thenReturn(Map.of(
                AttendanceConstants.CFG_OVERTIME_THRESHOLD_MIN, "60",
                AttendanceConstants.CFG_FREEZE_DAY, "5"));

        List<AttendanceSettingItem> items = service.list();

        assertEquals("60", find(items, "otThreshold").getValue());
        assertEquals("5", find(items, "freezeDay").getValue());
        assertEquals(String.valueOf(AttendanceConstants.DEFAULT_OVERTIME_STEP_MIN), find(items, "otStep").getValue());
    }

    @Test
    @DisplayName("提交只读项或未知 key 整体拒绝，不做部分成功")
    void updateRejectsReadOnlyAndUnknownKeys() {
        assertThrows(BusinessException.class, () -> service.update(Map.of("grain", "按小時")));
        assertThrows(BusinessException.class, () -> service.update(Map.of("notAKey", "1")));
        assertThrows(BusinessException.class, () -> service.update(Map.of("otThreshold", "45", "grain", "按小時")),
                "混入只读项时整批拒绝，否则用户以为两项都生效了");
        assertThrows(BusinessException.class, () -> service.update(Map.of()));
        assertThrows(BusinessException.class, () -> service.update(null));
        verify(sysConfigService, never()).updateConfigs(anyMap());
    }

    @Test
    @DisplayName("越界与非整数值在写入前拒绝，不让引擎静默回退默认值")
    void updateValidatesRange() {
        assertThrows(BusinessException.class, () -> service.update(Map.of("otThreshold", "9999")));
        assertThrows(BusinessException.class, () -> service.update(Map.of("otThreshold", "-1")));
        assertThrows(BusinessException.class, () -> service.update(Map.of("otStep", "abc")));
        assertThrows(BusinessException.class, () -> service.update(Map.of("freezeDay", "0")));
        assertThrows(BusinessException.class, () -> service.update(Map.of("freezeDay", "31")),
                "冻结日超过 28 会在短月不存在");
        assertThrows(BusinessException.class, () -> service.update(Map.of("otThreshold", "  ")));
        verify(sysConfigService, never()).updateConfigs(anyMap());
    }

    @Test
    @DisplayName("合法提交写入 sys_config 并要求界面提示重算")
    void updateWritesConfigAndFlagsRecalculate() {
        Map<String, Object> result = service.update(Map.of("otThreshold", "45", "otStep", "60"));

        ArgumentCaptor<Map<String, String>> captor = ArgumentCaptor.forClass(Map.class);
        verify(sysConfigService).updateConfigs(captor.capture());
        assertEquals("45", captor.getValue().get(AttendanceConstants.CFG_OVERTIME_THRESHOLD_MIN));
        assertEquals("60", captor.getValue().get(AttendanceConstants.CFG_OVERTIME_STEP_MIN));
        assertEquals(2, result.get("updated"));
        assertEquals(Boolean.TRUE, result.get("needRecalculate"),
                "参数改了但历史结论不会自动变，必须让界面把这句话讲清楚");
    }

    private AttendanceSettingItem find(List<AttendanceSettingItem> items, String key) {
        return items.stream().filter(item -> key.equals(item.getKey())).findFirst()
                .orElseThrow(() -> new AssertionError("缺少设置项: " + key));
    }
}
