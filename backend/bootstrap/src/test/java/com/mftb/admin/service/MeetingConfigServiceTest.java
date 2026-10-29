package com.mftb.admin.service;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.MeetingConstants;
import com.mftb.admin.dto.MeetingConfigDto;
import com.mftb.admin.entity.MeetingRoom;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.MeetingEventMapper;
import com.mftb.admin.mapper.MeetingRoomMapper;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 會議室专属规则写入口契约：null=继承、双版本乐观锁、合并后组合校验、写入并递增规则集版本。
 *
 * <p>这些是“能不能把一条错误规则存进库”的边界，必须由服务端锁定；
 * 前端表单只是体验，绕过 UI 直接调接口同样要被拒绝。
 */
class MeetingConfigServiceTest {

    private SysConfigService sysConfigService;
    private MeetingRuleService ruleService;
    private MeetingAccessGuard guard;
    private MeetingAuditRecorder auditRecorder;
    private MeetingRoomMapper roomMapper;
    private MeetingConfigService service;
    private MeetingRuleService.GlobalRule global;

    @BeforeAll
    static void initTableMetadata() {
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), ""), MeetingRoom.class);
    }

    @BeforeEach
    void setUp() {
        sysConfigService = mock(SysConfigService.class);
        ruleService = mock(MeetingRuleService.class);
        guard = mock(MeetingAccessGuard.class);
        auditRecorder = mock(MeetingAuditRecorder.class);
        roomMapper = mock(MeetingRoomMapper.class);
        service = new MeetingConfigService(sysConfigService, ruleService, guard, auditRecorder,
                mock(MeetingEventMapper.class), roomMapper);

        SysUser admin = new SysUser();
        admin.setId(1L);
        admin.setName("王行政");
        when(guard.currentUser()).thenReturn(admin);
        when(sysConfigService.getConfigValue(MeetingConstants.CFG_RULE_VERSION)).thenReturn("5");

        global = mock(MeetingRuleService.GlobalRule.class);
        when(ruleService.globalRule()).thenReturn(global);
        when(global.getAdvanceDays()).thenReturn(30);
        when(global.getMinLeadMinutes()).thenReturn(0);
        when(global.getGranularityMinutes()).thenReturn(15);
        when(global.getDefaultDurationMinutes()).thenReturn(60);
        when(global.getMinDurationMinutes()).thenReturn(15);
        when(global.getMaxDurationMinutes()).thenReturn(240);
        when(global.getRemindMinutes()).thenReturn(15);
        when(global.getCheckinOpenMinutes()).thenReturn(5);
        when(global.getReleaseAfterMinutes()).thenReturn(15);
        when(global.getCheckinRequired()).thenReturn(0);
        when(global.getBookableStart()).thenReturn(LocalTime.of(8, 0));
        when(global.getBookableEnd()).thenReturn(LocalTime.of(22, 0));

        MeetingRoom room = new MeetingRoom();
        room.setId(9L);
        room.setRoomNo("MR-9F-01");
        room.setRoomName("測試房");
        room.setVersion(3);
        when(roomMapper.selectById(9L)).thenReturn(room);
        when(roomMapper.update(isNull(), any())).thenReturn(1);
    }

    private static MeetingConfigDto.RoomRuleForm form(int expectConfigVersion, Integer start, Integer min, Integer max) {
        MeetingConfigDto.RoomRuleOverrides ov = new MeetingConfigDto.RoomRuleOverrides();
        ov.setMinDuration(min == null ? null : min);
        ov.setMaxDuration(max == null ? null : max);
        if (start != null) {
            ov.setBookableStart("09:00");
            ov.setBookableEnd("18:00");
        }
        MeetingConfigDto.RoomRuleForm form = new MeetingConfigDto.RoomRuleForm();
        form.setOverrides(ov);
        form.setChangeReason("測試調整");
        form.setExpectRoomVersion(3);
        form.setExpectConfigVersion(expectConfigVersion);
        return form;
    }

    @Test
    @DisplayName("通用规则已被他人改过（版本不一致）时拒绝保存，避免用过期的继承基准")
    void rejectsStaleConfigVersion() {
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.saveRoomRules(9L, form(4, null, null, null)));
        assertTrue(ex.getMessage().contains("通用規則已變更"), ex.getMessage());
        verify(roomMapper, never()).update(any(), any());
    }

    @Test
    @DisplayName("起止时间只填一个：合并不成立，必须先拒绝")
    void rejectsHalfWindow() {
        MeetingConfigDto.RoomRuleForm form = form(5, null, null, null);
        form.getOverrides().setBookableStart("09:00");
        BusinessException ex = assertThrows(BusinessException.class, () -> service.saveRoomRules(9L, form));
        assertTrue(ex.getMessage().contains("一起填寫"), ex.getMessage());
    }

    @Test
    @DisplayName("合并后最短>最长：跨字段倒挂在服务端也要拦")
    void rejectsInvalidMergedCombination() {
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.saveRoomRules(9L, form(5, null, 120, 60)));
        assertTrue(ex.getMessage().contains("最短"), ex.getMessage());
        verify(roomMapper, never()).update(any(), any());
    }

    @Test
    @DisplayName("合法覆盖：按房间版本条件更新，并把规则集版本 +1（同时落审计）")
    void savesWithVersionGateAndBumpsRuleVersion() {
        service.saveRoomRules(9L, form(5, 1, 30, 90));

        verify(roomMapper).update(isNull(), any(LambdaUpdateWrapper.class));
        verify(sysConfigService).updateConfigs(anyMap());
        verify(auditRecorder).recordBooking(isNull(), any(), any(), any(), any(), anyMap(), anyMap(), any(), isNull());
    }

    @Test
    @DisplayName("规则集版本缺失时按 0 处理，避免旧库无此键就不能保存")
    void missingRuleVersionFallsBackToZero() {
        when(sysConfigService.getConfigValue(MeetingConstants.CFG_RULE_VERSION)).thenReturn(null);
        // 版本按 0 解析：带 0 的期望版本应被接受
        service.saveRoomRules(9L, form(0, null, null, null));
        verify(roomMapper).update(isNull(), any(LambdaUpdateWrapper.class));
    }

    /* ---------- 通用规则保存 ---------- */

    private static MeetingConfigDto.RuleForm globalForm(int version, int minDuration) {
        MeetingConfigDto.RuleForm f = new MeetingConfigDto.RuleForm();
        f.setAdvanceDays(30);
        f.setMinLeadMinutes(0);
        f.setDefaultDuration(60);
        f.setMaxDuration(240);
        f.setMinDuration(minDuration);
        f.setGranularityMinutes(15);
        f.setBookableStart("08:00");
        f.setBookableEnd("22:00");
        f.setRemindMinutes(15);
        f.setCheckinOpenMinutes(5);
        f.setReleaseAfterMinutes(15);
        f.setCheckinRequired(0);
        f.setNoShowThreshold(3);
        f.setBlacklistDays(7);
        f.setChangeReason("調整通用規則");
        f.setVersion(version);
        return f;
    }

    @Test
    @DisplayName("通用规则保存：版本不一致（别人先改过）时拒绝，不覆盖")
    void globalSaveRejectsStaleVersion() {
        BusinessException ex = assertThrows(BusinessException.class, () -> service.save(globalForm(4, 15)));
        assertTrue(ex.getMessage().contains("已被他人修改"), ex.getMessage());
        verify(sysConfigService, never()).updateConfigs(anyMap());
    }

    @Test
    @DisplayName("通用规则保存：继承组合会冲突的房间存在时整体拒绝并列明房间")
    void globalSaveRejectsRoomConflict() {
        MeetingRoom conflictRoom = new MeetingRoom();
        conflictRoom.setId(9L);
        conflictRoom.setRoomNo("MR-9F-01");
        // 房间只覆盖了 maxDuration=30；通用 min/default=60 合并后 default>max，必须拒绝
        conflictRoom.setMaxDuration(30);
        when(roomMapper.selectList(any())).thenReturn(List.of(conflictRoom));

        BusinessException ex = assertThrows(BusinessException.class, () -> service.save(globalForm(5, 60)));
        assertTrue(ex.getMessage().contains("MR-9F-01"), ex.getMessage());
        verify(sysConfigService, never()).updateConfigs(anyMap());
    }

    @Test
    @DisplayName("通用规则保存：无冲突时写入并递增版本")
    void globalSavePersistsWhenNoConflict() {
        when(roomMapper.selectList(any())).thenReturn(List.of());
        when(sysConfigService.getConfigValues(anyList())).thenReturn(java.util.Map.of());

        service.save(globalForm(5, 15));

        verify(sysConfigService, org.mockito.Mockito.atLeastOnce()).updateConfigs(anyMap());
        verify(auditRecorder).recordBooking(isNull(), isNull(), any(), any(), any(), anyMap(), anyMap(), any(), isNull());
    }
}
