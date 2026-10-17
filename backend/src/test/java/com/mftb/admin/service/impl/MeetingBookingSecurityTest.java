package com.mftb.admin.service.impl;

import com.mftb.admin.common.BusinessException;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.constant.MeetingConstants;
import com.mftb.admin.dto.MeetingBookingDto;
import com.mftb.admin.entity.MeetingAttendee;
import com.mftb.admin.entity.MeetingBooking;
import com.mftb.admin.entity.MeetingRoom;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.MeetingAttendeeMapper;
import com.mftb.admin.mapper.MeetingBookingMapper;
import com.mftb.admin.mapper.MeetingEventMapper;
import com.mftb.admin.mapper.MeetingNotifyLogMapper;
import com.mftb.admin.mapper.MeetingRoomMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.MeetingAccessGuard;
import com.mftb.admin.service.MeetingAuditRecorder;
import com.mftb.admin.service.MeetingBlacklistService;
import com.mftb.admin.service.MeetingNotifyDispatcher;
import com.mftb.admin.service.MeetingRuleService;
import com.mftb.admin.service.MeetingRuleService;
import com.mftb.admin.util.BizSeqService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.ArgumentMatchers;
import org.apache.ibatis.builder.MapperBuilderAssistant;

import java.time.LocalDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
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
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.when;

/**
 * 会议预约写入路径的安全与并发口径测试。
 *
 * <p>覆盖的都是"写错就会造成事实性错误"的判断：并发抢位是否被挡、幂等重放是否只生效一次、
 * 同键改内容是否被拒、代订是否伪造组织者、停用员工是否还能被拉进会场、
 * 版本过期是否覆盖他人修改。区间重叠的 SQL 侧由 Mapper 注解与结构锁用例守住，
 * 这里锁的是服务层"先锁房、再判重叠、再落单"的顺序与结论。
 */
class MeetingBookingSecurityTest {

    private static final SysUser ORGANIZER = user(100L, "MF00100", "張三");
    private static final SysUser ATTENDEE = user(200L, "MF00200", "李四");
    private static final SysUser ADMIN = user(900L, "MF00900", "王行政");

    private MeetingBookingMapper bookingMapper;
    private MeetingRoomMapper roomMapper;
    private MeetingAttendeeMapper attendeeMapper;
    private MeetingEventMapper eventMapper;
    private MeetingNotifyLogMapper notifyMapper;
    private SysUserMapper userMapper;
    private MeetingAccessGuard guard;
    private MeetingRuleService ruleService;
    private MeetingAuditRecorder auditRecorder;
    private MeetingNotifyDispatcher notifyDispatcher;
    private MeetingBlacklistService blacklistService;
    private BizSeqService bizSeqService;
    private MeetingBookingServiceImpl service;

    /**
     * LambdaUpdateWrapper 按实体方法引用反查列名，需要 MyBatis-Plus 的表元数据缓存。
     * 纯单测里没有 Spring 启动过程去注册 Mapper，不预先初始化就会在 set 时报
     * "can not find lambda cache for this entity"——那是测试搭建缺失，不是业务缺陷。
     */
    @BeforeAll
    static void initTableMetadata() {
        for (Class<?> entity : List.of(MeetingBooking.class, MeetingAttendee.class, MeetingRoom.class)) {
            TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), ""), entity);
        }
    }

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

    private static MeetingRoom room(long id) {
        MeetingRoom r = new MeetingRoom();
        r.setId(id);
        r.setRoomNo("MR-1F-01");
        r.setRoomName("會議室 A");
        r.setCampus("總部");
        r.setBuilding("1 棟");
        r.setFloorCode("1F");
        r.setCapacity(8);
        r.setStatus(MeetingConstants.ROOM_ACTIVE);
        r.setBookable(1);
        r.setVersion(0);
        return r;
    }

    private static MeetingBooking booking(long id, String status, long organizerId) {
        MeetingBooking b = new MeetingBooking();
        b.setId(id);
        b.setBookingNo("MT20261012" + String.format("%04d", id));
        b.setTitle("既有會議");
        b.setStatus(status);
        b.setRoomId(1L);
        b.setRoomNo("MR-1F-01");
        b.setRoomName("會議室 A");
        b.setOrganizerId(organizerId);
        b.setOrganizerName("其他人");
        b.setStartTime(LocalDateTime.parse("2026-10-13T10:00:00"));
        b.setEndTime(LocalDateTime.parse("2026-10-13T11:00:00"));
        b.setAttendeeCount(2);
        b.setVersion(0);
        return b;
    }

    private MeetingBookingDto.CreateForm createForm(String requestKey) {
        MeetingBookingDto.CreateForm form = new MeetingBookingDto.CreateForm();
        form.setTitle("需求評審");
        form.setRoomId(1L);
        form.setStartTime(LocalDateTime.parse("2026-10-13T10:00:00"));
        form.setEndTime(LocalDateTime.parse("2026-10-13T11:00:00"));
        form.setAttendeeUserIds(List.of(ATTENDEE.getId()));
        form.setRequestKey(requestKey);
        return form;
    }

    /** 与写入路径同一算法算出摘要：服务端就是拿它比对"同键是否同内容" */
    private static String hashOf(MeetingBookingDto.CreateForm form) {
        return MeetingBookingServiceImpl.hash(form);
    }

    @BeforeEach
    void setUp() {
        bookingMapper = mock(MeetingBookingMapper.class);
        roomMapper = mock(MeetingRoomMapper.class);
        attendeeMapper = mock(MeetingAttendeeMapper.class);
        eventMapper = mock(MeetingEventMapper.class);
        notifyMapper = mock(MeetingNotifyLogMapper.class);
        userMapper = mock(SysUserMapper.class);
        guard = mock(MeetingAccessGuard.class);
        ruleService = mock(MeetingRuleService.class);
        auditRecorder = mock(MeetingAuditRecorder.class);
        notifyDispatcher = mock(MeetingNotifyDispatcher.class);
        blacklistService = mock(MeetingBlacklistService.class);
        bizSeqService = mock(BizSeqService.class);
        service = new MeetingBookingServiceImpl(bookingMapper, roomMapper, attendeeMapper, eventMapper,
                notifyMapper, userMapper, guard, ruleService, auditRecorder, notifyDispatcher,
                blacklistService, bizSeqService);

        ADMIN.setRole("admin");
        when(guard.currentUser()).thenReturn(ORGANIZER);
        // 服务层读一次全局规则快照再传给校验（一次请求只查一次配置）；不桩它则会拿到 null，
        // 让参数是否为真值这类断言变成对 null 的断言，测不出真实调用形态
        when(ruleService.globalRule()).thenReturn(mock(MeetingRuleService.GlobalRule.class));
        when(roomMapper.selectForUpdate(1L)).thenReturn(room(1L));
        when(bizSeqService.next(MeetingConstants.SEQ_BOOKING)).thenReturn("MT202610130001");
        when(userMapper.selectList(any())).thenReturn(List.of(ATTENDEE));
        when(bookingMapper.insert(any(MeetingBooking.class))).thenAnswer(invocation -> {
            MeetingBooking entity = invocation.getArgument(0);
            entity.setId(500L);
            return 1;
        });
        MeetingNotifyDispatcher.EnqueueResult queued = mock(MeetingNotifyDispatcher.EnqueueResult.class);
        when(queued.getQueued()).thenReturn(1);
        when(queued.getSkipped()).thenReturn(0);
        when(queued.isScenarioActive()).thenReturn(true);
        when(notifyDispatcher.enqueue(any(), any(), any(), any(), any())).thenReturn(queued);
    }

    /* ==================== 冲突与并发 ==================== */

    @Test
    @DisplayName("同房间同窗口已有占用单时直接拒绝，并把冲突单号与组织者写进提示")
    void roomConflictIsRejectedWithReadableDetail() {
        MeetingBooking occupied = booking(9L, MeetingConstants.STATUS_BOOKED, ATTENDEE.getId());
        occupied.setTitle("競品對標");
        occupied.setOrganizerName("趙六");
        when(bookingMapper.findRoomConflicts(eq(1L), any(), any(), isNull())).thenReturn(List.of(occupied));

        BusinessException ex = assertThrows(BusinessException.class, () -> service.create(createForm("k-1")));
        assertTrue(ex.getMessage().contains("已被佔用"), ex.getMessage());
        assertTrue(ex.getMessage().contains(occupied.getBookingNo()), "提示必须包含占位的單號：" + ex.getMessage());
        assertTrue(ex.getMessage().contains("趙六"), "提示必须包含组织者：" + ex.getMessage());
        verify(bookingMapper, never()).insert(any(MeetingBooking.class));
        verify(notifyDispatcher, never()).enqueue(any(), any(), any(), any(), any());
    }

    @Test
    @DisplayName("组织者本人同时段已有会议时拒绝（对标钉钉同时段限制多间房）")
    void organizerDoubleBookingIsRejected() {
        when(bookingMapper.findRoomConflicts(eq(1L), any(), any(), isNull())).thenReturn(List.of());
        MeetingBooking mine = booking(11L, MeetingConstants.STATUS_BOOKED, ORGANIZER.getId());
        mine.setRoomName("會議室 B");
        when(bookingMapper.findOrganizerConflicts(eq(ORGANIZER.getId()), any(), any(), isNull()))
                .thenReturn(List.of(mine));

        BusinessException ex = assertThrows(BusinessException.class, () -> service.create(createForm("k-2")));
        assertTrue(ex.getMessage().contains("已有其他會議"), ex.getMessage());
        verify(bookingMapper, never()).insert(any(MeetingBooking.class));
    }

    /* ==================== 行政代订 ==================== */

    /**
     * 代订测试的公共搭法：guard 是 mock，默认返回 null（等价于没有代订），
     * 所以本文件既有用例不受影响；这里显式桩出"实际使用人"。
     */
    private SysUser stubDelegate() {
        SysUser boss = user(300L, "MF00300", "陳老闆");
        when(guard.resolveDelegateFor(300L, ORGANIZER)).thenReturn(boss);
        when(userMapper.selectList(any())).thenReturn(List.of(ATTENDEE, boss));
        return boss;
    }

    @Test
    @DisplayName("非行政传 delegateForId 时在锁房间之前就被拒绝")
    void delegateWithoutPrivilegeIsRejectedBeforeLock() {
        when(guard.resolveDelegateFor(300L, ORGANIZER))
                .thenThrow(new BusinessException("僅行政可替他人預訂會議，請由本人自行預約"));
        MeetingBookingDto.CreateForm form = createForm("k-deg-1");
        form.setDelegateForId(300L);

        BusinessException ex = assertThrows(BusinessException.class, () -> service.create(form));
        assertTrue(ex.getMessage().contains("僅行政"), ex.getMessage());
        // 判定必须早于 selectForUpdate：不合格的请求不该把同房间其他人排住
        verify(roomMapper, never()).selectForUpdate(anyLong());
        verify(bookingMapper, never()).insert(any(MeetingBooking.class));
    }

    @Test
    @DisplayName("代订：组织者仍是登录的行政，使用人落快照并自动计入必参名单")
    void delegateKeepsOrganizerAndSnapshotsUser() {
        MeetingBookingDto.CreateForm form = createForm("k-deg-2");
        form.setDelegateForId(300L);
        stubDelegate();

        service.create(form);

        ArgumentCaptor<MeetingBooking> saved = ArgumentCaptor.forClass(MeetingBooking.class);
        verify(bookingMapper).insert(saved.capture());
        MeetingBooking booking = saved.getValue();
        assertEquals(ORGANIZER.getId(), booking.getOrganizerId(), "组织者必须是登录态本人，不能由前端指定");
        assertEquals(300L, booking.getDelegateForId(), "实际使用人必须落库，否则台账答不出这间房给谁用");
        assertEquals("陳老闆", booking.getDelegateForName());

        ArgumentCaptor<MeetingAttendee> rows = ArgumentCaptor.forClass(MeetingAttendee.class);
        verify(attendeeMapper, times(3)).insert(rows.capture());
        assertTrue(rows.getAllValues().stream().anyMatch(row -> Long.valueOf(300L).equals(row.getUserId())),
                "使用人必须进参会名单，否则他的日程与签到都无处挂载");

        ArgumentCaptor<String> reasons = ArgumentCaptor.forClass(String.class);
        verify(auditRecorder).recordBooking(any(), any(), any(), eq(MeetingConstants.EVENT_CREATE),
                reasons.capture(), any(), any(), any(), any());
        assertTrue(reasons.getValue().contains("代 陳老闆 預訂"), "审计要留下谁被代订：" + reasons.getValue());
    }

    @Test
    @DisplayName("代订的时段冲突按实际使用人判定，而不是按跑腿的行政")
    void delegateConflictUsesAttendeeNotOrganizer() {
        MeetingBookingDto.CreateForm form = createForm("k-deg-3");
        form.setDelegateForId(300L);
        stubDelegate();
        MeetingBooking bossHasMeeting = booking(21L, MeetingConstants.STATUS_BOOKED, 300L);
        bossHasMeeting.setRoomName("會議室 C");
        when(bookingMapper.findOrganizerConflicts(eq(300L), any(), any(), isNull())).thenReturn(List.of(bossHasMeeting));

        BusinessException ex = assertThrows(BusinessException.class, () -> service.create(form));
        assertTrue(ex.getMessage().contains("實際使用人"), ex.getMessage());
        verify(bookingMapper, never()).insert(any(MeetingBooking.class));
    }

    @Test
    @DisplayName("行政本人同时段已有会议时，代订仍应放行（他不出席这场会）")
    void organizerOwnMeetingDoesNotBlockDelegate() {
        MeetingBookingDto.CreateForm form = createForm("k-deg-4");
        form.setDelegateForId(300L);
        stubDelegate();
        MeetingBooking mine = booking(22L, MeetingConstants.STATUS_BOOKED, ORGANIZER.getId());
        mine.setRoomName("會議室 D");
        when(bookingMapper.findOrganizerConflicts(eq(ORGANIZER.getId()), any(), any(), isNull()))
                .thenReturn(List.of(mine));
        when(bookingMapper.findOrganizerConflicts(eq(300L), any(), any(), isNull())).thenReturn(List.of());

        service.create(form);
        verify(bookingMapper).insert(any(MeetingBooking.class));
    }

    @Test
    @DisplayName("被限制的人不能靠别人代订继续占用窗口")
    void blacklistedDelegateIsRejectedBeforeLock() {
        MeetingBookingDto.CreateForm form = createForm("k-deg-5");
        form.setDelegateForId(300L);
        stubDelegate();
        doThrow(new BusinessException("實際使用人已被暫停預約：「連續爽約」，解除日期 2026-10-20"))
                .when(blacklistService).assertNotBlacklisted(300L, "實際使用人");

        BusinessException ex = assertThrows(BusinessException.class, () -> service.create(form));
        assertTrue(ex.getMessage().contains("已被暫停預約"), ex.getMessage());
        verify(roomMapper, never()).selectForUpdate(anyLong());
        verify(bookingMapper, never()).insert(any(MeetingBooking.class));
    }

    @Test
    @DisplayName("同一幂等键换使用人必须算不同请求（否则重放会悄悄换挂名人）")
    void delegateParticipatesInIdempotencyHash() {
        MeetingBookingDto.CreateForm plain = createForm("k-deg-6");
        MeetingBookingDto.CreateForm delegated = createForm("k-deg-6");
        delegated.setDelegateForId(300L);
        assertTrue(!MeetingBookingServiceImpl.hash(plain).equals(MeetingBookingServiceImpl.hash(delegated)),
                "哈希未包含使用人：同键重放可以把会议换到别人名下");
    }

    @Test
    @DisplayName("生成列唯一键撞车时重查冲突并给出可读结论，而不是抛出数据库异常")
    void duplicateSlotFromUniqueKeyIsTranslated() {
        when(bookingMapper.findRoomConflicts(eq(1L), any(), any(), isNull()))
                .thenReturn(List.of())
                .thenReturn(List.of(booking(12L, MeetingConstants.STATUS_BOOKED, ATTENDEE.getId())));
        when(bookingMapper.insert(any(MeetingBooking.class)))
                .thenThrow(new org.springframework.dao.DuplicateKeyException("Duplicate entry for key uk_meeting_booking_slot"));

        BusinessException ex = assertThrows(BusinessException.class, () -> service.create(createForm("k-3")));
        assertTrue(ex.getMessage().contains("剛被他人佔用"), ex.getMessage());
    }

    /* ==================== 幂等 ==================== */

    @Test
    @DisplayName("同 requestKey 同内容重放：返回原单，不二次占用窗口")
    void sameRequestKeySameContentReplaysOriginal() {
        MeetingBooking existing = booking(77L, MeetingConstants.STATUS_BOOKED, ORGANIZER.getId());
        existing.setRequestKey("k-idem");
        MeetingBookingDto.CreateForm form = createForm("k-idem");
        when(bookingMapper.findByIdempotencyKey(ORGANIZER.getId(), "k-idem")).thenReturn(existing);
        // 幂等命中要在插入之前，用与后端同一套摘要算法构造 existing 的 hash
        existing.setRequestHash(hashOf(form));

        MeetingBookingDto.CreateResult result = service.create(form);

        assertEquals(existing.getId(), result.getBookingId());
        verify(bookingMapper, never()).insert(any(MeetingBooking.class));
        verify(attendeeMapper, never()).insert(any(MeetingAttendee.class));
        verify(notifyDispatcher, never()).enqueue(any(), any(), any(), any(), any());
    }

    @Test
    @DisplayName("同 requestKey 不同内容必须被拒：不能把改动静默丢掉")
    void sameRequestKeyDifferentContentIsRejected() {
        MeetingBooking existing = booking(78L, MeetingConstants.STATUS_BOOKED, ORGANIZER.getId());
        existing.setRequestKey("k-idem");
        existing.setRequestHash("stale-hash");
        when(bookingMapper.findByIdempotencyKey(ORGANIZER.getId(), "k-idem")).thenReturn(existing);

        BusinessException ex = assertThrows(BusinessException.class, () -> service.create(createForm("k-idem")));
        assertTrue(ex.getMessage().contains("另一場預約內容"), ex.getMessage());
        verify(bookingMapper, never()).insert(any(MeetingBooking.class));
    }

    /* ==================== 身份与数据范围 ==================== */

    @Test
    @DisplayName("组织者由服务端从登录态取，且会落一行 organizer 参会人（我的日程一次 JOIN 覆盖）")
    void organizerComesFromJwtAndGetsAttendeeRow() {
        service.create(createForm("k-role"));

        ArgumentCaptor<MeetingBooking> captor = ArgumentCaptor.forClass(MeetingBooking.class);
        verify(bookingMapper).insert(captor.capture());
        assertEquals(ORGANIZER.getId(), captor.getValue().getOrganizerId());
        assertEquals(ORGANIZER.getEmpId(), captor.getValue().getOrganizerEmpNo());
        assertEquals(MeetingConstants.STATUS_BOOKED, captor.getValue().getStatus());
        assertEquals(2, captor.getValue().getAttendeeCount(), "组织者 + 1 名必參");

        ArgumentCaptor<MeetingAttendee> rows = ArgumentCaptor.forClass(MeetingAttendee.class);
        verify(attendeeMapper, times(2)).insert(rows.capture());
        assertTrue(rows.getAllValues().stream()
                .anyMatch(row -> MeetingConstants.ATTENDEE_ORGANIZER.equals(row.getAttendeeType())
                        && row.getUserId().equals(ORGANIZER.getId())));
        verify(auditRecorder).recordBooking(eq(500L), eq(1L), any(), eq(MeetingConstants.EVENT_CREATE),
                isNull(), isNull(), any(), eq(ORGANIZER), eq("k-role"));
    }

    @Test
    @DisplayName("参会人含已停用员工时整体拒绝，而不是静默少一个人")
    void inactiveAttendeeBlocksWholeSubmission() {
        SysUser resigned = user(300L, "MF00300", "離職者");
        resigned.setStatus(0);
        when(userMapper.selectList(any())).thenReturn(List.of(ATTENDEE, resigned));
        MeetingBookingDto.CreateForm form = createForm("k-off");
        form.setAttendeeUserIds(List.of(ATTENDEE.getId(), resigned.getId()));

        BusinessException ex = assertThrows(BusinessException.class, () -> service.create(form));
        assertTrue(ex.getMessage().contains("已停用或離職"), ex.getMessage());
        verify(bookingMapper, never()).insert(any(MeetingBooking.class));
    }

    @Test
    @DisplayName("参会人 ID 在系统里查不到时拒绝：静默剔除会让组织者以为通知已送达")
    void missingAttendeeIsRejected() {
        when(userMapper.selectList(any())).thenReturn(List.of(ATTENDEE));
        MeetingBookingDto.CreateForm form = createForm("k-missing");
        form.setAttendeeUserIds(List.of(ATTENDEE.getId(), 999999L));

        BusinessException ex = assertThrows(BusinessException.class, () -> service.create(form));
        assertTrue(ex.getMessage().contains("999999"), ex.getMessage());
    }

    /* ==================== 改期与取消 ==================== */

    @Test
    @DisplayName("改期必须锁单并比对版本：版本不符时不覆盖他人修改")
    void staleVersionUpdateIsRejected() {
        MeetingBooking stored = booking(60L, MeetingConstants.STATUS_BOOKED, ORGANIZER.getId());
        stored.setVersion(3);
        when(bookingMapper.selectForUpdate(60L)).thenReturn(stored);
        MeetingBookingDto.UpdateForm form = new MeetingBookingDto.UpdateForm();
        form.setTitle("改期後的會議");
        form.setRoomId(1L);
        form.setStartTime(LocalDateTime.parse("2026-10-14T14:00:00"));
        form.setEndTime(LocalDateTime.parse("2026-10-14T15:00:00"));
        form.setVersion(2);

        BusinessException ex = assertThrows(BusinessException.class, () -> service.update(60L, form));
        assertTrue(ex.getMessage().contains("已被他人修改"), ex.getMessage());
        verify(roomMapper, never()).selectForUpdate(anyLong());
    }

    @Test
    @DisplayName("已开始的会议不可变更：改期语义只存在于未开始的预约")
    void startedBookingCannotBeUpdated() {
        MeetingBooking stored = booking(61L, MeetingConstants.STATUS_BOOKED, ORGANIZER.getId());
        stored.setStartTime(LocalDateTime.now().minusMinutes(5));
        when(bookingMapper.selectForUpdate(61L)).thenReturn(stored);
        MeetingBookingDto.UpdateForm form = new MeetingBookingDto.UpdateForm();
        form.setTitle("晚一點開始");
        form.setRoomId(1L);
        form.setStartTime(LocalDateTime.now().plusMinutes(60));
        form.setEndTime(LocalDateTime.now().plusMinutes(90));
        form.setVersion(stored.getVersion());

        BusinessException ex = assertThrows(BusinessException.class, () -> service.update(61L, form));
        // 状态仍是 booked 但开始时间已过：拦住的是"已开始的会议不能改期"这条口径
        assertTrue(ex.getMessage().contains("已開始或已結束"), ex.getMessage());
    }

    @Test
    @DisplayName("参会人响应是替自己表态：组织者不给自己的邀约响应")
    void organizerCannotRespondToOwnInvite() {
        MeetingBooking stored = booking(62L, MeetingConstants.STATUS_BOOKED, ORGANIZER.getId());
        when(bookingMapper.selectForUpdate(62L)).thenReturn(stored);
        when(guard.currentUser()).thenReturn(ORGANIZER);
        when(guard.isOrganizer(stored, ORGANIZER)).thenReturn(true);

        MeetingBookingDto.ResponseForm form = new MeetingBookingDto.ResponseForm();
        form.setAccept(true);
        BusinessException ex = assertThrows(BusinessException.class, () -> service.respond(62L, form));
        assertTrue(ex.getMessage().contains("組織者無需響應"), ex.getMessage());
    }

    @Test
    @DisplayName("取消写状态与原因：CHECK 约束要求 cancelled_at 同期落库")
    void cancelWritesReasonAndTimestamp() {
        MeetingBooking stored = booking(63L, MeetingConstants.STATUS_BOOKED, ORGANIZER.getId());
        when(bookingMapper.selectForUpdate(63L)).thenReturn(stored);
        when(guard.currentUser()).thenReturn(ORGANIZER);
        when(bookingMapper.update(ArgumentMatchers.<MeetingBooking>isNull(), any())).thenReturn(1);
        when(bookingMapper.selectById(63L)).thenReturn(stored);

        MeetingBookingDto.CancelForm form = new MeetingBookingDto.CancelForm();
        form.setReason("參会人出差");
        form.setVersion(stored.getVersion());
        service.cancel(63L, form);

        verify(bookingMapper).update(ArgumentMatchers.<MeetingBooking>isNull(), any());
        verify(auditRecorder).recordBooking(eq(63L), any(), any(), eq(MeetingConstants.EVENT_CANCEL),
                eq("參会人出差"), any(), any(), eq(ORGANIZER), isNull());
        verify(notifyDispatcher).enqueue(any(), eq(MeetingConstants.NOTIFY_EVT_CANCELLED),
                eq(MeetingConstants.SCENARIO_INVITE), any(), any());
    }

    @Test
    @DisplayName("终态单不可再次取消：状态机白名单优先于任何入口")
    void cancelledBookingCannotBeCancelledAgain() {
        MeetingBooking stored = booking(64L, MeetingConstants.STATUS_CANCELLED, ORGANIZER.getId());
        when(bookingMapper.selectForUpdate(64L)).thenReturn(stored);
        when(guard.currentUser()).thenReturn(ORGANIZER);

        MeetingBookingDto.CancelForm form = new MeetingBookingDto.CancelForm();
        form.setReason("再取消一次");
        form.setVersion(stored.getVersion());

        BusinessException ex = assertThrows(BusinessException.class, () -> service.cancel(64L, form));
        assertTrue(ex.getMessage().contains("不可取消"), ex.getMessage());
        verify(bookingMapper, never()).update(ArgumentMatchers.<MeetingBooking>isNull(), any());
    }

    /* ==================== 规则联动 ==================== */

    @Test
    @DisplayName("容量校验以服务端统计的人数为准（含组织者与外部人员）")
    void capacityUsesFullHeadcount() {
        MeetingBookingDto.CreateForm form = createForm("k-cap");
        form.setExternalAttendees(List.of("訪客甲", "訪客乙"));
        service.create(form);

        ArgumentCaptor<Integer> count = ArgumentCaptor.forClass(Integer.class);
        // 手工新建走带全局规则快照 + enforceAdvanceDays=true 的重载：一次请求只读一次配置，
        // 且"最远可订天数"必须仍然生效（周期物化才关掉它）
        verify(ruleService).validate(any(MeetingRoom.class), any(), any(), count.capture(),
                any(MeetingRuleService.GlobalRule.class), eq(true));
        assertEquals(4, count.getValue(), "組織者 1 + 必參 1 + 外部 2");
    }

    @Test
    @DisplayName("bizType 白名单之外的取值被拒，不写入未知枚举")
    void unknownBizTypeIsRejected() {
        MeetingBookingDto.CreateForm form = createForm("k-biz");
        form.setBizType("secret_meeting");
        assertThrows(BusinessException.class, () -> service.create(form));
        verify(bookingMapper, never()).insert(any(MeetingBooking.class));
    }

    @Test
    @DisplayName("非行政视野显式传 scope=all 也只拿到自己相关的单：范围由服务端解释")
    void nonAdminScopeAllDegradesToOwnData() {
        when(guard.canSeeAll(ORGANIZER)).thenReturn(false);
        when(attendeeMapper.findBookingIdsByUser(ORGANIZER.getId())).thenReturn(List.of());
        MeetingBookingDto.Query query = new MeetingBookingDto.Query();
        query.setScope("all");

        MeetingBookingDto.PageWithStats result = service.listWithStats(query);

        assertEquals(0L, result.getPage().getTotal().longValue());
        verify(bookingMapper, never()).selectPage(any(), any());
    }

    @Test
    @DisplayName("respond=pending 只看我未响应的邀约：没有待办时直接空页，不再打全量列表")
    void respondPendingShortCircuitsWhenNothingPending() {
        when(attendeeMapper.findBookingIdsByUser(ORGANIZER.getId())).thenReturn(List.of(5L, 6L));
        when(attendeeMapper.findPendingResponseBookingIds(ORGANIZER.getId())).thenReturn(List.of());
        MeetingBookingDto.Query query = new MeetingBookingDto.Query();
        query.setScope("attended");
        query.setRespond("pending");

        MeetingBookingDto.PageWithStats result = service.listWithStats(query);

        assertEquals(0L, result.getPage().getTotal().longValue());
        assertEquals(0L, result.getStats().getTotal());
        verify(bookingMapper, never()).selectPage(any(), any());
    }

    @Test
    @DisplayName("未知响应筛选值被拒：静默回落成不筛，等于把参数写错变成全量列表")
    void unknownRespondValueIsRejected() {
        MeetingBookingDto.Query query = new MeetingBookingDto.Query();
        query.setRespond("accepted");

        BusinessException ex = assertThrows(BusinessException.class, () -> service.listWithStats(query));
        assertTrue(ex.getMessage().contains("不支持的響應篩選"), ex.getMessage());
    }

    @Test
    @DisplayName("行政视野下 respond=pending 仍只看自己的邀约：响应是替自己表态，不是行政职权")
    void respondPendingStaysPersonalForAdmin() {
        when(guard.currentUser()).thenReturn(ADMIN);
        when(guard.canSeeAll(ADMIN)).thenReturn(true);
        when(attendeeMapper.findPendingResponseBookingIds(ADMIN.getId())).thenReturn(List.of(7L));
        Page<MeetingBooking> page = new Page<>(1, 20);
        page.setRecords(List.of());
        when(bookingMapper.selectPage(any(), any())).thenReturn(page);
        MeetingBookingDto.Query query = new MeetingBookingDto.Query();
        query.setScope("all");
        query.setRespond("pending");

        service.listWithStats(query);

        ArgumentCaptor<LambdaQueryWrapper<MeetingBooking>> captor = ArgumentCaptor.captor();
        verify(bookingMapper).selectPage(any(), captor.capture());
        // 行政视野本来是 Scope(null, null)（不限行），响应筛选必须把行范围换成自己的待响应名单
        assertTrue(captor.getValue().getTargetSql().contains("id IN"), captor.getValue().getTargetSql());
    }

    @Test
    @DisplayName("统计卡与列表同口径：status 与 group 也要进统计条件（AGENTS.md §E.8）")
    void statsFollowStatusAndGroupFilters() {
        when(guard.currentUser()).thenReturn(ADMIN);
        when(guard.canSeeAll(ADMIN)).thenReturn(true);
        Page<MeetingBooking> page = new Page<>(1, 20);
        page.setRecords(List.of());
        when(bookingMapper.selectPage(any(), any())).thenReturn(page);
        MeetingBookingDto.Query query = new MeetingBookingDto.Query();
        query.setScope("all");
        query.setStatus("cancelled");
        query.setGroup("done");

        service.listWithStats(query);

        ArgumentCaptor<String> statusCaptor = ArgumentCaptor.captor();
        ArgumentCaptor<String> groupCaptor = ArgumentCaptor.captor();
        // 旧版本这两个位置永远传 null：筛“已取消”得 13 条而卡片还写 17 条，
        // 「隨當前篩選條件变化」就是个假承诺
        verify(bookingMapper).countByStatus(any(), isNull(), isNull(), isNull(), isNull(), isNull(),
                statusCaptor.capture(), groupCaptor.capture(), isNull(), isNull(), isNull());
        assertEquals("cancelled", statusCaptor.getValue());
        assertEquals("done", groupCaptor.getValue());
    }

    /* ==================== 邀约投递契约 ==================== */

    @Test
    @DisplayName("场景已启用但没人可发：inviteQueued=false 而 scenarioActive=true")
    void createWithoutReceiversStillReportsScenarioActive() {
        // 只选了自己一人（没传参会人）时 enqueue 不建留痕行，queued/skipped 全为 0；
        // 旧契约只有 inviteQueued 一个字段，前端把它读成“场景未启用”，行政会被引去乱改通知配置
        when(userMapper.selectList(any())).thenReturn(List.of());
        MeetingNotifyDispatcher.EnqueueResult nothing = mock(MeetingNotifyDispatcher.EnqueueResult.class);
        when(nothing.isScenarioActive()).thenReturn(true);
        when(nothing.getQueued()).thenReturn(0);
        when(nothing.getSkipped()).thenReturn(0);
        when(notifyDispatcher.enqueue(any(), any(), any(), any(), any())).thenReturn(nothing);
        MeetingBookingDto.CreateForm form = createForm("k-no-receiver");
        form.setAttendeeUserIds(List.of());

        MeetingBookingDto.CreateResult result = service.create(form);

        assertEquals(Boolean.TRUE, result.getScenarioActive());
        assertEquals(Boolean.FALSE, result.getInviteQueued());
        assertEquals(0, result.getNotifySkippedCount());
    }

    @Test
    @DisplayName("场景真未启用时 scenarioActive=false：这是前端唯一能据此提示「去启用场景」的口径")
    void createReportsScenarioInactive() {
        MeetingNotifyDispatcher.EnqueueResult off = mock(MeetingNotifyDispatcher.EnqueueResult.class);
        when(off.isScenarioActive()).thenReturn(false);
        when(notifyDispatcher.enqueue(any(), any(), any(), any(), any())).thenReturn(off);

        MeetingBookingDto.CreateResult result = service.create(createForm("k-scenario-off"));

        assertEquals(Boolean.FALSE, result.getScenarioActive());
        assertEquals(Boolean.FALSE, result.getInviteQueued());
    }

    @Test
    @DisplayName("幂等重放不重新登记投递，但场景状态必须回查当前配置而不是写死 false")
    void replayReportsLiveScenarioState() {
        MeetingBooking existing = booking(79L, MeetingConstants.STATUS_BOOKED, ORGANIZER.getId());
        existing.setRequestKey("k-idem2");
        MeetingBookingDto.CreateForm form = createForm("k-idem2");
        existing.setRequestHash(hashOf(form));
        when(bookingMapper.findByIdempotencyKey(ORGANIZER.getId(), "k-idem2")).thenReturn(existing);
        when(notifyDispatcher.scenarioActive(MeetingConstants.SCENARIO_INVITE)).thenReturn(true);

        MeetingBookingDto.CreateResult result = service.create(form);

        assertEquals(Boolean.TRUE, result.getScenarioActive());
        assertEquals(Boolean.FALSE, result.getInviteQueued());
        verify(notifyDispatcher, never()).enqueue(any(), any(), any(), any(), any());
    }
}
