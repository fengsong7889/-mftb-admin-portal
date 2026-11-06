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
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 外部参会人名单同步与容量口径测试（会议域）。
 *
 * <p>锁定的都是"写错就会污染事实"的判断：
 * <ol>
 *   <li><b>重复累积</b>：旧 {@code syncAttendees} 的 existing 索引只收 {@code userId != null} 的行，
 *       外部人 userId 恒为 NULL，于是每次编辑都把整份外部名单再插一遍、且永远删不掉旧行。
 *       2026-11-06 E2E 实测一场 6 人的会被编辑两次后明细积到 10 行，
 *       详情页「共 10 人」与「参会人数 6 人」同屏打架。</li>
 *   <li><b>两套上限</b>：明细行按 50 截条数、顿号快照按 500 字符截断且不限条数，
 *       100 人提交时行存 50、快照存 85、attendee_count=51 三个数互相矛盾，
 *       而前端编辑回填读的正是快照 → 每改一次名单飘一次。</li>
 * </ol>
 */
class MeetingAttendeeSyncTest {

    private static final SysUser ORGANIZER = user(100L, "MF00100", "張三");
    private static final SysUser ATTENDEE = user(200L, "MF00200", "李四");

    private MeetingBookingMapper bookingMapper;
    private MeetingAttendeeMapper attendeeMapper;
    private SysUserMapper userMapper;
    private MeetingRuleService ruleService;
    private MeetingBookingServiceImpl service;

    private static SysUser user(long id, String empId, String name) {
        SysUser u = new SysUser();
        u.setId(id);
        u.setEmpId(empId);
        u.setName(name);
        u.setUsername(name);
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
        attendeeMapper = mock(MeetingAttendeeMapper.class);
        userMapper = mock(SysUserMapper.class);
        ruleService = mock(MeetingRuleService.class);
        MeetingAccessGuard guard = mock(MeetingAccessGuard.class);
        MeetingRoomMapper roomMapper = mock(MeetingRoomMapper.class);
        MeetingEventMapper eventMapper = mock(MeetingEventMapper.class);
        MeetingNotifyLogMapper notifyMapper = mock(MeetingNotifyLogMapper.class);
        MeetingMinutesMapper minutesMapper = mock(MeetingMinutesMapper.class);
        MeetingAuditRecorder auditRecorder = mock(MeetingAuditRecorder.class);
        MeetingNotifyDispatcher notifyDispatcher = mock(MeetingNotifyDispatcher.class);
        MeetingBlacklistService blacklistService = mock(MeetingBlacklistService.class);
        BizSeqService bizSeqService = mock(BizSeqService.class);
        service = new MeetingBookingServiceImpl(bookingMapper, roomMapper, attendeeMapper, eventMapper,
                notifyMapper, minutesMapper, userMapper, guard, ruleService, auditRecorder, notifyDispatcher,
                blacklistService, bizSeqService);

        when(guard.currentUser()).thenReturn(ORGANIZER);
        MeetingRuleService.GlobalRule global = mock(MeetingRuleService.GlobalRule.class);
        when(global.getGranularityMinutes()).thenReturn(15);
        when(global.getMaxDurationMinutes()).thenReturn(240);
        when(global.getBookableStart()).thenReturn(java.time.LocalTime.of(8, 0));
        when(global.getBookableEnd()).thenReturn(java.time.LocalTime.of(22, 0));
        when(ruleService.globalRule()).thenReturn(global);
        when(roomMapper.selectForUpdate(1L)).thenReturn(room());
        when(bookingMapper.selectForUpdate(50L)).thenReturn(booking());
        when(bookingMapper.update(isNull(), any())).thenReturn(1);
        when(bookingMapper.selectById(50L)).thenReturn(booking());
        when(userMapper.selectById(ORGANIZER.getId())).thenReturn(ORGANIZER);
        when(userMapper.selectList(any())).thenReturn(List.of(ATTENDEE));
    }

    private MeetingRoom room() {
        MeetingRoom r = new MeetingRoom();
        r.setId(1L);
        r.setRoomNo("MR-1F-01");
        r.setRoomName("會議室 A");
        r.setCapacity(8);
        r.setStatus(MeetingConstants.ROOM_ACTIVE);
        r.setBookable(1);
        return r;
    }

    private MeetingBooking booking() {
        MeetingBooking b = new MeetingBooking();
        b.setId(50L);
        b.setBookingNo("MT202611060001");
        b.setTitle("例會");
        b.setStatus(MeetingConstants.STATUS_BOOKED);
        b.setRoomId(1L);
        b.setOrganizerId(ORGANIZER.getId());
        b.setOrganizerName(ORGANIZER.getName());
        b.setStartTime(LocalDateTime.now().plusDays(1));
        b.setEndTime(b.getStartTime().plusHours(1));
        b.setVersion(0);
        return b;
    }

    private static MeetingAttendee externalRow(long id, String name) {
        MeetingAttendee row = new MeetingAttendee();
        row.setId(id);
        row.setBookingId(50L);
        row.setName(name);
        row.setAttendeeType(MeetingConstants.ATTENDEE_EXTERNAL);
        row.setResponse(MeetingConstants.RESPOND_ACCEPTED);
        return row;
    }

    private static MeetingAttendee userRow(long id, long userId, String name) {
        MeetingAttendee row = new MeetingAttendee();
        row.setId(id);
        row.setBookingId(50L);
        row.setUserId(userId);
        row.setName(name);
        row.setAttendeeType(MeetingConstants.ATTENDEE_REQUIRED);
        return row;
    }

    private MeetingBookingDto.UpdateForm updateForm(List<String> externals) {
        MeetingBookingDto.UpdateForm form = new MeetingBookingDto.UpdateForm();
        form.setTitle("例會（变更）");
        form.setRoomId(1L);
        form.setStartTime(LocalDateTime.now().plusDays(1));
        form.setEndTime(form.getStartTime().plusHours(1));
        form.setAttendeeUserIds(List.of(ATTENDEE.getId()));
        form.setExternalAttendees(externals);
        form.setBizType(MeetingConstants.BIZ_GENERAL);
        form.setVersion(0);
        return form;
    }

    /* ==================== 重复累积（P1-2） ==================== */

    @Test
    @DisplayName("编辑保存不重复插外部人：同名第二次保存走保留而不是再插一行")
    void secondSaveDoesNotDuplicateExternalRows() {
        // 库里已有组织者 + 1 位必参 + 1 位外部人（id=74）
        when(attendeeMapper.findByBooking(50L)).thenReturn(List.of(
                userRow(70L, ORGANIZER.getId(), ORGANIZER.getName()),
                userRow(71L, ATTENDEE.getId(), ATTENDEE.getName()),
                externalRow(74L, "外部訪客張三")));

        service.update(50L, updateForm(List.of("外部訪客張三")));

        // 外部人已存在 → 一条 insert 都不该发生（旧实现这里每次都插，编辑两次就积出三份）
        ArgumentCaptor<MeetingAttendee> inserted = ArgumentCaptor.forClass(MeetingAttendee.class);
        verify(attendeeMapper, never()).insert(inserted.capture());
        // 也不该被当成"被移出的人"删掉
        verify(attendeeMapper, never()).deleteById(74L);
    }

    @Test
    @DisplayName("移出外部人必须删行：旧实现的删除分支只遍历 userId 索引，外部行走不到")
    void removedExternalRowIsDeleted() {
        when(attendeeMapper.findByBooking(50L)).thenReturn(List.of(
                userRow(70L, ORGANIZER.getId(), ORGANIZER.getName()),
                userRow(71L, ATTENDEE.getId(), ATTENDEE.getName()),
                externalRow(74L, "外部訪客張三"),
                externalRow(75L, "外部候選人李四")));

        // 这次只保留「外部候選人李四」
        service.update(50L, updateForm(List.of("外部候選人李四")));

        verify(attendeeMapper).deleteById(74L);
        verify(attendeeMapper, never()).deleteById(75L);
    }

    @Test
    @DisplayName("历史脏数据自愈：同名的重复外部行只留 id 最小的一行，其余删除")
    void duplicateExternalRowsSelfHeal() {
        // E2E 实测形态：一场会被编辑两次后，同一姓名积出 74/82/84 三行
        when(attendeeMapper.findByBooking(50L)).thenReturn(List.of(
                userRow(70L, ORGANIZER.getId(), ORGANIZER.getName()),
                userRow(71L, ATTENDEE.getId(), ATTENDEE.getName()),
                externalRow(84L, "外部訪客張三"),
                externalRow(74L, "外部訪客張三"),
                externalRow(82L, "外部訪客張三")));

        service.update(50L, updateForm(List.of("外部訪客張三")));

        verify(attendeeMapper).deleteById(82L);
        verify(attendeeMapper).deleteById(84L);
        verify(attendeeMapper, never()).deleteById(74L);
        verify(attendeeMapper, never()).insert(any(MeetingAttendee.class));
    }

    @Test
    @DisplayName("新增外部人才插行，且按姓名快照对齐（不受顺序变化影响）")
    void newExternalNameIsInsertedOnce() {
        when(attendeeMapper.findByBooking(50L)).thenReturn(List.of(
                userRow(70L, ORGANIZER.getId(), ORGANIZER.getName()),
                userRow(71L, ATTENDEE.getId(), ATTENDEE.getName()),
                externalRow(74L, "甲")));

        service.update(50L, updateForm(List.of("乙", "甲")));

        ArgumentCaptor<MeetingAttendee> inserted = ArgumentCaptor.forClass(MeetingAttendee.class);
        verify(attendeeMapper, times(1)).insert(inserted.capture());
        assertEquals("乙", inserted.getValue().getName());
        verify(attendeeMapper, never()).deleteById(74L);
    }

    /* ==================== 容量口径（P2-7） ==================== */

    @Test
    @DisplayName("超上限明确拒绝，不静默截断：组织者必须知道少了人")
    void overLimitIsRejectedNotTruncated() {
        List<String> names = java.util.stream.IntStream.rangeClosed(1, MeetingConstants.MAX_EXTERNAL_ATTENDEES + 1)
                .mapToObj(i -> "EXT" + i).toList();

        BusinessException ex = assertThrows(BusinessException.class,
                () -> MeetingBookingServiceImpl.normalizeExternalNames(names));
        assertTrue(ex.getMessage().contains(String.valueOf(MeetingConstants.MAX_EXTERNAL_ATTENDEES)),
                ex.getMessage());
    }

    @Test
    @DisplayName("上限内全量名单顿号快照不被截断：快照与明细行必须表达同一批人")
    void snapshotHoldsEveryNameWithinLimit() {
        List<String> names = java.util.stream.IntStream.rangeClosed(1, MeetingConstants.MAX_EXTERNAL_ATTENDEES)
                .mapToObj(i -> "EXT" + i).toList();

        String snapshot = MeetingBookingServiceImpl.joinExternal(names);

        assertTrue(snapshot != null && snapshot.length() <= MeetingConstants.EXTERNAL_SNAPSHOT_MAX,
                "上限内的合法名单必须能被快照列完整容纳，否则又要回到分叉状态");
        assertEquals(names.size(), snapshot.split("、").length);
    }

    @Test
    @DisplayName("满长度姓名也不超列宽：预算按 50 人 × 64 字 + 49 个顿号算")
    void longestNamesStillFit() {
        List<String> names = java.util.stream.IntStream.rangeClosed(1, MeetingConstants.MAX_EXTERNAL_ATTENDEES)
                .mapToObj(i -> "名".repeat(MeetingConstants.EXTERNAL_NAME_MAX - 2) + i).toList();

        String snapshot = MeetingBookingServiceImpl.joinExternal(names);

        assertTrue(snapshot.length() <= MeetingConstants.EXTERNAL_SNAPSHOT_MAX,
                "实际 " + snapshot.length() + " 已超列宽 " + MeetingConstants.EXTERNAL_SNAPSHOT_MAX);
        assertEquals(MeetingConstants.MAX_EXTERNAL_ATTENDEES, snapshot.split("、").length);
    }

    @Test
    @DisplayName("单名超列宽直接拒绝，不剪短：剪短后两个共享前缀的长名字会变成同一个「人」")
    void overlongNameIsRejectedNotTruncated() {
        String tooLong = "名".repeat(MeetingConstants.EXTERNAL_NAME_MAX + 1);

        BusinessException ex = assertThrows(BusinessException.class,
                () -> MeetingBookingServiceImpl.normalizeExternalNames(List.of(tooLong)));
        assertTrue(ex.getMessage().contains(String.valueOf(MeetingConstants.EXTERNAL_NAME_MAX)), ex.getMessage());
    }

    @Test
    @DisplayName("归一化去空白、trim、去重、保序")
    void normalizationDeduplicatesAndTrims() {
        // List.of 不收 null，用 Arrays.asList 才能把 null 混进去（前端 tags 理论上不会出现 null，
        // 但服务端必须对脏输入不抛 NPE）
        assertEquals(List.of("甲", "乙"),
                MeetingBookingServiceImpl.normalizeExternalNames(java.util.Arrays.asList(" 甲 ", "甲", "", null, "乙")));
        assertEquals(List.of(), MeetingBookingServiceImpl.normalizeExternalNames(List.of()));
        assertEquals(List.of(), MeetingBookingServiceImpl.normalizeExternalNames(null));
    }

    @Test
    @DisplayName("null 名单落库为 null 而不是空串：避免与「清空外部名单」混淆")
    void emptySnapshotIsNull() {
        assertEquals(null, MeetingBookingServiceImpl.joinExternal(List.of()));
        assertEquals(null, MeetingBookingServiceImpl.joinExternal(null));
    }

    @Test
    @DisplayName("快照与明细行同源：同一次提交两处算出的名单逐字一致")
    void snapshotAndRowsAgreeOnSave() {
        when(attendeeMapper.findByBooking(50L)).thenReturn(List.of(
                userRow(70L, ORGANIZER.getId(), ORGANIZER.getName()),
                userRow(71L, ATTENDEE.getId(), ATTENDEE.getName())));

        service.update(50L, updateForm(List.of("甲", "甲 ", " 甲", "乙")));

        // 去重后只剩 2 个外部人 → 插 2 行
        ArgumentCaptor<MeetingAttendee> inserted = ArgumentCaptor.forClass(MeetingAttendee.class);
        verify(attendeeMapper, times(2)).insert(inserted.capture());
        List<String> insertedNames = inserted.getAllValues().stream().map(MeetingAttendee::getName).toList();
        assertEquals(List.of("甲", "乙"), insertedNames);
        // 快照必须与刚插进去的姓名集合完全一致（旧实现一个截条数一个截字符，两边算不同结果）
        assertEquals(String.join("、", insertedNames),
                MeetingBookingServiceImpl.joinExternal(List.of("甲", "甲 ", " 甲", "乙")));
    }
}
