package com.mftb.admin.service.impl;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.AttendancePunchImportRow;
import com.mftb.admin.entity.AttGroup;
import com.mftb.admin.entity.AttGroupMember;
import com.mftb.admin.entity.AttPunchLog;
import com.mftb.admin.entity.AttSchedule;
import com.mftb.admin.entity.AttShift;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.AttGroupMapper;
import com.mftb.admin.mapper.AttGroupMemberMapper;
import com.mftb.admin.mapper.AttPunchLogMapper;
import com.mftb.admin.mapper.AttScheduleMapper;
import com.mftb.admin.mapper.AttShiftMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.AttendancePunchService;
import com.mftb.admin.service.AttendanceSyncService;
import com.mftb.admin.service.DingTalkAppService;
import com.mftb.admin.service.SysConfigService;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 打卡导入与钉钉同步测试。
 * <p>
 * 重点锁两件事：导入是「逐行校验 + 幂等入库」而不是整批回滚（一行坏不能拖垮整批），
 * 以及同步只认显式的钉钉账号绑定——按姓名猜身份会把别人的考勤算到他头上。
 * <p>
 * 放在 service.impl 包里是为了能直接验证 {@code resolveWorkDate} 的跨夜班归属：
 * 这条规则错一天，整月汇总就错一天，不能只靠公开接口间接覆盖。
 */
class AttendancePunchImportTest {

    @Mock
    private AttPunchLogMapper punchMapper;
    @Mock
    private SysUserMapper sysUserMapper;
    @Mock
    private AttGroupMapper groupMapper;
    @Mock
    private AttGroupMemberMapper memberMapper;
    @Mock
    private AttScheduleMapper scheduleMapper;
    @Mock
    private AttShiftMapper shiftMapper;
    @Mock
    private OperatorResolver operatorResolver;
    @Mock
    private DingTalkAppService dingTalkAppService;
    @Mock
    private SysConfigService sysConfigService;

    private AttendancePunchService punchService;
    private AttendanceSyncService syncService;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        punchService = new AttendancePunchServiceImpl(punchMapper, sysUserMapper, groupMapper, memberMapper,
                scheduleMapper, shiftMapper, operatorResolver);
        syncService = new AttendanceSyncServiceImpl(dingTalkAppService, sysConfigService, sysUserMapper,
                groupMapper, memberMapper, punchService);
        when(operatorResolver.currentOperatorName()).thenReturn("陳小紅");
    }

    private AttendancePunchImportRow row(String empNo, String at, Integer type, String location) {
        AttendancePunchImportRow row = new AttendancePunchImportRow();
        row.setEmpNo(empNo);
        row.setPunchAt(at);
        row.setPunchType(type);
        row.setLocation(location);
        return row;
    }

    private SysUser user(long id, String empNo, String dingUserId) {
        SysUser user = new SysUser();
        user.setId(id);
        user.setEmpId(empNo);
        user.setName("測試員工");
        user.setDingtalkUserId(dingUserId);
        return user;
    }

    private AttGroupMember member(long userId, long groupId) {
        AttGroupMember member = new AttGroupMember();
        member.setUserId(userId);
        member.setGroupId(groupId);
        member.setEmpNo("MF00" + userId);
        member.setEmpName("測試員工");
        member.setValidFrom(LocalDate.of(2026, 1, 1));
        return member;
    }

    private AttGroup enabledGroup() {
        AttGroup group = new AttGroup();
        group.setId(7L);
        group.setStatus("enabled");
        return group;
    }

    @Nested
    @DisplayName("手工导入")
    class Import {

        @Test
        @DisplayName("坏行只记错误、不影响好行入库，错误里带原始行号与原因")
        void keepsGoingOnBadRows() {
            when(sysUserMapper.selectList(any())).thenReturn(List.of(user(101L, "MF00101", "ding101")));
            when(memberMapper.selectOne(any())).thenReturn(member(101L, 7L));
            when(punchMapper.selectCount(any())).thenReturn(0L);

            var summary = punchService.importRows(List.of(
                    row("MF99999", "2026-10-10 09:00:00", 1, "本部"),       // 工号不存在
                    row("MF00101", "2026/10/10 09:00", 1, "本部"),           // 时间格式错
                    row("MF00101", "2026-10-10 09:00:00", 3, "本部"),        // 卡别非法
                    row("MF00101", "2026-10-10 09:00:00", 1, "深圳（外勤）")  // 正常
            ));

            assertEquals(4, summary.get("total"));
            assertEquals(1, summary.get("inserted"));
            assertEquals(3, summary.get("failed"));
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> errors = (List<Map<String, Object>>) summary.get("errors");
            assertEquals(1, errors.get(0).get("row"), "行号必须是原始行号，否则用户无法回到文件里定位");
            assertTrue(String.valueOf(errors.get(0).get("reason")).contains("MF99999"));

            ArgumentCaptor<AttPunchLog> inserted = ArgumentCaptor.forClass(AttPunchLog.class);
            verify(punchMapper).insert(inserted.capture());
            assertEquals(AttPunchLog.RESULT_OUTSIDE, inserted.getValue().getResult(), "外勤地点直接标出，迟到判定留给汇总引擎");
            assertEquals(AttPunchLog.SOURCE_IMPORT, inserted.getValue().getSource());
            assertEquals(7L, inserted.getValue().getGroupId());
            assertEquals(LocalDate.of(2026, 10, 10), inserted.getValue().getWorkDate());
        }

        @Test
        @DisplayName("同人同时刻同来源重复提交只入库一次，其余计重复")
        void isIdempotent() {
            when(sysUserMapper.selectList(any())).thenReturn(List.of(user(101L, "MF00101", null)));
            when(memberMapper.selectOne(any())).thenReturn(null);
            when(punchMapper.selectCount(any())).thenReturn(1L);

            var summary = punchService.importRows(List.of(row("MF00101", "2026-10-10 09:00:00", 1, "本部")));

            assertEquals(0, summary.get("inserted"));
            assertEquals(1, summary.get("duplicated"));
            verify(punchMapper, never()).insert(any(AttPunchLog.class));
        }

        @Test
        @DisplayName("凌晨卡：前一天排了跨天夜班则归前一天，否则归打卡当天")
        void resolvesCrossDayWorkDate() {
            AttSchedule previous = new AttSchedule();
            previous.setUserId(101L);
            previous.setWorkDate(LocalDate.of(2026, 10, 9));
            previous.setShiftId(9L);
            when(scheduleMapper.selectOne(any())).thenReturn(previous);
            AttShift night = new AttShift();
            night.setId(9L);
            night.setCrossDay(1);
            when(shiftMapper.selectById(9L)).thenReturn(night);

            LocalDateTime earlyMorning = LocalDateTime.of(2026, 10, 10, 1, 30);
            assertEquals(LocalDate.of(2026, 10, 9),
                    ((AttendancePunchServiceImpl) punchService).resolveWorkDate(101L, earlyMorning));

            when(shiftMapper.selectById(9L)).thenReturn(null);
            assertEquals(LocalDate.of(2026, 10, 10),
                    ((AttendancePunchServiceImpl) punchService).resolveWorkDate(101L, earlyMorning));
        }
    }

    @Nested
    @DisplayName("钉钉同步")
    class Sync {

        @Test
        @DisplayName("未配置同步应用时报可读错误，绝不回退到默认凭据")
        void requiresConfiguredApp() {
            when(sysConfigService.getConfigValueCached(AttendanceSyncServiceImpl.CONFIG_APP_ID)).thenReturn(null);
            BusinessException error = assertThrows(BusinessException.class,
                    () -> syncService.sync(LocalDate.of(2026, 10, 9), LocalDate.of(2026, 10, 10), null));
            assertTrue(error.getMessage().contains(AttendanceSyncServiceImpl.CONFIG_APP_ID));
            verify(dingTalkAppService, never()).callApi(anyLong(), anyString(), any());
        }

        @Test
        @DisplayName("没绑定钉钉账号的人整批跳过：不发起拉取，也不按姓名猜身份")
        void skipsUnboundEmployees() {
            when(sysConfigService.getConfigValueCached(AttendanceSyncServiceImpl.CONFIG_APP_ID)).thenReturn("12");
            when(groupMapper.selectList(any())).thenReturn(List.of(enabledGroup()));
            when(memberMapper.selectList(any())).thenReturn(List.of(member(101L, 7L)));
            when(sysUserMapper.selectBatchIds(any())).thenReturn(List.of(user(101L, "MF00101", null)));

            var summary = syncService.sync(LocalDate.of(2026, 10, 9), LocalDate.of(2026, 10, 10), null);

            assertEquals(1, summary.get("skippedUnbound"));
            assertEquals(0, summary.get("pulled"));
            verify(dingTalkAppService, never()).callApi(anyLong(), anyString(), any());
        }

        @Test
        @DisplayName("拉到的记录交给统一入库口做幂等与归属，同步侧不自己判重")
        void delegatesIdempotency() {
            when(sysConfigService.getConfigValueCached(AttendanceSyncServiceImpl.CONFIG_APP_ID)).thenReturn("12");
            when(memberMapper.selectList(any())).thenReturn(List.of(member(101L, 7L)));
            when(sysUserMapper.selectBatchIds(any())).thenReturn(List.of(user(101L, "MF00101", "ding101")));
            when(dingTalkAppService.callApi(eq(12L), anyString(), any())).thenReturn(Map.of(
                    "errcode", 0,
                    "recordresult", List.of(Map.of(
                            "userId", "ding101",
                            "userCheckTime", 1760000000000L,
                            "checkType", "OnDuty",
                            "locationResult", "Normal",
                            "userAddress", "珠海本部",
                            "id", "DING-1")))
            );
            when(punchMapper.selectCount(any())).thenReturn(0L);

            var summary = syncService.sync(LocalDate.of(2026, 10, 10), LocalDate.of(2026, 10, 10), 7L);

            assertEquals(1, summary.get("pulled"));
            assertEquals(1, summary.get("inserted"));
            ArgumentCaptor<AttPunchLog> inserted = ArgumentCaptor.forClass(AttPunchLog.class);
            verify(punchMapper).insert(inserted.capture());
            AttPunchLog record = inserted.getValue();
            assertEquals(AttPunchLog.SOURCE_DINGTALK, record.getSource());
            assertEquals("DING-1", record.getRawRef(), "必须留外部原始 ID，否则无法追溯与去重");
            assertEquals(AttPunchLog.TYPE_ON, record.getPunchType());
            assertEquals(101L, record.getUserId());
            assertEquals(7L, record.getGroupId(), "归属按成员表带出，不重新查一遍");
        }
    }
}
