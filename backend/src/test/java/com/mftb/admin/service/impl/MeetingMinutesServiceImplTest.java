package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.MeetingConstants;
import com.mftb.admin.dto.MeetingMinutesContent;
import com.mftb.admin.dto.MeetingMinutesDto;
import com.mftb.admin.entity.MeetingAttendee;
import com.mftb.admin.entity.MeetingBooking;
import com.mftb.admin.entity.MeetingMinutes;
import com.mftb.admin.entity.MeetingMinutesSend;
import com.mftb.admin.entity.SysNotificationChannel;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.MeetingAttendeeMapper;
import com.mftb.admin.mapper.MeetingBookingMapper;
import com.mftb.admin.mapper.MeetingMinutesDeliveryMapper;
import com.mftb.admin.mapper.MeetingMinutesItemMapper;
import com.mftb.admin.mapper.MeetingMinutesLinkMapper;
import com.mftb.admin.mapper.MeetingMinutesMapper;
import com.mftb.admin.mapper.MeetingMinutesSendMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.MeetingAccessGuard;
import com.mftb.admin.service.MeetingAuditRecorder;
import com.mftb.admin.service.DingTalkService;
import com.mftb.admin.service.MeetingMinutesDispatcher;
import com.mftb.admin.service.MeetingNotifyTemplateService;
import com.mftb.admin.service.NotificationAppService;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.JsonUtils;
import com.mftb.admin.util.MinutesViewTokenUtil;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 纪要服务的权限与写入口径测试。
 *
 * <p>覆盖的都是"写错就会造成事实性错误"的判断：谁能替谁记纪要、记录人能不能被前端伪造、
 * 行动项负责人姓名是谁写的、乐观锁是否真挡得住并发覆盖、没有目标时是否拒绝发送、
 * 作废链接后旧令牌是否真的读不到、被单独发送过的非参会人能不能看到自己收到的那一份。
 * 区间/阶段的 SQL 侧由结构锁用例守住，这里锁服务层结论。
 */
class MeetingMinutesServiceImplTest {

    private static final SysUser ORGANIZER = user(1L, "MF00001", "王五");
    private static final SysUser RECORDER = user(2L, "MF00002", "李四");
    private static final SysUser STRANGER = user(3L, "MF00003", "赵六");
    private static final SysUser OWNER_OF_ACTION = user(7L, "MF00007", "張三");

    private MeetingMinutesMapper minutesMapper;
    private MeetingMinutesSendMapper sendMapper;
    private MeetingMinutesDeliveryMapper deliveryMapper;
    private MeetingBookingMapper bookingMapper;
    private MeetingAttendeeMapper attendeeMapper;
    private SysUserMapper userMapper;
    private MeetingMinutesItemMapper itemMapper;
    private MeetingMinutesLinkMapper linkMapper;
    private MeetingNotifyTemplateService templateService;
    private JdbcTemplate jdbc;
    private MeetingAccessGuard guard;
    private MeetingAuditRecorder audit;
    private MeetingMinutesDispatcher dispatcher;
    private NotificationAppService appService;
    private BizSeqService bizSeqService;
    private MeetingMinutesServiceImpl service;

    @BeforeAll
    static void initTableMetadata() {
        for (Class<?> entity : List.of(MeetingBooking.class, MeetingAttendee.class, MeetingMinutes.class,
                MeetingMinutesSend.class, SysUser.class)) {
            TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), ""), entity);
        }
    }

    private static NotificationAppService.Credentials app(long id) {
        return new NotificationAppService.Credentials(id, "app-key", "app-secret", "123",
                "https://admin.test", true);
    }

    private static SysUser user(long id, String empId, String name) {
        SysUser u = new SysUser();
        u.setId(id);
        u.setEmpId(empId);
        u.setName(name);
        u.setUsername(name);
        u.setDepartment("財務部");
        return u;
    }

    private static MeetingBooking booking(String status, LocalDateTime start, LocalDateTime end) {
        MeetingBooking booking = new MeetingBooking();
        booking.setId(100L);
        booking.setBookingNo("MT202610190001");
        booking.setTitle("Q4 預算復核");
        booking.setStatus(status);
        booking.setStartTime(start);
        booking.setEndTime(end);
        booking.setRoomId(9L);
        booking.setRoomName("三號會議室");
        booking.setRoomLocation("A 棟 3F");
        booking.setOrganizerId(ORGANIZER.getId());
        booking.setOrganizerName(ORGANIZER.getName());
        booking.setOrganizerEmpNo(ORGANIZER.getEmpId());
        return booking;
    }

    private static MeetingMinutes minutes(long id, long recorderId, int version, int tokenVersion) {
        MeetingMinutes minutes = new MeetingMinutes();
        minutes.setId(id);
        minutes.setMinutesNo("MJ202610190001");
        minutes.setBookingId(100L);
        minutes.setBookingNo("MT202610190001");
        minutes.setMeetingTitle("Q4 預算復核");
        minutes.setRecorderUserId(recorderId);
        minutes.setRecorderName("李四");
        minutes.setRecorderEmpNo("MF00002");
        minutes.setContentJson(JsonUtils.toJson(validContent()));
        minutes.setDigest("按營收分攤");
        minutes.setStatus(MeetingConstants.MINUTES_DRAFT);
        minutes.setSendCount(0);
        minutes.setTokenVersion(tokenVersion);
        minutes.setVersion(version);
        return minutes;
    }

    private static MeetingMinutesContent validContent() {
        MeetingMinutesContent content = new MeetingMinutesContent();
        MeetingMinutesContent.Item item = new MeetingMinutesContent.Item();
        item.setTopic("分攤口徑");
        item.setConclusion("按營收分攤");
        content.setItems(new ArrayList<>(List.of(item)));
        content.setActions(new ArrayList<>());
        content.setOpenIssues(new ArrayList<>());
        content.setAbsentees(new ArrayList<>());
        return content;
    }

    @BeforeEach
    void setUp() {
        minutesMapper = mock(MeetingMinutesMapper.class);
        sendMapper = mock(MeetingMinutesSendMapper.class);
        deliveryMapper = mock(MeetingMinutesDeliveryMapper.class);
        bookingMapper = mock(MeetingBookingMapper.class);
        attendeeMapper = mock(MeetingAttendeeMapper.class);
        userMapper = mock(SysUserMapper.class);
        itemMapper = mock(MeetingMinutesItemMapper.class);
        linkMapper = mock(MeetingMinutesLinkMapper.class);
        templateService = mock(MeetingNotifyTemplateService.class);
        jdbc = mock(JdbcTemplate.class);
        guard = mock(MeetingAccessGuard.class);
        audit = mock(MeetingAuditRecorder.class);
        dispatcher = mock(MeetingMinutesDispatcher.class);
        appService = mock(NotificationAppService.class);
        bizSeqService = mock(BizSeqService.class);
        itemMapper = mock(MeetingMinutesItemMapper.class);
        linkMapper = mock(MeetingMinutesLinkMapper.class);
        templateService = mock(MeetingNotifyTemplateService.class);
        // v1.1：默认全开；具体用例要测静音时再覆盖
        when(templateService.enabled(anyString(), anyString())).thenReturn(true);
        when(itemMapper.findByMinutes(anyLong())).thenReturn(List.of());
        when(itemMapper.findByMinutesIds(any())).thenReturn(List.of());
        when(linkMapper.findByMinutes(anyLong())).thenReturn(List.of());
        // 插入后回填主键：v1.1 的事项/关联写入要以纪要 id 为外键
        when(minutesMapper.insert(any(MeetingMinutes.class))).thenAnswer(invocation -> {
            MeetingMinutes inserted = invocation.getArgument(0);
            if (inserted.getId() == null) {
                inserted.setId(1L);
            }
            return 1;
        });
        service = new MeetingMinutesServiceImpl(minutesMapper, sendMapper, deliveryMapper, itemMapper, linkMapper,
                bookingMapper, attendeeMapper, userMapper, jdbc, guard, audit, dispatcher, templateService,
                mock(DingTalkService.class), appService, bizSeqService);
        ReflectionTestUtils.setField(service, "minutesEnabled", true);
        ReflectionTestUtils.setField(service, "tokenSecretConfig", "unit-test-secret");

        when(guard.currentUser()).thenReturn(RECORDER);
        when(bookingMapper.selectById(100L))
                .thenReturn(booking(MeetingConstants.STATUS_FINISHED, LocalDateTime.now().minusHours(3),
                        LocalDateTime.now().minusHours(2)));
        when(bizSeqService.next(MeetingConstants.SEQ_MINUTES)).thenReturn("MJ202610190001");
    }

    /* ==================== 录入范围 ==================== */

    @Test
    @DisplayName("与这场会无关、又不是行政的人不能录纪要")
    void unrelatedUserCannotRecord() {
        when(guard.currentUser()).thenReturn(STRANGER);
        when(guard.canOperateRecords(STRANGER)).thenReturn(false);
        when(guard.canRecordMinutes(STRANGER)).thenReturn(false);
        when(attendeeMapper.selectCount(any())).thenReturn(0L);

        MeetingMinutesDto.Form form = new MeetingMinutesDto.Form();
        form.setBookingId(100L);
        form.setContent(validContent());
        assertThrows(BusinessException.class, () -> service.create(form));
        verify(minutesMapper, never()).insert(any(MeetingMinutes.class));
    }

    @Test
    @DisplayName("参会人（持有使用侧 edit）可以给这场会记纪要，记录人取自登录态")
    void attendeeCanRecordAndRecorderComesFromJwt() {
        when(guard.canOperateRecords(RECORDER)).thenReturn(false);
        when(guard.canRecordMinutes(RECORDER)).thenReturn(true);
        when(attendeeMapper.selectCount(any())).thenReturn(1L);
        when(minutesMapper.findByBooking(100L)).thenReturn(null);

        MeetingMinutesDto.Form form = new MeetingMinutesDto.Form();
        form.setBookingId(100L);
        form.setContent(validContent());
        form.setRequestKey("mm-1");
        service.create(form);

        ArgumentCaptor<MeetingMinutes> captor = ArgumentCaptor.forClass(MeetingMinutes.class);
        verify(minutesMapper).insert(captor.capture());
        MeetingMinutes saved = captor.getValue();
        assertEquals(RECORDER.getId(), saved.getRecorderUserId());
        assertEquals("MF00002", saved.getRecorderEmpNo());
        assertEquals(MeetingConstants.MINUTES_DRAFT, saved.getStatus());
        assertNotNull(saved.getMinutesNo());
        // 会议資訊取的是会议单快照，不是前端回传值（前端改标题不会改写纪要来源）
        assertEquals("MT202610190001", saved.getBookingNo());
        assertTrue(saved.getMeetingTimeText().contains("Q4") || saved.getMeetingTimeText().length() > 10);
    }

    @Test
    @DisplayName("这场会已有纪要时拒绝再建一条：并列纪要等于没人说得清哪条是结论")
    void rejectsSecondMinutesForSameBooking() {
        when(guard.canRecordMinutes(RECORDER)).thenReturn(true);
        when(attendeeMapper.selectCount(any())).thenReturn(1L);
        when(minutesMapper.findByBooking(100L)).thenReturn(minutes(5L, RECORDER.getId(), 0, 0));

        MeetingMinutesDto.Form form = new MeetingMinutesDto.Form();
        form.setBookingId(100L);
        form.setContent(validContent());
        assertThrows(BusinessException.class, () -> service.create(form));
        verify(minutesMapper, never()).insert(any(MeetingMinutes.class));
    }

    @Test
    @DisplayName("未开始的会议不给录纪要（需求口径是会议结束后记录）")
    void rejectsBookingThatHasNotStarted() {
        when(bookingMapper.selectById(100L)).thenReturn(booking(MeetingConstants.STATUS_BOOKED,
                LocalDateTime.now().plusDays(1), LocalDateTime.now().plusDays(1).plusHours(1)));
        when(guard.canRecordMinutes(RECORDER)).thenReturn(true);
        when(attendeeMapper.selectCount(any())).thenReturn(1L);

        MeetingMinutesDto.Form form = new MeetingMinutesDto.Form();
        form.setBookingId(100L);
        form.setContent(validContent());
        assertThrows(BusinessException.class, () -> service.create(form));
    }

    /* ==================== 负责人快照 ==================== */

    @Test
    @DisplayName("行动项负责人姓名与工号由服务端回查，前端自报的名字一律作废")
    void actionOwnerSnapshotIsResolvedServerSide() {
        when(guard.canRecordMinutes(RECORDER)).thenReturn(true);
        when(attendeeMapper.selectCount(any())).thenReturn(1L);
        when(userMapper.selectList(any())).thenReturn(List.of(OWNER_OF_ACTION));
        when(userMapper.selectBatchIds(any())).thenReturn(List.of(OWNER_OF_ACTION));

        MeetingMinutesContent content = validContent();
        MeetingMinutesContent.Action action = new MeetingMinutesContent.Action();
        action.setContent("輸出明細");
        action.setOwnerUserId(7L);
        action.setOwnerName("偽造的名字");
        action.setOwnerEmpNo("FAKE001");
        content.setActions(new ArrayList<>(List.of(action)));

        MeetingMinutesDto.Form form = new MeetingMinutesDto.Form();
        form.setBookingId(100L);
        form.setContent(content);
        service.create(form);

        verify(itemMapper).upsertRow(eq(1L), eq(100L), eq("ACTION"), eq(1), eq("輸出明細"),
                eq(7L), eq("張三"), eq("MF00007"), isNull());
    }

    @Test
    @DisplayName("负责人不存在时拒绝，而不是留下一个查无此人的行动项")
    void rejectsUnknownActionOwner() {
        when(guard.canRecordMinutes(RECORDER)).thenReturn(true);
        when(attendeeMapper.selectCount(any())).thenReturn(1L);
        when(userMapper.selectList(any())).thenReturn(List.of());

        MeetingMinutesContent content = validContent();
        MeetingMinutesContent.Action action = new MeetingMinutesContent.Action();
        action.setContent("輸出明細");
        action.setOwnerUserId(999L);
        content.setActions(new ArrayList<>(List.of(action)));

        MeetingMinutesDto.Form form = new MeetingMinutesDto.Form();
        form.setBookingId(100L);
        form.setContent(content);
        assertThrows(BusinessException.class, () -> service.create(form));
    }

    /* ==================== 乐观锁 ==================== */

    @Test
    @DisplayName("版本不一致时拒绝编辑，不做静默覆盖")
    void updateRejectsStaleVersion() {
        MeetingMinutes existing = minutes(5L, RECORDER.getId(), 3, 0);
        when(minutesMapper.selectById(5L)).thenReturn(existing);

        MeetingMinutesDto.Form form = new MeetingMinutesDto.Form();
        form.setContent(validContent());
        form.setVersion(2);
        BusinessException error = assertThrows(BusinessException.class, () -> service.update(5L, form));
        assertTrue(error.getMessage().contains("刷新"), error.getMessage());
        verify(minutesMapper, never()).update(any(), any());
    }

    @Test
    @DisplayName("非记录人、非组织者且非行政不能改别人的纪要")
    void onlyRecorderOrganizerOrAdminCanEdit() {
        when(guard.currentUser()).thenReturn(STRANGER);
        when(minutesMapper.selectById(5L)).thenReturn(minutes(5L, RECORDER.getId(), 0, 0));
        when(guard.isOrganizer(any(), eq(STRANGER))).thenReturn(false);
        when(guard.canOperateRecords(STRANGER)).thenReturn(false);

        MeetingMinutesDto.Form form = new MeetingMinutesDto.Form();
        form.setContent(validContent());
        form.setVersion(0);
        assertThrows(BusinessException.class, () -> service.update(5L, form));
        verify(minutesMapper, never()).update(any(), any());
    }

    /* ==================== 发送 ==================== */

    @Test
    @DisplayName("既没选群也没选收件人时拒绝发送：没有目标的发送只会留一条空批次")
    void sendRequiresTarget() {
        when(minutesMapper.selectById(5L)).thenReturn(minutes(5L, RECORDER.getId(), 0, 0));
        when(guard.isOrganizer(any(), eq(RECORDER))).thenReturn(true);

        MeetingMinutesDto.SendForm form = new MeetingMinutesDto.SendForm();
        form.setReceiverUserIds(List.of());
        form.setVersion(0);
        assertThrows(BusinessException.class, () -> service.send(5L, form));
        verify(sendMapper, never()).insert(any(MeetingMinutesSend.class));
    }

    @Test
    @DisplayName("前端传的群渠道不可用时拒绝，而不是回退到默认群")
    void sendRejectsUnusableChannel() {
        when(minutesMapper.selectById(5L)).thenReturn(minutes(5L, RECORDER.getId(), 0, 0));
        when(guard.isOrganizer(any(), eq(RECORDER))).thenReturn(true);
        when(dispatcher.usableChannel(88L)).thenReturn(null);

        MeetingMinutesDto.SendForm form = new MeetingMinutesDto.SendForm();
        form.setGroupChannelId(88L);
        form.setReceiverUserIds(List.of());
        form.setVersion(0);
        assertThrows(BusinessException.class, () -> service.send(5L, form));
    }

    @Test
    @DisplayName("纪要版本已过期时拒绝发送：不能把“别人刚改过而自己没看到”的正文发出去")
    void sendRejectsStaleVersion() {
        when(minutesMapper.selectById(5L)).thenReturn(minutes(5L, RECORDER.getId(), 4, 0));
        when(guard.isOrganizer(any(), eq(RECORDER))).thenReturn(true);

        MeetingMinutesDto.SendForm form = new MeetingMinutesDto.SendForm();
        form.setReceiverUserIds(List.of(7L));
        form.setVersion(2);
        assertThrows(BusinessException.class, () -> service.send(5L, form));
        verify(sendMapper, never()).insert(any(MeetingMinutesSend.class));
    }

    @Test
    @DisplayName("发送成功时批次带内容快照与批次号，卡片正文由快照渲染")
    void sendPersistsBatchWithSnapshot() {
        MeetingMinutes existing = minutes(5L, RECORDER.getId(), 0, 0);
        when(minutesMapper.selectById(5L)).thenReturn(existing);
        when(guard.isOrganizer(any(), eq(RECORDER))).thenReturn(true);
        SysNotificationChannel channel = new SysNotificationChannel();
        channel.setId(88L);
        channel.setName("行政通知群");
        channel.setChannel("dingtalk");
        channel.setEnabled(1);
        when(dispatcher.usableChannel(88L)).thenReturn(channel);
        when(sendMapper.nextBatchSeq(5L)).thenReturn(1);
        // 绑定了带站点地址的企业应用：卡片才能附绝对链接（没配置时不附链接，由前端用自己的 origin 兜底）
        when(appService.resolve(MeetingConstants.SCENARIO_MINUTES)).thenReturn(app(1L));
        when(sendMapper.insert(any(MeetingMinutesSend.class))).thenAnswer(invocation -> {
            MeetingMinutesSend row = invocation.getArgument(0);
            row.setId(77L);
            return 1;
        });
        MeetingMinutesDispatcher.RegisterResult registered = new MeetingMinutesDispatcher.RegisterResult();
        when(dispatcher.register(any(), any(), any())).thenReturn(registered);

        MeetingMinutesDto.SendForm form = new MeetingMinutesDto.SendForm();
        form.setGroupChannelId(88L);
        form.setReceiverUserIds(List.of(7L));
        form.setRequestKey("mms-1");
        form.setVersion(0);
        MeetingMinutesDto.SendResult result = service.send(5L, form);

        ArgumentCaptor<MeetingMinutesSend> captor = ArgumentCaptor.forClass(MeetingMinutesSend.class);
        verify(sendMapper).insert(captor.capture());
        MeetingMinutesSend batch = captor.getValue();
        assertEquals(1, batch.getBatchSeq().intValue());
        assertEquals("行政通知群", batch.getGroupChannelName());
        assertEquals(1, batch.getReceiverCount().intValue());
        assertNotNull(batch.getContentSnapshot());
        // 内容快照与纪要正文同源：纪要后来被改，这一批发出去的那一版仍要能自证
        assertNotNull(JsonUtils.parse(batch.getContentSnapshot(), MeetingMinutesContent.class));
        assertEquals(77L, result.getSendId());
        assertNotNull(result.getViewUrl());
        assertTrue(result.getViewUrl().startsWith("/meeting-minutes-view?token="), result.getViewUrl());
        // 到期时间必须抹到整秒：它是令牌 payload 的一部分，带毫秒时存库丢位，
        // 发送历史里重算的链接就会与卡片里那条不一致（用户复制不到自己点开的同一链接）
        assertEquals(0, batch.getLinkExpireAt().getNano());
        String issuedToken = result.getViewUrl().substring(result.getViewUrl().indexOf("token="));
        assertTrue(batch.getMarkdownSnapshot().contains(issuedToken), "卡片里的链接应与页面可重算出的同一条");
        assertTrue(batch.getMarkdownSnapshot().contains("https://admin.test/#/meeting-minutes-view?token="),
                batch.getMarkdownSnapshot());
        verify(minutesMapper).markSent(eq(5L), any(LocalDateTime.class));
    }

    /* ==================== 免登与作废 ==================== */

    @Test
    @DisplayName("纪要当前令牌版本被抬升后，旧批次链接一律读不到内容")
    void publicViewRejectsRevokedToken() {
        MeetingMinutes current = minutes(5L, RECORDER.getId(), 0, 2);
        when(minutesMapper.selectById(5L)).thenReturn(current);
        MeetingMinutesSend batch = new MeetingMinutesSend();
        batch.setId(77L);
        batch.setMinutesId(5L);
        batch.setTokenVersion(1);
        batch.setLinkExpireAt(LocalDateTime.now().plusDays(10));
        batch.setContentSnapshot(JsonUtils.toJson(validContent()));
        when(sendMapper.selectById(77L)).thenReturn(batch);

        String token = MinutesViewTokenUtil.generate(5L, 77L, 1, LocalDateTime.now().plusDays(10), "unit-test-secret");
        MeetingMinutesDto.PublicView view = service.publicView(token);
        assertFalse(view.isValid());
        assertNotNull(view.getMessage());
    }

    @Test
    @DisplayName("未作废时免登页读到的是批次快照正文")
    void publicViewReadsBatchSnapshot() {
        MeetingMinutes current = minutes(5L, RECORDER.getId(), 0, 1);
        when(minutesMapper.selectById(5L)).thenReturn(current);
        MeetingMinutesSend batch = new MeetingMinutesSend();
        batch.setId(77L);
        batch.setMinutesId(5L);
        batch.setBatchSeq(1);
        batch.setTokenVersion(1);
        batch.setLinkExpireAt(LocalDateTime.now().plusDays(10));
        batch.setContentSnapshot(JsonUtils.toJson(validContent()));
        when(sendMapper.selectById(77L)).thenReturn(batch);

        String token = MinutesViewTokenUtil.generate(5L, 77L, 1, LocalDateTime.now().plusDays(10), "unit-test-secret");
        MeetingMinutesDto.PublicView view = service.publicView(token);
        assertTrue(view.isValid());
        assertEquals("按營收分攤", view.getContent().getItems().get(0).getConclusion());
        // 免登输出必须脱敏：不含手机号与投递明细
        assertNullFieldInView(view);
    }

    private void assertNullFieldInView(MeetingMinutesDto.PublicView view) {
        // 反射扫一遍，任何手机号形态的值出现即失败：免登链接可能被转发
        Object json = JsonUtils.toJson(view);
        String text = String.valueOf(json);
        assertFalse(text.matches(".*1[3-9]\\d{9}.*"), "免登視圖不得出現手機號：" + text);
        assertFalse(text.contains("webhook"), "免登視圖不得出現渠道配置：" + text);
    }

    @Test
    @DisplayName("纪要能力关闭时接口直接拒绝（入口隐藏不是安全边界）")
    void disabledFeatureRejectsEverything() {
        ReflectionTestUtils.setField(service, "minutesEnabled", false);
        assertThrows(BusinessException.class, () -> service.viewByBooking(100L));
        assertThrows(BusinessException.class, () -> service.groupOptions());
    }

    @Test
    @DisplayName("契约：正文 JSON 里多带的 recorderUserId / organizerId 等未知字段一律被忽略，身份只从 JWT 取")
    void unknownIdentityFieldsInPayloadAreIgnored() {
        when(guard.canRecordMinutes(RECORDER)).thenReturn(true);
        when(attendeeMapper.selectCount(any())).thenReturn(1L);

        // 手写一段带非法身份字段的正文（模拟直连接口想把自己的“记录人”写成别人）
        MeetingMinutesContent content = JsonUtils.parse(
                "{\"items\":[{\"topic\":\"分攤口徑\",\"conclusion\":\"按營收\"}],"
                        + "\"actions\":[],\"openIssues\":[],\"absentees\":[],"
                        + "\"recorderUserId\":999,\"recorderName\":\"別人\",\"organizerId\":999}",
                MeetingMinutesContent.class);
        assertNotNull(content);
        // 类上没开未知字段报错，但也没有任何字段能承载它：身份列根本不存在于正文结构
        MeetingMinutesDto.Form form = new MeetingMinutesDto.Form();
        form.setBookingId(100L);
        form.setContent(content);
        service.create(form);

        ArgumentCaptor<MeetingMinutes> captor = ArgumentCaptor.forClass(MeetingMinutes.class);
        verify(minutesMapper).insert(captor.capture());
        MeetingMinutes saved = captor.getValue();
        assertEquals(RECORDER.getId(), saved.getRecorderUserId());
        assertEquals("李四", saved.getRecorderName());
        assertFalse(saved.getContentJson().contains("recorderUserId"), "非法身份字段不得落进正文 JSON");
    }

    @Test
    @DisplayName("出参时间必须是服务端格式化好的字符串：JacksonConfig 会把 LocalDateTime 序列化成裸毫秒，页面会直接显示时间戳")
    void viewTimesAreFormattedStrings() {
        when(guard.canOperateRecords(RECORDER)).thenReturn(true);
        MeetingMinutes existing = minutes(5L, RECORDER.getId(), 0, 0);
        existing.setUpdatedAt(LocalDateTime.of(2026, 10, 20, 2, 30, 43));
        existing.setLastSendAt(LocalDateTime.of(2026, 10, 20, 2, 0, 0));
        when(minutesMapper.selectById(5L)).thenReturn(existing);

        MeetingMinutesDto.VO vo = service.view(5L);
        assertEquals("2026-10-20 02:30:43", vo.getUpdatedAt());
        assertEquals("2026-10-20 02:00:00", vo.getLastSendAt());
    }

    @Test
    @DisplayName("权限矩阵：非参会人但在这份纪要的发送名单里，站内只读可读")
    void sentNonAttendeeCanReadMinutes() {
        // 需求明确要“发给没参会的人”：若沿用会议详情的三重判定，被单独发送的人点开链接必然 403
        when(guard.currentUser()).thenReturn(STRANGER);
        when(minutesMapper.selectById(5L)).thenReturn(minutes(5L, RECORDER.getId(), 0, 0));
        org.mockito.Mockito.doThrow(new BusinessException("無權查看該會議"))
                .when(guard).requireBookingReadable(any(), eq(STRANGER));
        when(deliveryMapper.countSentToUser(5L, STRANGER.getId())).thenReturn(1);

        MeetingMinutesDto.VO vo = service.view(5L);
        assertTrue(vo.isExists());
        assertEquals("MJ202610190001", vo.getMinutesNo());
        // 只读：他能看，但不能改别人的纪要
        assertFalse(Boolean.TRUE.equals(vo.getCanEdit()));
    }

    @Test
    @DisplayName("非参会人且未被发送过：依旧读不到（不能把“可读范围”无限扩大）")
    void strangerWithoutDeliveryStillCannotRead() {
        when(guard.currentUser()).thenReturn(STRANGER);
        when(minutesMapper.selectById(5L)).thenReturn(minutes(5L, RECORDER.getId(), 0, 0));
        org.mockito.Mockito.doThrow(new BusinessException("無權查看該會議"))
                .when(guard).requireBookingReadable(any(), eq(STRANGER));
        when(deliveryMapper.countSentToUser(5L, STRANGER.getId())).thenReturn(0);

        assertThrows(BusinessException.class, () -> service.view(5L));
    }

    @Test
    @DisplayName("幂等重放：同键重发撞唯一键时回读已有纪要，而不是报系统错误或长出第二条")
    void createReplayReturnsExistingMinutes() {
        when(guard.canRecordMinutes(RECORDER)).thenReturn(true);
        when(attendeeMapper.selectCount(any())).thenReturn(1L);
        MeetingMinutes existing = minutes(5L, RECORDER.getId(), 0, 0);
        // 预查时还没有（并发窗口），insert 时撞键 → 回读到已存的那一条
        when(minutesMapper.findByBooking(100L)).thenReturn(null, existing);
        when(minutesMapper.insert(any(MeetingMinutes.class))).thenThrow(new DuplicateKeyException("dup"));

        MeetingMinutesDto.Form form = new MeetingMinutesDto.Form();
        form.setBookingId(100L);
        form.setContent(validContent());
        form.setRequestKey("mm-replay");
        MeetingMinutesDto.VO vo = service.create(form);

        assertTrue(vo.isExists());
        assertEquals(5L, vo.getId());
    }

    @Test
    @DisplayName("两人同时点发送：批次号撞唯一键时明确提示“处理中”，不静默覆盖对方的批次")
    void concurrentBatchSeqCollisionIsReported() {
        when(minutesMapper.selectById(5L)).thenReturn(minutes(5L, RECORDER.getId(), 0, 0));
        when(guard.isOrganizer(any(), eq(RECORDER))).thenReturn(true);
        when(sendMapper.nextBatchSeq(5L)).thenReturn(2);
        when(sendMapper.insert(any(MeetingMinutesSend.class))).thenThrow(new DuplicateKeyException("dup"));

        MeetingMinutesDto.SendForm form = new MeetingMinutesDto.SendForm();
        form.setReceiverUserIds(List.of(7L));
        form.setVersion(0);
        BusinessException error = assertThrows(BusinessException.class, () -> service.send(5L, form));
        assertTrue(error.getMessage().contains("處理中"), error.getMessage());
    }

    @Test
    @DisplayName("重发开新批次且快照各自独立：改正文不得追溯已发出去的那一版")
    void resendCreatesNewBatchWithOwnSnapshot() {
        MeetingMinutes existing = minutes(5L, RECORDER.getId(), 0, 0);
        when(minutesMapper.selectById(5L)).thenReturn(existing);
        when(guard.isOrganizer(any(), eq(RECORDER))).thenReturn(true);
        when(appService.resolve(MeetingConstants.SCENARIO_MINUTES)).thenReturn(app(1L));
        when(dispatcher.register(any(), any(), any())).thenReturn(new MeetingMinutesDispatcher.RegisterResult());
        // 两次发送拿到不同批次号（真实库里由 MAX(batch_seq)+1 递增），并各自存自己的 id
        when(sendMapper.nextBatchSeq(5L)).thenReturn(1, 2);
        final List<MeetingMinutesSend> inserted = new ArrayList<>();
        when(sendMapper.insert(any(MeetingMinutesSend.class))).thenAnswer(invocation -> {
            MeetingMinutesSend row = invocation.getArgument(0);
            row.setId((long) (inserted.size() + 1));
            inserted.add(row);
            return 1;
        });

        MeetingMinutesDto.SendForm first = new MeetingMinutesDto.SendForm();
        first.setReceiverUserIds(List.of(7L));
        first.setVersion(0);
        service.send(5L, first);

        // 两批之间把结论改掉（纪要可继续编辑），第二批必须带新正文而第一批的快照不能跟着变
        MeetingMinutesContent edited = validContent();
        edited.getItems().get(0).setConclusion("改定：按人頭分攤");
        existing.setContentJson(JsonUtils.toJson(edited));
        // 编辑会抬版本（乐观锁），第二批得用新版本
        existing.setVersion(1);
        MeetingMinutesDto.SendForm second = new MeetingMinutesDto.SendForm();
        second.setReceiverUserIds(List.of(7L));
        second.setVersion(1);
        service.send(5L, second);

        assertEquals(2, inserted.size());
        assertEquals(1, inserted.get(0).getBatchSeq().intValue());
        assertEquals(2, inserted.get(1).getBatchSeq().intValue());
        MeetingMinutesContent firstSnapshot = JsonUtils.parse(inserted.get(0).getContentSnapshot(), MeetingMinutesContent.class);
        MeetingMinutesContent secondSnapshot = JsonUtils.parse(inserted.get(1).getContentSnapshot(), MeetingMinutesContent.class);
        assertEquals("按營收分攤", firstSnapshot.getItems().get(0).getConclusion());
        assertEquals("改定：按人頭分攤", secondSnapshot.getItems().get(0).getConclusion());
    }

    @Test
    @DisplayName("行政打开已取消会议的纪要页：提示是「还不到时候」而不是「你没权限」")
    void cancelledMeetingSkeletonExplainsWhy() {
        when(bookingMapper.selectById(100L)).thenReturn(booking(MeetingConstants.STATUS_CANCELLED,
                LocalDateTime.now().minusDays(3), LocalDateTime.now().minusDays(3).plusHours(1)));
        when(guard.canOperateRecords(RECORDER)).thenReturn(true);

        MeetingMinutesDto.VO vo = service.viewByBooking(100L);

        assertFalse(vo.isExists());
        assertFalse(Boolean.TRUE.equals(vo.getCanEdit()));
        // 权限是够的（行政），拦住他的是阶段——原因不能写成 PERMISSION
        assertEquals("MEETING_NOT_RECORDED", vo.getEditLockReason());
    }

    @Test
    @DisplayName("无权限的人打开纪要页：原因写 PERMISSION，不写「还没到时候」")
    void noPermissionExplainsPermission() {
        when(guard.currentUser()).thenReturn(STRANGER);
        when(minutesMapper.selectById(5L)).thenReturn(minutes(5L, RECORDER.getId(), 0, 0));
        when(guard.isOrganizer(any(), eq(STRANGER))).thenReturn(false);
        when(guard.canOperateRecords(STRANGER)).thenReturn(false);
        when(deliveryMapper.countSentToUser(5L, STRANGER.getId())).thenReturn(1);

        MeetingMinutesDto.VO vo = service.view(5L);

        assertFalse(Boolean.TRUE.equals(vo.getCanEdit()));
        assertEquals("PERMISSION", vo.getEditLockReason());
    }

    @Test
    @DisplayName("列表富化：批量取一次纪要，不逐行查")
    void briefByBookingsIsSingleQuery() {
        when(minutesMapper.findByBookings(anyCollection())).thenReturn(List.of(minutes(5L, RECORDER.getId(), 0, 0)));
        Map<Long, MeetingMinutes> byBooking = service.briefByBookings(List.of(100L, 100L, 101L));
        assertEquals(1, byBooking.size());
        verify(minutesMapper).findByBookings(anyCollection());
        verify(minutesMapper, never()).findByBooking(anyLong());
    }
}
