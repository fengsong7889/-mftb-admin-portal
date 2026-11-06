package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.MeetingConstants;
import com.mftb.admin.dto.MeetingBookingDto;
import com.mftb.admin.entity.MeetingAttendee;
import com.mftb.admin.entity.MeetingBooking;
import com.mftb.admin.entity.MeetingRoom;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.MeetingAttendeeMapper;
import com.mftb.admin.mapper.MeetingBookingMapper;
import com.mftb.admin.mapper.MeetingEventMapper;
import com.mftb.admin.mapper.MeetingMinutesMapper;
import com.mftb.admin.mapper.MeetingNotifyLogMapper;
import com.mftb.admin.mapper.MeetingRoomMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.MeetingAccessGuard;
import com.mftb.admin.service.MeetingAuditRecorder;
import com.mftb.admin.service.MeetingBlacklistService;
import com.mftb.admin.service.MeetingNotifyDispatcher;
import com.mftb.admin.service.MeetingRuleService;
import com.mftb.admin.util.BizSeqService;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.LocalDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * M2 生命周期（签到 / 提前结束 / 释放 / 黑名单联动）测试。
 *
 * <p>锁定的都是"写错就会污染事实"的判断：签到窗口边界、爽约与取消的分离、
 * 释放必须是行政专属、自动释放要触发爽约统计、周期物化遇冲突要跳过而不是整批失败。
 */
class MeetingBookingLifecycleTest {

    private static final SysUser ORGANIZER = user(100L, "MF00100", "張三");
    private static final SysUser ATTENDEE = user(200L, "MF00200", "李四");
    private static final SysUser ADMIN = user(900L, "MF00900", "王行政");

    private MeetingBookingMapper bookingMapper;
    private MeetingRoomMapper roomMapper;
    private MeetingAttendeeMapper attendeeMapper;
    private MeetingEventMapper eventMapper;
    private MeetingNotifyLogMapper notifyMapper;
    private MeetingMinutesMapper minutesMapper;
    private SysUserMapper userMapper;
    private MeetingAccessGuard guard;
    private MeetingRuleService ruleService;
    private MeetingAuditRecorder auditRecorder;
    private MeetingNotifyDispatcher notifyDispatcher;
    private MeetingBlacklistService blacklistService;
    private BizSeqService bizSeqService;
    private MeetingBookingServiceImpl service;

    private static SysUser user(long id, String empId, String name) {
        SysUser u = new SysUser();
        u.setId(id);
        u.setEmpId(empId);
        u.setName(name);
        u.setUsername(name);
        u.setDepartmentId(10L);
        u.setDepartment("產品部");
        u.setStatus(1);
        u.setRole("user");
        return u;
    }

    /** LambdaUpdateWrapper 需要 MyBatis-Plus 的表元数据缓存，纯单测里没有 Spring 注册过程 */
    @BeforeAll
    static void initTableMetadata() {
        for (Class<?> entity : List.of(MeetingBooking.class, MeetingAttendee.class, MeetingRoom.class)) {
            TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), ""), entity);
        }
    }

    @BeforeEach
    void setUp() {
        bookingMapper = mock(MeetingBookingMapper.class);
        roomMapper = mock(MeetingRoomMapper.class);
        attendeeMapper = mock(MeetingAttendeeMapper.class);
        eventMapper = mock(MeetingEventMapper.class);
        notifyMapper = mock(MeetingNotifyLogMapper.class);
        minutesMapper = mock(MeetingMinutesMapper.class);
        userMapper = mock(SysUserMapper.class);
        guard = mock(MeetingAccessGuard.class);
        ruleService = mock(MeetingRuleService.class);
        auditRecorder = mock(MeetingAuditRecorder.class);
        notifyDispatcher = mock(MeetingNotifyDispatcher.class);
        blacklistService = mock(MeetingBlacklistService.class);
        bizSeqService = mock(BizSeqService.class);
        service = new MeetingBookingServiceImpl(bookingMapper, roomMapper, attendeeMapper, eventMapper,
                notifyMapper, minutesMapper, userMapper, guard, ruleService, auditRecorder, notifyDispatcher,
                blacklistService, bizSeqService);
        ADMIN.setRole("admin");

        when(guard.currentUser()).thenReturn(ORGANIZER);
        // GlobalRule 的构造器是包内的（只允许 MeetingRuleService 自己造），测试跨包只能用 mock 打桩：
        // 这同时也钉住了"规则值必须来自 globalRule()"这一个来源，而不是测试里再复制一份默认值
        MeetingRuleService.GlobalRule global = mock(MeetingRuleService.GlobalRule.class);
        when(global.getReleaseAfterMinutes()).thenReturn(15);
        when(global.getCheckinOpenMinutes()).thenReturn(5);
        when(global.getRemindMinutes()).thenReturn(15);
        when(global.getAdvanceDays()).thenReturn(30);
        when(global.getMinLeadMinutes()).thenReturn(15);
        when(global.getMaxDurationMinutes()).thenReturn(240);
        when(global.getGranularityMinutes()).thenReturn(15);
        when(global.getBookableStart()).thenReturn(java.time.LocalTime.of(8, 0));
        when(global.getBookableEnd()).thenReturn(java.time.LocalTime.of(22, 0));
        when(ruleService.globalRule()).thenReturn(global);
    }

    private MeetingBooking booking(String status, LocalDateTime start, LocalDateTime end) {
        MeetingBooking b = new MeetingBooking();
        b.setId(50L);
        b.setBookingNo("MT202610150001");
        b.setTitle("例會");
        b.setStatus(status);
        b.setRoomId(1L);
        b.setRoomName("會議室 A");
        b.setOrganizerId(ORGANIZER.getId());
        b.setOrganizerName(ORGANIZER.getName());
        b.setStartTime(start);
        b.setEndTime(end);
        b.setAttendeeCount(2);
        b.setVersion(0);
        return b;
    }

    private MeetingRoom room(int checkinRequired) {
        MeetingRoom r = new MeetingRoom();
        r.setId(1L);
        r.setRoomNo("MR-1F-01");
        r.setRoomName("會議室 A");
        r.setCapacity(8);
        r.setStatus(MeetingConstants.ROOM_ACTIVE);
        r.setBookable(1);
        r.setCheckinRequired(checkinRequired);
        return r;
    }

    private MeetingAttendee attendeeRow(LocalDateTime checkinAt) {
        MeetingAttendee a = new MeetingAttendee();
        a.setId(7L);
        a.setBookingId(50L);
        a.setUserId(ORGANIZER.getId());
        a.setName(ORGANIZER.getName());
        a.setAttendeeType(MeetingConstants.ATTENDEE_ORGANIZER);
        a.setResponse(MeetingConstants.RESPOND_ACCEPTED);
        a.setCheckinAt(checkinAt);
        return a;
    }

    /* ==================== 签到 ==================== */

    @Test
    @DisplayName("未到签到窗口时拒绝：提前签到会让释放作业无法相信签到数据")
    void checkinBeforeWindowIsRejected() {
        LocalDateTime start = LocalDateTime.now().plusHours(2);
        MeetingBooking stored = booking(MeetingConstants.STATUS_BOOKED, start, start.plusHours(1));
        when(bookingMapper.selectForUpdate(50L)).thenReturn(stored);
        when(roomMapper.selectById(1L)).thenReturn(room(1));
        when(attendeeMapper.selectOne(any())).thenReturn(attendeeRow(null));

        BusinessException ex = assertThrows(BusinessException.class, () -> service.checkin(50L));
        assertTrue(ex.getMessage().contains("尚未到簽到時間"), ex.getMessage());
        verify(bookingMapper, never()).update(isNull(), any());
    }

    @Test
    @DisplayName("窗口内首次签到：个人签到时间与会议状态同时推进")
    void firstCheckinAdvancesToCheckedIn() {
        LocalDateTime start = LocalDateTime.now().minusMinutes(5);
        MeetingBooking stored = booking(MeetingConstants.STATUS_BOOKED, start, start.plusHours(1));
        when(bookingMapper.selectForUpdate(50L)).thenReturn(stored);
        when(roomMapper.selectById(1L)).thenReturn(room(1));
        when(attendeeMapper.selectOne(any())).thenReturn(attendeeRow(null));
        when(bookingMapper.update(isNull(), any())).thenReturn(1);
        when(bookingMapper.selectById(50L)).thenReturn(booking(MeetingConstants.STATUS_CHECKED_IN, start,
                start.plusHours(1)));

        service.checkin(50L);

        // 两次 update：一次写参会人签到时间，一次推会议状态。少一次就会出现"人签了会还显示待开"
        verify(attendeeMapper).update(isNull(), any());
        verify(bookingMapper).update(isNull(), any());
        verify(auditRecorder).recordBooking(eq(50L), eq(1L), any(), eq(MeetingConstants.EVENT_CHECKIN),
                isNull(), isNull(), any(), eq(ORGANIZER), isNull());
    }

    @Test
    @DisplayName("已被释放的单不能再签到：释放就是爽约判定，事后补签会抹掉这条事实")
    void releasedBookingCannotCheckin() {
        LocalDateTime start = LocalDateTime.now().minusMinutes(30);
        MeetingBooking stored = booking(MeetingConstants.STATUS_RELEASED, start, start.plusHours(1));
        when(bookingMapper.selectForUpdate(50L)).thenReturn(stored);
        when(roomMapper.selectById(1L)).thenReturn(room(1));
        when(attendeeMapper.selectOne(any())).thenReturn(attendeeRow(null));

        BusinessException ex = assertThrows(BusinessException.class, () -> service.checkin(50L));
        assertTrue(ex.getMessage().contains("已被釋放"), ex.getMessage());
    }

    @Test
    @DisplayName("不在名单里的人不能签到（即便他能读到会议详情）")
    void nonAttendeeCannotCheckin() {
        LocalDateTime start = LocalDateTime.now().minusMinutes(5);
        MeetingBooking stored = booking(MeetingConstants.STATUS_BOOKED, start, start.plusHours(1));
        when(bookingMapper.selectForUpdate(50L)).thenReturn(stored);
        when(roomMapper.selectById(1L)).thenReturn(room(1));
        when(attendeeMapper.selectOne(any())).thenReturn(null);

        BusinessException ex = assertThrows(BusinessException.class, () -> service.checkin(50L));
        assertTrue(ex.getMessage().contains("參會名單"), ex.getMessage());
    }

    /* ==================== 提前结束 / 释放 ==================== */

    @Test
    @DisplayName("未开始的会议不能提前结束：那是取消，两者在统计里是两回事")
    void finishBeforeStartIsRejected() {
        LocalDateTime start = LocalDateTime.now().plusHours(1);
        when(bookingMapper.selectForUpdate(50L))
                .thenReturn(booking(MeetingConstants.STATUS_BOOKED, start, start.plusHours(1)));
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.finish(50L, finishForm(null)));
        assertTrue(ex.getMessage().contains("尚未開始"), ex.getMessage());
    }

    private static MeetingBookingDto.FinishForm finishForm(String note) {
        MeetingBookingDto.FinishForm form = new MeetingBookingDto.FinishForm();
        form.setNote(note);
        return form;
    }

    @Test
    @DisplayName("进行中的会议可提前结束：写实际结束时间并归还剩余窗口")
    void finishWhileOngoingWritesActualEnd() {
        LocalDateTime start = LocalDateTime.now().minusMinutes(10);
        MeetingBooking stored = booking(MeetingConstants.STATUS_CHECKED_IN, start, start.plusHours(2));
        when(bookingMapper.selectForUpdate(50L)).thenReturn(stored);
        when(bookingMapper.update(isNull(), any())).thenReturn(1);
        MeetingBooking after = booking(MeetingConstants.STATUS_FINISHED, start, start.plusHours(2));
        after.setActualEndAt(LocalDateTime.now());
        when(bookingMapper.selectById(50L)).thenReturn(after);
        when(roomMapper.selectById(1L)).thenReturn(room(1));

        service.finish(50L, finishForm(null));

        verify(bookingMapper).update(isNull(), any());
        verify(notifyDispatcher).enqueue(any(), eq(MeetingConstants.NOTIFY_EVT_FINISHED),
                eq(MeetingConstants.SCENARIO_OPS), any(), any());
        // 没填散会说明时审计 reason 保持 null：不能为了“看起来有留痕”而编造内容
        verify(auditRecorder).recordBooking(eq(50L), eq(1L), any(), eq(MeetingConstants.EVENT_FINISH),
                isNull(), any(), any(), eq(ORGANIZER), isNull());
    }

    @Test
    @DisplayName("提前结束的散会说明同时进审计与通知：只报一个时间戳，参会人不知道为什么提前散")
    void finishNotePropagatesToAuditAndNotify() {
        LocalDateTime start = LocalDateTime.now().minusMinutes(10);
        when(bookingMapper.selectForUpdate(50L))
                .thenReturn(booking(MeetingConstants.STATUS_CHECKED_IN, start, start.plusHours(2)));
        when(bookingMapper.update(isNull(), any())).thenReturn(1);
        MeetingBooking after = booking(MeetingConstants.STATUS_FINISHED, start, start.plusHours(2));
        after.setActualEndAt(LocalDateTime.now());
        when(bookingMapper.selectById(50L)).thenReturn(after);
        when(roomMapper.selectById(1L)).thenReturn(room(1));

        service.finish(50L, finishForm("需求已確認完畢，提前散會"));

        ArgumentCaptor<String> reason = ArgumentCaptor.forClass(String.class);
        verify(auditRecorder).recordBooking(eq(50L), eq(1L), any(), eq(MeetingConstants.EVENT_FINISH),
                reason.capture(), any(), any(), eq(ORGANIZER), isNull());
        assertEquals("需求已確認完畢，提前散會", reason.getValue());

        ArgumentCaptor<String> detail = ArgumentCaptor.forClass(String.class);
        verify(notifyDispatcher).enqueue(any(), eq(MeetingConstants.NOTIFY_EVT_FINISHED),
                eq(MeetingConstants.SCENARIO_OPS), any(), detail.capture());
        assertTrue(detail.getValue().contains("需求已確認完畢，提前散會"), detail.getValue());
    }

    @Test
    @DisplayName("释放必须是行政专属：组织者只能取消自己的会，不能替自己释放")
    void releaseRequiresAdmin() {
        when(guard.currentUser()).thenReturn(ORGANIZER);
        when(guard.canOperateRecords(ORGANIZER)).thenReturn(false);
        LocalDateTime start = LocalDateTime.now().minusMinutes(30);
        when(bookingMapper.selectForUpdate(50L))
                .thenReturn(booking(MeetingConstants.STATUS_BOOKED, start, start.plusHours(1)));

        MeetingBookingDto.ReleaseForm form = new MeetingBookingDto.ReleaseForm();
        form.setReason("無人到場");
        form.setVersion(0);
        BusinessException ex = assertThrows(BusinessException.class, () -> service.release(50L, form));
        assertTrue(ex.getMessage().contains("只有行政"), ex.getMessage());
    }

    @Test
    @DisplayName("未开始的会议不可手动释放：那是取消，放行会留下早于开始时间的结束数据并虚增爽约")
    void releaseRejectsMeetingNotStartedYet() {
        when(guard.currentUser()).thenReturn(ADMIN);
        when(guard.canOperateRecords(ADMIN)).thenReturn(true);
        LocalDateTime start = LocalDateTime.now().plusHours(2);
        when(bookingMapper.selectForUpdate(50L))
                .thenReturn(booking(MeetingConstants.STATUS_BOOKED, start, start.plusHours(1)));

        MeetingBookingDto.ReleaseForm form = new MeetingBookingDto.ReleaseForm();
        form.setReason("行政误操");
        form.setVersion(0);
        BusinessException ex = assertThrows(BusinessException.class, () -> service.release(50L, form));
        assertTrue(ex.getMessage().contains("尚未開始"), ex.getMessage());
        // 一行都不写：released + no_show_flag=1 + actual_end_at 三件套只能属于“已开始未到场”
        verify(bookingMapper, never()).update(isNull(), any());
        verify(auditRecorder, never()).recordBooking(anyLong(), anyLong(), any(), any(), any(), any(), any(), any(), any());
    }

    @Test
    @DisplayName("已有人签到的会不可释放：那是提前結束，走释放会把开过的会记成爽约")
    void releaseRejectsMeetingAlreadyCheckedIn() {
        when(guard.currentUser()).thenReturn(ADMIN);
        when(guard.canOperateRecords(ADMIN)).thenReturn(true);
        LocalDateTime start = LocalDateTime.now().minusMinutes(30);
        when(bookingMapper.selectForUpdate(50L))
                .thenReturn(booking(MeetingConstants.STATUS_CHECKED_IN, start, start.plusHours(1)));

        MeetingBookingDto.ReleaseForm form = new MeetingBookingDto.ReleaseForm();
        form.setReason("行政误操");
        form.setVersion(0);
        BusinessException ex = assertThrows(BusinessException.class, () -> service.release(50L, form));
        assertTrue(ex.getMessage().contains("請改用「提前結束」"), ex.getMessage());
        // 爽约三件套一行都不能写：no_show_flag=1 会把正常开会的人推向自动拉黑阈值
        verify(bookingMapper, never()).update(isNull(), any());
        verify(auditRecorder, never()).recordBooking(anyLong(), anyLong(), any(), any(), any(), any(), any(), any(), any());
    }

    @Test
    @DisplayName("自动释放触发爽约统计：手动释放不触发（帮人腾房不是处分依据）")
    void autoReleaseEvaluatesBlacklist() {
        LocalDateTime start = LocalDateTime.now().minusMinutes(30);
        MeetingBooking stored = booking(MeetingConstants.STATUS_BOOKED, start, start.plusHours(1));
        when(roomMapper.selectById(1L)).thenReturn(room(1));
        when(bookingMapper.update(isNull(), any())).thenReturn(1);
        when(bookingMapper.selectById(50L)).thenReturn(stored);
        when(userMapper.selectById(anyLong())).thenReturn(ADMIN);

        assertTrue(service.releaseAsNoShow(stored, "超時未簽到"));
        verify(blacklistService).evaluateAutoBlacklist(ORGANIZER.getId());

        // 未到释放线时不做任何写入：释放判定与状态推进必须一起成立
        MeetingBooking future = booking(MeetingConstants.STATUS_BOOKED,
                LocalDateTime.now().plusMinutes(30), LocalDateTime.now().plusMinutes(90));
        assertFalse(service.releaseAsNoShow(future, "超時未簽到"));
    }

    /* ==================== 变更（编辑）窗口 ==================== */

    private MeetingBookingDto.UpdateForm updateForm(LocalDateTime start, LocalDateTime end, int version) {
        MeetingBookingDto.UpdateForm form = new MeetingBookingDto.UpdateForm();
        form.setTitle("例會（变更）");
        form.setRoomId(1L);
        form.setStartTime(start);
        form.setEndTime(end);
        form.setAttendeeUserIds(List.of(ATTENDEE.getId()));
        form.setBizType(MeetingConstants.BIZ_GENERAL);
        form.setVersion(version);
        return form;
    }

    /** 变更路径的依赖桩：房间锁、组织者、名单解析、乐观锁写入 */
    private void stubUpdatePath(MeetingBooking stored, MeetingBooking saved) {
        when(bookingMapper.selectForUpdate(50L)).thenReturn(stored);
        when(roomMapper.selectForUpdate(1L)).thenReturn(room(1));
        when(userMapper.selectById(ORGANIZER.getId())).thenReturn(ORGANIZER);
        when(userMapper.selectList(any())).thenReturn(List.of(ATTENDEE));
        when(bookingMapper.update(isNull(), any())).thenReturn(1);
        when(attendeeMapper.findByBooking(50L)).thenReturn(List.of());
        when(bookingMapper.selectById(50L)).thenReturn(saved);
    }

    @Test
    @DisplayName("已签到（已开始）的会允许变更：临时换房/加人/改议程就发生在这个窗口")
    void updateAllowsCheckedInMeeting() {
        LocalDateTime start = LocalDateTime.now().minusMinutes(30);
        MeetingBooking stored = booking(MeetingConstants.STATUS_CHECKED_IN, start, start.plusHours(2));
        // 新时间仍在过去：会真的开过，签到事实不该被撤回
        MeetingBooking saved = booking(MeetingConstants.STATUS_CHECKED_IN, start.plusMinutes(15), start.plusHours(2));
        stubUpdatePath(stored, saved);

        service.update(50L, updateForm(saved.getStartTime(), saved.getEndTime(), 0));

        verify(bookingMapper).update(isNull(), any());
        verify(auditRecorder).recordBooking(eq(50L), eq(1L), any(), eq(MeetingConstants.EVENT_UPDATE),
                any(), any(), any(), eq(ORGANIZER), isNull());
        // 时间未改到未来 → 只重置表态，不撤回签到
        verify(attendeeMapper, times(1)).update(isNull(), any());
    }

    @Test
    @DisplayName("已收尾的会不能再变更：完成/取消/释放是历史事实")
    void updateRejectsSettledMeeting() {
        LocalDateTime start = LocalDateTime.now().minusHours(2);
        MeetingBooking stored = booking(MeetingConstants.STATUS_FINISHED, start, start.plusHours(1));
        when(bookingMapper.selectForUpdate(50L)).thenReturn(stored);

        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.update(50L, updateForm(start.plusHours(3), start.plusHours(4), 0)));
        assertTrue(ex.getMessage().contains("不能再變更"), ex.getMessage());
        verify(bookingMapper, never()).update(isNull(), any());
    }

    @Test
    @DisplayName("已开始的会被改到未来：撤回签到事实，单子回到已預約")
    void updateMovedToFutureWithdrawsCheckins() {
        LocalDateTime start = LocalDateTime.now().minusMinutes(30);
        MeetingBooking stored = booking(MeetingConstants.STATUS_CHECKED_IN, start, start.plusHours(2));
        LocalDateTime future = LocalDateTime.now().plusDays(1);
        MeetingBooking saved = booking(MeetingConstants.STATUS_CHECKED_IN, future, future.plusHours(2));
        stubUpdatePath(stored, saved);

        service.update(50L, updateForm(future, future.plusHours(2), 0));

        // 两次 booking 更新：一次写变更本身，一次撤回签到（状态回到 booked、清 checkin/actual_start）
        verify(bookingMapper, times(2)).update(isNull(), any());
        // 两次 attendee 更新：重置表态 + 清个人签到时间，否则留下“未来开会却已签到”
        verify(attendeeMapper, times(2)).update(isNull(), any());
    }

    /* ==================== 补录参会人（纪要录入页） ==================== */

    private MeetingBookingDto.BackfillForm backfillForm(long userId) {
        MeetingBookingDto.BackfillForm form = new MeetingBookingDto.BackfillForm();
        form.setUserId(userId);
        return form;
    }

    @Test
    @DisplayName("补录参会人写入正式名单：不发邀约、不留待响应，并留下审计")
    void backfillWritesFormalAttendeeWithoutInvite() {
        LocalDateTime start = LocalDateTime.now().minusMinutes(30);
        MeetingBooking stored = booking(MeetingConstants.STATUS_CHECKED_IN, start, start.plusHours(2));
        when(bookingMapper.selectForUpdate(50L)).thenReturn(stored);
        when(userMapper.selectById(ATTENDEE.getId())).thenReturn(ATTENDEE);
        when(attendeeMapper.findByBooking(50L)).thenReturn(List.of(attendeeRow(start)));
        when(bookingMapper.update(isNull(), any())).thenReturn(1);
        when(bookingMapper.selectById(50L)).thenReturn(booking(MeetingConstants.STATUS_CHECKED_IN, start, start.plusHours(2)));

        service.backfillAttendee(50L, backfillForm(ATTENDEE.getId()));

        ArgumentCaptor<MeetingAttendee> captor = ArgumentCaptor.captor();
        verify(attendeeMapper).insert(captor.capture());
        MeetingAttendee inserted = captor.getValue();
        assertEquals(ATTENDEE.getId(), inserted.getUserId());
        assertEquals(MeetingConstants.ATTENDEE_REQUIRED, inserted.getAttendeeType());
        // 补录的人不该出现在「待我響應」里，也不该收到一场事后才知道的邀约
        assertEquals(MeetingConstants.RESPOND_ACCEPTED, inserted.getResponse());
        assertEquals(MeetingConstants.NOTIFY_SKIPPED, inserted.getNotifyStatus());
        verify(notifyDispatcher, never()).enqueue(any(), any(), any(), any(), any());
        // 人数必须跟着重算，否则列表写 4 人、详情名单 5 行
        verify(bookingMapper).update(isNull(), any());
        verify(auditRecorder).recordBooking(eq(50L), eq(1L), any(), eq(MeetingConstants.EVENT_ATTENDEE_BACKFILL),
                any(), any(), any(), eq(ORGANIZER), isNull());
    }

    @Test
    @DisplayName("已取消/已释放的单不能补录：没有到场事实，补人等于伪造名单")
    void backfillRejectsTerminatedMeeting() {
        LocalDateTime start = LocalDateTime.now().minusMinutes(30);
        when(bookingMapper.selectForUpdate(50L))
                .thenReturn(booking(MeetingConstants.STATUS_RELEASED, start, start.plusHours(2)));

        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.backfillAttendee(50L, backfillForm(ATTENDEE.getId())));
        assertTrue(ex.getMessage().contains("補錄參會人"), ex.getMessage());
        verify(attendeeMapper, never()).insert(any(MeetingAttendee.class));
    }

    @Test
    @DisplayName("已在名单的人不重复补录：给出可读提示而不是唯一键异常")
    void backfillRejectsAlreadyInvitedAttendee() {
        LocalDateTime start = LocalDateTime.now().minusMinutes(30);
        MeetingAttendee already = attendeeRow(start);
        already.setUserId(ATTENDEE.getId());
        when(bookingMapper.selectForUpdate(50L)).thenReturn(booking(MeetingConstants.STATUS_CHECKED_IN, start, start.plusHours(2)));
        when(userMapper.selectById(ATTENDEE.getId())).thenReturn(ATTENDEE);
        when(attendeeMapper.findByBooking(50L)).thenReturn(List.of(already));

        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.backfillAttendee(50L, backfillForm(ATTENDEE.getId())));
        assertTrue(ex.getMessage().contains("無需補錄"), ex.getMessage());
        verify(attendeeMapper, never()).insert(any(MeetingAttendee.class));
    }

    @Test
    @DisplayName("停用/离职员工不能作为补录对象：名单里不能出现无账号归属的人")
    void backfillRejectsInactiveUser() {
        LocalDateTime start = LocalDateTime.now().minusMinutes(30);
        SysUser left = user(300L, "MF00300", "王五");
        left.setStatus(0);
        when(bookingMapper.selectForUpdate(50L)).thenReturn(booking(MeetingConstants.STATUS_CHECKED_IN, start, start.plusHours(2)));
        when(userMapper.selectById(300L)).thenReturn(left);

        BusinessException ex = assertThrows(BusinessException.class, () -> service.backfillAttendee(50L, backfillForm(300L)));
        assertTrue(ex.getMessage().contains("已停用或離職"), ex.getMessage());
        verify(attendeeMapper, never()).insert(any(MeetingAttendee.class));
    }

    /* ==================== 黑名单联动 ==================== */

    @Test
    @DisplayName("被限制的人连锁房间都拿不到：无效请求不该占用同房间的锁")
    void blacklistedUserCannotBook() {
        org.mockito.Mockito.doThrow(new BusinessException("您已被暫停預約"))
                .when(blacklistService).assertNotBlacklisted(ORGANIZER);
        MeetingBookingDto.CreateForm form = new MeetingBookingDto.CreateForm();
        form.setTitle("例會");
        form.setRoomId(1L);
        form.setStartTime(LocalDateTime.now().plusDays(1).withSecond(0).withNano(0));
        form.setEndTime(form.getStartTime().plusHours(1));

        assertThrows(BusinessException.class, () -> service.create(form));
        verify(roomMapper, never()).selectForUpdate(anyLong());
    }

    /* ==================== 周期物化 ==================== */

    @Test
    @DisplayName("周期物化遇窗口冲突返回 null 让调用方跳过，而不是抛异常毁掉整批")
    void materializeSkipsOnConflict() {
        MeetingRoom room = room(0);
        when(roomMapper.selectForUpdate(1L)).thenReturn(room);
        when(userMapper.selectList(any())).thenReturn(List.of(ATTENDEE));
        when(bookingMapper.findRoomConflicts(eq(1L), any(), any(), isNull()))
                .thenReturn(List.of(booking(MeetingConstants.STATUS_BOOKED,
                        LocalDateTime.now().plusDays(1), LocalDateTime.now().plusDays(1).plusHours(1))));

        MeetingBookingDto.CreateForm form = new MeetingBookingDto.CreateForm();
        LocalDateTime start = LocalDateTime.now().plusDays(1).withSecond(0).withNano(0);
        form.setTitle("週期例會");
        form.setRoomId(1L);
        form.setStartTime(start);
        form.setEndTime(start.plusMinutes(30));
        form.setAttendeeUserIds(List.of(ATTENDEE.getId()));

        assertEquals(null, service.materializeInstance(form, ORGANIZER, null, 9L, 3));
        verify(bookingMapper, never()).insert(any(MeetingBooking.class));
    }

    @Test
    @DisplayName("周期物化成功时带 seriesId/seriesSeq，且不与手工新建走两套校验")
    void materializeReusesOccupyCore() {
        MeetingRoom room = room(0);
        when(roomMapper.selectForUpdate(1L)).thenReturn(room);
        when(userMapper.selectList(any())).thenReturn(List.of(ATTENDEE));
        when(bookingMapper.findRoomConflicts(eq(1L), any(), any(), isNull())).thenReturn(List.of());
        when(bookingMapper.findOrganizerConflicts(anyLong(), any(), any(), isNull())).thenReturn(List.of());
        when(bookingMapper.insert(any(MeetingBooking.class))).thenAnswer(invocation -> {
            MeetingBooking entity = invocation.getArgument(0);
            entity.setId(88L);
            return 1;
        });
        when(bizSeqService.next(MeetingConstants.SEQ_BOOKING)).thenReturn("MT202610160009");

        MeetingBookingDto.CreateForm form = new MeetingBookingDto.CreateForm();
        LocalDateTime start = LocalDateTime.now().plusDays(1).withSecond(0).withNano(0);
        form.setTitle("週期例會");
        form.setRoomId(1L);
        form.setStartTime(start);
        form.setEndTime(start.plusMinutes(30));
        form.setAttendeeUserIds(List.of(ATTENDEE.getId()));

        MeetingBooking created = service.materializeInstance(form, ORGANIZER, null, 9L, 4);

        assertEquals(9L, created.getSeriesId());
        assertEquals(4, created.getSeriesSeq());
        assertNullKey(created.getRequestKey());
        verify(attendeeMapper, times(2)).insert(any(MeetingAttendee.class));
        ArgumentCaptor<String> event = ArgumentCaptor.forClass(String.class);
        verify(auditRecorder).recordBooking(eq(88L), eq(1L), any(), event.capture(),
                isNull(), isNull(), any(), eq(ORGANIZER), isNull());
        assertEquals(MeetingConstants.EVENT_CREATE, event.getValue());
    }

    private static void assertNullKey(String value) {
        // 实例不带幂等键：重放保护在系列层，一次物化要么全提交要么全回滚
        org.junit.jupiter.api.Assertions.assertNull(value);
    }
}
