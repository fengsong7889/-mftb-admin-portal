package com.mftb.admin.service;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.MeetingConstants;
import com.mftb.admin.entity.MeetingRoom;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 预约规则裁决测试（{@link MeetingRuleService} 是新建与改期共用的唯一入口）。
 *
 * <p>锁定的都是"漏在改期路径上就等于开绕过口"的规则：同日约束、粒度对齐、时长上下限、
 * 每日可预约窗、提前期与最远可订天数、容量。房间列 NULL 回落 sys_config 的两层口径也在此钉住：
 * 前端可以做同一套校验，但那是体验，这里才是边界。
 */
class MeetingRuleServiceTest {

    /**
     * 基准时间取"明天的 10:00"而不是写死日期：
     * 写死之后这条用例会在真实时钟走到该日期 31 天后集体失败（最远可订 30 天），
     * 而失败信息看起来像业务回归，实际只是测试自身过期。
     */
    private static LocalDateTime start() {
        return LocalDateTime.now().plusDays(1).withHour(10).withMinute(0).withSecond(0).withNano(0);
    }

    private SysConfigService configService;
    private MeetingRuleService service;

    @BeforeEach
    void setUp() {
        configService = mock(SysConfigService.class);
        Map<String, String> values = new HashMap<>();
        values.put(MeetingConstants.CFG_ADVANCE_DAYS, "30");
        values.put(MeetingConstants.CFG_MIN_LEAD_MINUTES, "15");
        values.put(MeetingConstants.CFG_MAX_DURATION, "240");
        values.put(MeetingConstants.CFG_TIME_GRANULARITY, "15");
        values.put(MeetingConstants.CFG_BOOKABLE_START, "08:00");
        values.put(MeetingConstants.CFG_BOOKABLE_END, "22:00");
        when(configService.getConfigValues(anyList())).thenReturn(values);
        service = new MeetingRuleService(configService);
    }

    private static MeetingRoom room(int capacity) {
        MeetingRoom r = new MeetingRoom();
        r.setId(1L);
        r.setRoomNo("MR-1F-01");
        r.setRoomName("會議室 A");
        r.setCapacity(capacity);
        r.setStatus(MeetingConstants.ROOM_ACTIVE);
        r.setBookable(1);
        return r;
    }

    private void validate(MeetingRoom room, LocalDateTime start, LocalDateTime end, int people) {
        service.validate(room, start, end, people);
    }

    @Test
    @DisplayName("房间列留空时回落全局默认：240 分钟上限与 08:00–22:00 窗")
    void nullRoomColumnsFallBackToGlobal() {
        MeetingRoom r = room(8);
        // 10:00–14:00 在全局 240 分钟上限内且落在每日窗内
        validate(r, start(), start().plusMinutes(240), 8);
        // 10:00–15:00 超上限
        assertThrows(BusinessException.class, () -> validate(r, start(), start().plusMinutes(300), 4));
    }

    @Test
    @DisplayName("房间自身配置优先于全局")
    void roomColumnsOverrideGlobal() {
        MeetingRoom r = room(8);
        r.setMaxDuration(60);
        assertThrows(BusinessException.class, () -> validate(r, start(), start().plusMinutes(90), 4));
        validate(r, start(), start().plusMinutes(60), 4);
    }

    @Test
    @DisplayName("跨天会议被拒：每日可预约窗不描述跨零点窗口")
    void crossDayWindowIsRejected() {
        MeetingRoom r = room(8);
        BusinessException ex = assertThrows(BusinessException.class,
                () -> validate(r, start().withHour(21), start().withHour(21).plusDays(1).withHour(9), 4));
        assertTrue(ex.getMessage().contains("同一天內結束"), ex.getMessage());
    }

    @Test
    @DisplayName("未对齐 15 分钟刻度与带秒的时间都被拒")
    void granularityAndSecondPrecisionAreRejected() {
        MeetingRoom r = room(8);
        assertTrue(assertThrows(BusinessException.class,
                () -> validate(r, start().withMinute(7), start().plusMinutes(60), 4)).getMessage().contains("刻度"));
        assertTrue(assertThrows(BusinessException.class,
                () -> validate(r, start().withSecond(30), start().plusMinutes(60), 4)).getMessage().contains("精確到分鐘"));
    }

    @Test
    @DisplayName("超出房间每日可预约窗时给出真实时段，而不是笼统报错")
    void outsideDailyWindowReportsEffectiveRange() {
        MeetingRoom r = room(8);
        r.setBookableStartTime(java.time.LocalTime.of(9, 30));
        r.setBookableEndTime(java.time.LocalTime.of(18, 0));
        BusinessException ex = assertThrows(BusinessException.class,
                () -> validate(r, start().withHour(19), start().withHour(20), 4));
        assertTrue(ex.getMessage().contains("09:30–18:00"), ex.getMessage());
    }

    @Test
    @DisplayName("房间右端配得等于或早于左端时视为未配窗口，避免拒掉一切预约")
    void invertedWindowFallsBackInsteadOfBlockingEverything() {
        MeetingRoom r = room(8);
        r.setBookableStartTime(java.time.LocalTime.of(18, 0));
        r.setBookableEndTime(java.time.LocalTime.of(18, 0));
        validate(r, start(), start().plusMinutes(60), 4);
    }

    @Test
    @DisplayName("提前期以服务端当前时间判定：踩点开始却不足 15 分钟的预约被拒")
    void minLeadTimeIsEnforced() {
        // 用"当前时刻回退一小时并对齐到 15 分钟刻度"作为开始时间：
        // 既保证一定落在提前期内，又不会因为跑用例的时刻跨过 22:00 或零点而先命中别的规则
        MeetingRoom r = room(8);
        r.setBookableStartTime(java.time.LocalTime.of(0, 0));
        r.setBookableEndTime(java.time.LocalTime.of(23, 59));
        LocalDateTime base = LocalDateTime.now().minusHours(1).withSecond(0).withNano(0);
        LocalDateTime start = base.withMinute(base.getMinute() / 15 * 15);
        BusinessException ex = assertThrows(BusinessException.class,
                () -> validate(r, start, start.plusMinutes(30), 4));
        assertTrue(ex.getMessage().contains("提前 15 分鐘"), ex.getMessage());
    }

    @Test
    @DisplayName("超出最远可订天数被拒")
    void advanceDaysAreEnforced() {
        MeetingRoom r = room(8);
        LocalDateTime far = start().plusDays(30);
        assertThrows(BusinessException.class, () -> validate(r, far, far.plusMinutes(60), 4));
    }

    @Test
    @DisplayName("参会人数超过容量被拒，人数按含组织者与外部人的全量计")
    void capacityIsCheckedAgainstFullHeadcount() {
        MeetingRoom r = room(4);
        BusinessException ex = assertThrows(BusinessException.class, () -> validate(r, start(), start().plusMinutes(60), 5));
        assertTrue(ex.getMessage().contains("超過"), ex.getMessage());
        assertEquals(4, r.getCapacity());
    }

    @Test
    @DisplayName("停用或不可预约的房间直接拒绝，与时间无关")
    void nonBookableOrInactiveRoomIsRejected() {
        MeetingRoom stopped = room(8);
        stopped.setBookable(0);
        assertTrue(assertThrows(BusinessException.class,
                () -> validate(stopped, start(), start().plusMinutes(60), 2)).getMessage().contains("停止接受預約"));

        MeetingRoom maintenance = room(8);
        maintenance.setStatus(MeetingConstants.ROOM_MAINTENANCE);
        assertThrows(BusinessException.class,
                () -> validate(maintenance, start(), start().plusMinutes(60), 2));
    }
}
