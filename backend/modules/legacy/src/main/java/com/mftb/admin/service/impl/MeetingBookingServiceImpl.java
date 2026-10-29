package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.MeetingConstants;
import com.mftb.admin.dto.MeetingBookingDto;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.MeetingAttendee;
import com.mftb.admin.entity.MeetingBooking;
import com.mftb.admin.entity.MeetingEvent;
import com.mftb.admin.entity.MeetingMinutes;
import com.mftb.admin.entity.MeetingNotifyLog;
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
import com.mftb.admin.service.MeetingBookingService;
import com.mftb.admin.service.MeetingNotifyDispatcher;
import com.mftb.admin.service.MeetingRuleService;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.RequestHashUtil;
import com.mftb.admin.util.DateTimeUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

/** 会议预约服务实现（窗口占用与状态机的唯一写入方） */
@Slf4j
@Service
@RequiredArgsConstructor
public class MeetingBookingServiceImpl implements MeetingBookingService {

    /** 列表 scope 取值 */
    private static final String SCOPE_MINE = "mine";
    private static final String SCOPE_ATTENDED = "attended";
    private static final String SCOPE_ALL = "all";

    /** Tab 徽标口径 */
    private static final String GROUP_PENDING = "pending";
    private static final String GROUP_ONGOING = "ongoing";
    private static final String GROUP_DONE = "done";

    /** 派生展示态：进行中不落库，由 start<=now<end 算出 */
    private static final String PHASE_PENDING = "pending";
    private static final String PHASE_ONGOING = "ongoing";
    private static final String PHASE_ENDED = "ended";

    /** 摘要里"即将开始"的观察天数 */
    private static final int UPCOMING_DAYS = 7;

    /**
     * 纪要入口的阶段口径：会议一到开始时间（ongoing）就给入口，不必等散会。
     * <p>开会过程中就要开始记录才是实际场景（纪要本身就是边开边写的），
     * 未开始的会没有结论可记，已取消/已释放的会不产生纪要。
     * <p>必须与 {@code MeetingMinutesServiceImpl.RECORDABLE_PHASES} 逐字一致：
     * 两边不一致时会出现"列表给了按钮、点进去被拒"，那比不给按钮更让人怀疑系统。
     */
    private static final List<String> RECORDABLE_PHASES = List.of(PHASE_ONGOING, PHASE_ENDED,
            MeetingConstants.STATUS_FINISHED);
    /** 已取消/已释放的会不产生纪要（与纪要服务同一口径） */
    private static final List<String> NON_RECORDABLE_STATUSES = List.of(
            MeetingConstants.STATUS_CANCELLED, MeetingConstants.STATUS_RELEASED);
    /** 单日日程最多条目：真实会议密度远低于此，超出说明查询条件传错 */
    private static final int SCHEDULE_LIMIT = 200;
    /** 通知正文里的短时格式：卡片要短，重复日期在上一行已经给过 */
    private static final java.time.format.DateTimeFormatter FMT_TIME =
            java.time.format.DateTimeFormatter.ofPattern("HH:mm");

    private final MeetingBookingMapper bookingMapper;
    private final MeetingRoomMapper roomMapper;
    private final MeetingAttendeeMapper attendeeMapper;
    private final MeetingEventMapper eventMapper;
    private final MeetingNotifyLogMapper notifyMapper;
    private final MeetingMinutesMapper minutesMapper;
    private final SysUserMapper userMapper;
    private final MeetingAccessGuard guard;
    private final MeetingRuleService ruleService;
    private final MeetingAuditRecorder auditRecorder;
    private final MeetingNotifyDispatcher notifyDispatcher;
    private final MeetingBlacklistService blacklistService;
    private final BizSeqService bizSeqService;

    /* ==================== 查询 ==================== */

    @Override
    public MeetingBookingDto.PageWithStats listWithStats(MeetingBookingDto.Query query) {
        SysUser current = guard.currentUser();
        Scope scope = applyRespondFilter(resolveScope(query.getScope(), current), query.getRespond(), current);
        if (scope.empty()) {
            MeetingBookingDto.PageWithStats empty = new MeetingBookingDto.PageWithStats();
            empty.setPage(new PageResult<>(List.of(), 0L));
            // Stats 用原始 long：空结果也是六个 0 而不是缺字段，统计卡不会渲染成空白
            empty.setStats(new MeetingBookingDto.Stats());
            return empty;
        }

        Page<MeetingBooking> page = new Page<>(
                PageResult.normalizePage(query.getPage() == null ? 1 : query.getPage()),
                PageResult.normalizeSize(query.getSize() == null ? 20 : query.getSize()));
        Page<MeetingBooking> paged = bookingMapper.selectPage(page, buildWrapper(query, scope));
        List<MeetingBookingDto.VO> records = toVoList(paged.getRecords(), current);

        MeetingBookingDto.PageWithStats result = new MeetingBookingDto.PageWithStats();
        result.setPage(new PageResult<>(records, paged.getTotal()));
        result.setStats(buildStats(query, scope));
        return result;
    }

    @Override
    public MeetingBookingDto.VO detail(long id) {
        SysUser current = guard.currentUser();
        MeetingBooking booking = requireBooking(id);
        guard.requireBookingReadable(booking, current);
        List<MeetingAttendee> attendees = attendeeMapper.findByBooking(id);
        MeetingBookingDto.VO vo = toVO(booking, current, roomMapper.selectById(booking.getRoomId()),
                ruleService.globalRule(), findMyRow(attendees, current.getId()));
        vo.setAttendees(attendees.stream().map(this::toAttendeeVO).toList());
        vo.setNotifies(notifyMapper.findByBooking(id).stream().map(this::toNotifyVO).toList());
        vo.setNotifySkippedCount(notifyMapper.countInviteSkipped(id));
        applyMinutes(vo, minutesMapper.findByBooking(id),
                guard.canRecordMinutes(current), guard.canOperateRecords(current));
        return vo;
    }

    /**
     * 把实际使用人并入必参名单（去重且保序）；他已在名单里时不重复追加。
     *
     * <p>public 是刻意的：单场预约与周期系列都必须用同一份合并规则，
     * 各自实现一份迟早会出现「单场算 7 人、周期算 6 人」的容量漂移。
     */
    public static List<Long> withDelegate(List<Long> ids, Long delegateId) {
        List<Long> merged = new ArrayList<>(ids == null ? List.of() : ids);
        if (delegateId != null && !merged.contains(delegateId)) {
            merged.add(delegateId);
        }
        return merged;
    }

    /** 使用人姓名快照：与参会人名单同一取名口径，避免台账与钉钉卡片上两种写法 */
    private static String delegateName(SysUser user) {
        return displayName(user);
    }

    /** 从已加载的名单里取"我"的那一行，不再为一个人多打一次查询 */
    private static MeetingAttendee findMyRow(List<MeetingAttendee> attendees, Long userId) {
        if (userId == null) {
            return null;
        }
        return attendees.stream()
                .filter(row -> userId.equals(row.getUserId())).findFirst().orElse(null);
    }

    @Override
    public List<MeetingBookingDto.EventVO> events(long id) {
        SysUser current = guard.currentUser();
        MeetingBooking booking = requireBooking(id);
        guard.requireBookingReadable(booking, current);
        return eventMapper.findByBooking(id).stream().map(this::toEventVO).toList();
    }

    /* ==================== 写入 ==================== */

    @Override
    @Transactional(rollbackFor = Exception.class)
    public MeetingBookingDto.CreateResult create(MeetingBookingDto.CreateForm form) {
        SysUser current = guard.currentUser();
        // 黑名单守卫放在锁房间之前：被限制的人不该占用锁资源，也不该因为一个无效请求把同房间其他人排住
        blacklistService.assertNotBlacklisted(current);
        // 代订：实际使用人同样要过黑名单。黑名单的语义是"暂停这个人的预约资格"，
        // 只拦点提交的行政而不拦被挂名的使用人，被限制的人只要找人代订就能继续占用窗口
        SysUser delegate = guard.resolveDelegateFor(form.getDelegateForId(), current);
        if (delegate != null) {
            blacklistService.assertNotBlacklisted(delegate.getId(), "實際使用人");
            // 入口就把使用人并入必参名单：容量口径、名单落库、日程可见性全都吃同一份名单，
            // 分两处算必然出现「表单说 6 人、房间实际坐 7 人」这种漂移
            form.setAttendeeUserIds(withDelegate(form.getAttendeeUserIds(), delegate.getId()));
        }
        // 第一步永远是锁房间行：同一间房的所有窗口占用判定只有在这个锁边界内的当前读才可信
        MeetingRoom room = roomMapper.selectForUpdate(form.getRoomId());
        if (room == null) {
            throw new BusinessException("會議室不存在或已刪除");
        }

        String requestKey = trimToNull(form.getRequestKey());
        String requestHash = MeetingBookingServiceImpl.hash(form);
        if (requestKey != null) {
            MeetingBooking existing = bookingMapper.findByIdempotencyKey(current.getId(), requestKey);
            if (existing != null) {
                if (!Objects.equals(requestHash, existing.getRequestHash())) {
                    throw new BusinessException("同一請求編號已對應另一場預約內容，請重新提交");
                }
                // 同键同内容：重放点击，直接回原单，绘不二次占用窗口
                // 重放不重新登记投递，因此 inviteQueued 固定 false；场景状态回查当前配置，
                // 否则前端会把一次正常重放读成「通知場景未啟用」
                return createResult(existing, false,
                        notifyDispatcher.scenarioActive(MeetingConstants.SCENARIO_INVITE),
                        notifyMapper.countInviteSkipped(existing.getId()));
            }
        }

        MeetingBooking booking = occupy(form, current, delegate, room, null, 0, requestKey, requestHash, true);
        MeetingNotifyDispatcher.EnqueueResult queued = notifyDispatcher.enqueue(booking,
                MeetingConstants.NOTIFY_EVT_CREATED, MeetingConstants.SCENARIO_INVITE,
                inviteReceivers(attendeeMapper.findByBooking(booking.getId())), null);
        return createResult(booking, queued.isScenarioActive() && queued.getQueued() > 0,
                queued.isScenarioActive(), queued.getSkipped());
    }

    /**
     * 一次窗口占用的完整核心：规则→房间冲突→组织者冲突→落单→参会人→审计。
     *
     * <p>手工新建与周期物化共用这一个实现，而不是各写一份：后者必然出现
     * 「手工建会校验了容量、周期建会没校验」这类同构漏洞。
     * 两者只有三处不同：是否受最远可订天数限制、是否立即发邀约、是否带系列归属。
     */
    private MeetingBooking occupy(MeetingBookingDto.CreateForm form, SysUser organizer, SysUser delegate,
                                  MeetingRoom room,
                                  Long seriesId, int seriesSeq, String requestKey, String requestHash,
                                  boolean enforceAdvanceDays) {
        List<MeetingAttendee> attendees = buildAttendees(form, organizer);
        MeetingRuleService.GlobalRule global = ruleService.globalRule();
        ruleService.validate(room, form.getStartTime(), form.getEndTime(), attendees.size(),
                global, enforceAdvanceDays);

        List<MeetingBooking> roomConflicts = bookingMapper.findRoomConflicts(room.getId(),
                form.getStartTime(), form.getEndTime(), null);
        if (!roomConflicts.isEmpty()) {
            if (seriesId != null) {
                // 周期物化由调用方按 null 返回值计入跳过清单；这里不得抛异常，否则一场冲突毁掉整批
                return null;
            }
            throw conflict("會議室在該時段已被佔用", roomConflicts);
        }
        // "谁不能同时出现在两个会里"：代订时是实际使用人，而不是替人跑腿的行政。
        // 拿组织者判冲突会让行政一天只能代订一场（他本人并不出席），而真正该拦的那个人反而漏掉。
        // 口径与现状一致：只拦"同一人同时组织两场"，被邀请进两个同时段会议属于日历常态，不拦。
        long presenterId = delegate != null ? delegate.getId() : organizer.getId();
        List<MeetingBooking> organizerConflicts = bookingMapper.findOrganizerConflicts(presenterId,
                form.getStartTime(), form.getEndTime(), null);
        if (!organizerConflicts.isEmpty()) {
            if (seriesId != null) {
                return null;
            }
            throw conflict(delegate == null ? "您在該時段已有其他會議" : "實際使用人在該時段已有其他會議",
                    organizerConflicts);
        }

        MeetingBooking booking = new MeetingBooking();
        booking.setBookingNo(bizSeqService.next(MeetingConstants.SEQ_BOOKING));
        booking.setTitle(form.getTitle().trim());
        booking.setBizType(resolveBizType(form.getBizType()));
        booking.setBizId(form.getBizId());
        booking.setBizNo(trimToEmpty(form.getBizNo()));
        booking.setBizUrl(trimToNull(form.getBizUrl()));
        applyRoomSnapshot(booking, room);
        applyOrganizerSnapshot(booking, organizer);
        if (delegate != null) {
            // 组织者与使用人分列：行政代订的会，操作权在行政（组织者），
            // 而"这间房是给谁用的"由这两个字段回答，缺了它事后无法解释房间为什么被占
            booking.setDelegateForId(delegate.getId());
            booking.setDelegateForName(delegateName(delegate));
        }
        booking.setStartTime(form.getStartTime());
        booking.setEndTime(form.getEndTime());
        booking.setSeriesId(seriesId);
        booking.setSeriesSeq(seriesId == null ? null : seriesSeq);
        booking.setAttendeeCount(attendees.size());
        booking.setDescription(trimToNull(form.getDescription()));
        booking.setOnlineMeetingUrl(trimToNull(form.getOnlineMeetingUrl()));
        booking.setExternalAttendees(joinExternal(form.getExternalAttendees()));
        booking.setStatus(MeetingConstants.STATUS_BOOKED);
        booking.setNoShowFlag(0);
        booking.setRequestKey(requestKey);
        booking.setRequestHash(requestHash);
        booking.setCreatedBy(organizer.getName());
        booking.setUpdatedBy(organizer.getName());
        booking.setVersion(0);
        try {
            bookingMapper.insert(booking);
        } catch (DuplicateKeyException e) {
            if (seriesId != null) {
                return null;
            }
            // 走到这里说明房间行锁没能覆盖（例如主从切换后的极端并发），
            // 生成列 active_slot 是唯一键兜底：重查一次给出可读结论而不是 500
            List<MeetingBooking> races = bookingMapper.findRoomConflicts(room.getId(),
                    form.getStartTime(), form.getEndTime(), null);
            if (!races.isEmpty()) {
                throw conflict("會議室在該時段剛被他人佔用", races);
            }
            log.warn("會議單號或幂等鍵撞唯一键，請重新提交: roomNo={}, error={}",
                    room.getRoomNo(), e.getMessage());
            throw new BusinessException("預約提交衝突，請刷新忙閒狀態後重試");
        }

        attendees.forEach(attendee -> {
            attendee.setBookingId(booking.getId());
            attendeeMapper.insert(attendee);
        });

        auditRecorder.recordBooking(booking.getId(), booking.getRoomId(), booking.getBookingNo(),
                MeetingConstants.EVENT_CREATE,
                delegate == null ? null : "代 " + delegateName(delegate) + " 預訂",
                null, snapshot(booking), organizer, requestKey);
        return booking;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public MeetingBooking materializeInstance(MeetingBookingDto.CreateForm form, SysUser organizer,
                                             SysUser delegate, Long seriesId, int seriesSeq) {
        MeetingRoom room = roomMapper.selectForUpdate(form.getRoomId());
        if (room == null) {
            throw new BusinessException("會議室不存在或已刪除");
        }
        // 周期实例写 seriesId 而不写 requestKey：重放保护在系列层（唯一键 + 幂等键），
        // 而整个物化过内要么全部提交要么全部回滚，不存在"只建了一半"的实例需要靠 requestKey 去重。
        // 也不受最远可订天数限制（见 MeetingRuleService 重载说明）。
        return occupy(form, organizer, delegate, room, seriesId, seriesSeq, null, null, false);
    }


    @Override
    @Transactional(rollbackFor = Exception.class)
    public MeetingBookingDto.VO update(long id, MeetingBookingDto.UpdateForm form) {
        SysUser current = guard.currentUser();
        // 改期等价于"释放旧窗口 + 抢占新窗口"，被限制预约的人不能靠改期继续占用新窗口
        blacklistService.assertNotBlacklisted(current);
        // 加锁顺序固定为「预约单 → 房间」：新建只锁房间、不锁单，因此不会与本路径形成反向等待
        MeetingBooking before = bookingMapper.selectForUpdate(id);
        if (before == null) {
            throw new BusinessException("會議記錄不存在或已刪除");
        }
        // 改期等价于占用新窗口：被挂名的实际使用人若已被限制，不能靠改期继续占用别人的窗口
        blacklistService.assertNotBlacklisted(before.getDelegateForId(), "實際使用人");
        guard.requireBookingWritable(before, current);
        requireVersion(form.getVersion(), before);
        if (!MeetingConstants.STATUS_BOOKED.equals(before.getStatus())) {
            throw new BusinessException("只有「已預約且尚未開始」的會議可以變更，當前狀態：" + before.getStatus());
        }
        if (!before.getStartTime().isAfter(LocalDateTime.now())) {
            throw new BusinessException("會議已開始或已結束，請取消後重新預約");
        }

        MeetingRoom room = roomMapper.selectForUpdate(form.getRoomId());
        if (room == null) {
            throw new BusinessException("會議室不存在或已刪除");
        }
        List<MeetingAttendee> attendees = buildAttendees(form, before);
        ruleService.validate(room, form.getStartTime(), form.getEndTime(), attendees.size());
        rejectConflicts(bookingMapper.findRoomConflicts(room.getId(),
                form.getStartTime(), form.getEndTime(), id), "會議室在該時段已被佔用");
        // 代订单改期时按实际使用人判冲突（他才是到场的人）；自订单保持原口径
        Long presenterId = before.getDelegateForId() != null ? before.getDelegateForId() : before.getOrganizerId();
        rejectConflicts(bookingMapper.findOrganizerConflicts(presenterId,
                form.getStartTime(), form.getEndTime(), id),
                before.getDelegateForId() != null
                        ? "實際使用人在該時段已有其他會議" : "組織者在該時段已有其他會議");

        // 下面的 set 白名单刻意不含 delegate_for_*：改期只换时间与房间，
        // "这场会是给谁用的"不随改期迁移；要换使用人只能取消后重订（留得下审计轨迹）
        MeetingBooking after = new MeetingBooking();
        after.setId(id);
        after.setTitle(form.getTitle().trim());
        applyRoomSnapshot(after, room);
        after.setStartTime(form.getStartTime());
        after.setEndTime(form.getEndTime());
        after.setAttendeeCount(attendees.size());
        after.setDescription(trimToNull(form.getDescription()));
        after.setOnlineMeetingUrl(trimToNull(form.getOnlineMeetingUrl()));
        after.setExternalAttendees(joinExternal(form.getExternalAttendees()));
        after.setBizType(resolveBizType(form.getBizType()));
        after.setBizId(form.getBizId());
        after.setBizNo(trimToEmpty(form.getBizNo()));
        after.setBizUrl(trimToNull(form.getBizUrl()));

        LambdaUpdateWrapper<MeetingBooking> update = new LambdaUpdateWrapper<MeetingBooking>()
                .eq(MeetingBooking::getId, id)
                .eq(MeetingBooking::getVersion, form.getVersion())
                .set(MeetingBooking::getTitle, after.getTitle())
                .set(MeetingBooking::getRoomId, after.getRoomId())
                .set(MeetingBooking::getRoomNo, after.getRoomNo())
                .set(MeetingBooking::getRoomName, after.getRoomName())
                .set(MeetingBooking::getRoomLocation, after.getRoomLocation())
                .set(MeetingBooking::getStartTime, after.getStartTime())
                .set(MeetingBooking::getEndTime, after.getEndTime())
                .set(MeetingBooking::getAttendeeCount, after.getAttendeeCount())
                .set(MeetingBooking::getDescription, after.getDescription())
                .set(MeetingBooking::getOnlineMeetingUrl, after.getOnlineMeetingUrl())
                .set(MeetingBooking::getExternalAttendees, after.getExternalAttendees())
                .set(MeetingBooking::getBizType, after.getBizType())
                .set(MeetingBooking::getBizId, after.getBizId())
                .set(MeetingBooking::getBizNo, after.getBizNo())
                .set(MeetingBooking::getBizUrl, after.getBizUrl())
                .set(MeetingBooking::getUpdatedBy, current.getName())
                .setSql("version = version + 1");
        if (bookingMapper.update(null, update) == 0) {
            throw new BusinessException("該會議已被他人修改，請刷新後重試");
        }

        syncAttendees(id, attendees, current);
        MeetingBooking saved = requireBooking(id);
        boolean slotChanged = !Objects.equals(before.getStartTime(), saved.getStartTime())
                || !Objects.equals(before.getEndTime(), saved.getEndTime())
                || !Objects.equals(before.getRoomId(), saved.getRoomId());
        if (slotChanged) {
            resetResponses(id, current);
        }

        auditRecorder.recordBooking(id, saved.getRoomId(), saved.getBookingNo(),
                MeetingConstants.EVENT_UPDATE, trimToNull(form.getChangeNote()),
                snapshot(before), snapshot(saved), current, null);

        String detail = MeetingNotifyDispatcher.timeShiftText(before, saved);
        notifyDispatcher.enqueue(saved, MeetingConstants.updateEventCode(saved.getVersion()),
                MeetingConstants.SCENARIO_INVITE, inviteReceivers(attendeeMapper.findByBooking(id)),
                StringUtils.hasText(detail) ? detail : trimToNull(form.getChangeNote()));
        return toVO(saved, current);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void cancel(long id, MeetingBookingDto.CancelForm form) {
        SysUser current = guard.currentUser();
        MeetingBooking booking = bookingMapper.selectForUpdate(id);
        if (booking == null) {
            throw new BusinessException("會議記錄不存在或已刪除");
        }
        guard.requireBookingWritable(booking, current);
        requireVersion(form.getVersion(), booking);
        if (!MeetingConstants.canTransition(booking.getStatus(), MeetingConstants.STATUS_CANCELLED)) {
            throw new BusinessException("當前狀態不可取消：" + booking.getStatus());
        }
        LocalDateTime now = LocalDateTime.now();
        int affected = bookingMapper.update(null, new LambdaUpdateWrapper<MeetingBooking>()
                .eq(MeetingBooking::getId, id)
                .eq(MeetingBooking::getVersion, form.getVersion())
                .eq(MeetingBooking::getStatus, booking.getStatus())
                .set(MeetingBooking::getStatus, MeetingConstants.STATUS_CANCELLED)
                .set(MeetingBooking::getCancelReason, form.getReason().trim())
                .set(MeetingBooking::getCancelledBy, current.getId())
                .set(MeetingBooking::getCancelledAt, now)
                .set(MeetingBooking::getUpdatedBy, current.getName())
                .setSql("version = version + 1"));
        if (affected == 0) {
            throw new BusinessException("該會議已被他人修改，請刷新後重試");
        }

        MeetingBooking after = requireBooking(id);
        auditRecorder.recordBooking(id, after.getRoomId(), after.getBookingNo(),
                MeetingConstants.EVENT_CANCEL, form.getReason(), snapshot(booking), snapshot(after), current, null);
        // 取消必须通知到全体参会人（含只被选了选参的人）：他们已按这场会排开别的安排
        notifyDispatcher.enqueue(after, MeetingConstants.NOTIFY_EVT_CANCELLED,
                MeetingConstants.SCENARIO_INVITE, inviteReceivers(attendeeMapper.findByBooking(id)),
                "取消原因：" + form.getReason().trim());
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public MeetingBookingDto.VO respond(long id, MeetingBookingDto.ResponseForm form) {
        SysUser current = guard.currentUser();
        MeetingBooking booking = bookingMapper.selectForUpdate(id);
        if (booking == null) {
            throw new BusinessException("會議記錄不存在或已刪除");
        }
        guard.requireBookingReadable(booking, current);
        if (!MeetingConstants.OCCUPYING_STATUSES.contains(booking.getStatus())) {
            throw new BusinessException("該會議已結束或已取消，無需響應");
        }
        if (guard.isOrganizer(booking, current)) {
            throw new BusinessException("組織者無需響應自己的邀約");
        }
        MeetingAttendee mine = attendeeMapper.selectOne(new LambdaQueryWrapper<MeetingAttendee>()
                .eq(MeetingAttendee::getBookingId, id)
                .eq(MeetingAttendee::getUserId, current.getId())
                .last("LIMIT 1"));
        if (mine == null) {
            throw new BusinessException("您不是該會議的參會人");
        }
        if (MeetingConstants.RESPOND_INVALID.equals(mine.getResponse())) {
            throw new BusinessException("該邀約已失效，請與組織者確認");
        }
        String response = Boolean.TRUE.equals(form.getAccept())
                ? MeetingConstants.RESPOND_ACCEPTED : MeetingConstants.RESPOND_DECLINED;
        LocalDateTime now = LocalDateTime.now();
        attendeeMapper.update(null, new LambdaUpdateWrapper<MeetingAttendee>()
                .eq(MeetingAttendee::getId, mine.getId())
                .set(MeetingAttendee::getResponse, response)
                .set(MeetingAttendee::getRespondAt, now)
                .set(MeetingAttendee::getUpdatedBy, current.getName()));

        Map<String, Object> diff = Map.of("from", Objects.toString(mine.getResponse(), ""), "to", response,
                "note", Objects.toString(trimToNull(form.getNote()), ""));
        auditRecorder.recordBooking(id, booking.getRoomId(), booking.getBookingNo(),
                MeetingConstants.EVENT_UPDATE, "參會人響應：" + response, null, diff, current, null);
        return toVO(requireBooking(id), current);
    }

    /* ==================== 定时作业的单元操作 ==================== */

    @Override
    public List<MeetingBooking> findReleasable(int limit) {
        return bookingMapper.findReleasable(ruleService.globalRule().getReleaseAfterMinutes(),
                Math.max(1, limit));
    }

    @Override
    public List<MeetingBooking> findRemindDue(int limit) {
        int minutes = ruleService.globalRule().getRemindMinutes();
        // 0 = 不提醒：这里必须返回空集而不是让 SQL 的 INTERVAL 0 MINUTE 去决定，
        // 否则"关提醒"变成"提醒在开始时刻才发"，语义完全不同
        if (minutes <= 0) {
            return List.of();
        }
        return bookingMapper.findRemindDue(minutes, Math.max(1, limit));
    }

    @Override
    public List<MeetingBooking> findStaleOccupying(int limit) {
        return bookingMapper.findStaleOccupying(LocalDateTime.now(), Math.max(1, limit));
    }

    /**
     * 每日收尾：把已过结束时间却仍占用窗口的单收掉。
     *
     * <p>两类房间分开处理，因为它们是两件不同的事实：
     * <ul>
     *   <li>启用签到且无人签到 → 走爽约释放（no_show=1），补上释放作业漏跑的那一笔；</li>
     *   <li>其余 → 记 finished，{@code actual_end_at} 取预约结束时刻（会议跑到它该结束的时间，
     *       而不是"作业跑到的那一刻"，否则使用率统计会把每天最后几场会算长）。</li>
     * </ul>
     */
    @Override
    public boolean finishAsSystem(MeetingBooking booking) {
        MeetingRoom room = roomMapper.selectById(booking.getRoomId());
        boolean needCheckin = room != null && Integer.valueOf(1).equals(room.getCheckinRequired());
        boolean nobodyCame = booking.getCheckinAt() == null;
        if (needCheckin && nobodyCame) {
            return releaseAsNoShow(booking, "會議已結束且全程無人簽到，系統補記爽約並釋放會議室");
        }
        int updated = bookingMapper.update(null, new LambdaUpdateWrapper<MeetingBooking>()
                .eq(MeetingBooking::getId, booking.getId())
                .in(MeetingBooking::getStatus, MeetingConstants.OCCUPYING_STATUSES)
                .set(MeetingBooking::getStatus, MeetingConstants.STATUS_FINISHED)
                .set(MeetingBooking::getActualEndAt, booking.getEndTime())
                .set(MeetingBooking::getUpdatedBy, MeetingConstants.OPERATOR_SYSTEM)
                .setSql("version = version + 1"));
        if (updated == 0) {
            return false;
        }
        auditRecorder.recordSystem(booking.getId(), booking.getRoomId(), booking.getBookingNo(),
                MeetingConstants.EVENT_FINISH, "每日自動收尾", snapshot(booking),
                snapshot(requireBooking(booking.getId())));
        return true;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public int markDeactivatedAttendees(int limit) {
        List<MeetingAttendee> stale = bookingMapper.findDeactivatedAttendees(Math.max(1, limit));
        int marked = 0;
        for (MeetingAttendee row : stale) {
            if (MeetingConstants.RESPOND_INVALID.equals(row.getResponse())) {
                continue;
            }
            if (attendeeMapper.update(null, new LambdaUpdateWrapper<MeetingAttendee>()
                    .eq(MeetingAttendee::getId, row.getId())
                    .set(MeetingAttendee::getResponse, MeetingConstants.RESPOND_INVALID)
                    .set(MeetingAttendee::getInvalidReason, "離職")
                    .set(MeetingAttendee::getUpdatedBy, MeetingConstants.OPERATOR_SYSTEM)) > 0) {
                marked++;
            }
        }
        return marked;
    }

    @Override
    public List<Long> receiversOf(long bookingId) {
        return inviteReceivers(attendeeMapper.findByBooking(bookingId));
    }

    /* ==================== 供周期系列复用的入口 ==================== */

    @Override
    public void validateTemplate(MeetingRoom room, LocalDateTime start, LocalDateTime end, int attendeeCount) {
        // 周期创建时先按模板校验一次：时长超上限、跨天这类错误必须整体拒绝，
        // 不能降级成"那一场的场次被跳过"，否则配置错误会被伪装成偶发冲突
        ruleService.validate(room, start, end, attendeeCount, ruleService.globalRule(), false);
    }

    @Override
    public MeetingNotifyDispatcher.EnqueueResult notifySeriesFirstInvite(MeetingBooking booking) {
        return notifyDispatcher.enqueue(booking, MeetingConstants.NOTIFY_EVT_CREATED,
                MeetingConstants.SCENARIO_INVITE,
                inviteReceivers(attendeeMapper.findByBooking(booking.getId())),
                "本周期會議共 " + (booking.getSeriesSeq() == null ? 1 : booking.getSeriesSeq())
                        + " 場起，後續日期請在會議詳情與日程中查看");
    }

    @Override
    public MeetingBookingDto.VO viewForSeries(MeetingBooking booking, SysUser current) {
        return toVO(booking, current);
    }

    /* ==================== M2：签到 / 提前结束 / 释放 ==================== */

    @Override
    @Transactional(rollbackFor = Exception.class)
    public MeetingBookingDto.VO checkin(long id) {
        return checkinAs(id, guard.currentUser());
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public MeetingBookingDto.VO checkinAs(long id, SysUser participant) {
        MeetingBooking booking = bookingMapper.selectForUpdate(id);
        if (booking == null) {
            throw new BusinessException("會議記錄不存在或已刪除");
        }
        // 读取权限按签到人判定：免登页带着某人的令牌进来，只能以那个人的身份签，
        // 不能拿别人的令牌替别人签到后把会议状态整体推进
        guard.requireBookingReadable(booking, participant);
        return doCheckin(booking, participant);
    }

    @Override
    public MeetingBookingDto.VO stateForCheckin(long id, SysUser participant) {
        MeetingBooking booking = requireBooking(id);
        guard.requireBookingReadable(booking, participant);
        return toVO(booking, participant);
    }

    /**
     * 签到主体。
     *
     * <p>会议级只推一次 booked→checked_in（第一个人签到即视为会议已开始），
     * 之后其他人签到只记自己的到达时间：会议是否"实际开了"是一个事实，
     * 不应该因为第二个人才点按钮而延后三分钟。
     */
    private MeetingBookingDto.VO doCheckin(MeetingBooking booking, SysUser current) {
        if (!MeetingConstants.STATUS_OPEN.contains(booking.getStatus())) {
            throw new BusinessException("該會議已結束、已取消或已被釋放，無法簽到");
        }
        LocalDateTime now = LocalDateTime.now();
        MeetingRoom room = roomMapper.selectById(booking.getRoomId());
        MeetingRuleService.GlobalRule global = ruleService.globalRule();
        LocalDateTime[] window = checkinWindow(booking, room, global);
        if (now.isBefore(window[0])) {
            throw new BusinessException("尚未到簽到時間，" + DateTimeUtils.format(window[0]) + " 開始簽到");
        }
        if (now.isAfter(window[1])) {
            throw new BusinessException("會議已過結束時間，無法補簽");
        }

        MeetingAttendee mine = attendeeMapper.selectOne(new LambdaQueryWrapper<MeetingAttendee>()
                .eq(MeetingAttendee::getBookingId, booking.getId())
                .eq(MeetingAttendee::getUserId, current.getId())
                .last("LIMIT 1"));
        if (mine == null) {
            throw new BusinessException("您不在該會議的參會名單中，無法簽到");
        }
        if (mine.getCheckinAt() == null) {
            attendeeMapper.update(null, new LambdaUpdateWrapper<MeetingAttendee>()
                    .eq(MeetingAttendee::getId, mine.getId())
                    .set(MeetingAttendee::getCheckinAt, now)
                    .set(MeetingAttendee::getResponse, MeetingConstants.RESPOND_ACCEPTED)
                    .set(MeetingAttendee::getRespondAt, mine.getRespondAt() == null ? now : mine.getRespondAt())
                    .set(MeetingAttendee::getUpdatedBy, current.getName()));
        }

        if (MeetingConstants.STATUS_BOOKED.equals(booking.getStatus())) {
            int advanced = bookingMapper.update(null, new LambdaUpdateWrapper<MeetingBooking>()
                    .eq(MeetingBooking::getId, booking.getId())
                    .eq(MeetingBooking::getStatus, MeetingConstants.STATUS_BOOKED)
                    .set(MeetingBooking::getStatus, MeetingConstants.STATUS_CHECKED_IN)
                    .set(MeetingBooking::getCheckinAt, now)
                    .set(MeetingBooking::getCheckinBy, current.getId())
                    .set(MeetingBooking::getActualStartAt, now)
                    .set(MeetingBooking::getUpdatedBy, current.getName())
                    .setSql("version = version + 1"));
            if (advanced == 0) {
                throw new BusinessException("會議狀態已變更，請刷新後重試");
            }
        }
        MeetingBooking after = requireBooking(booking.getId());
        auditRecorder.recordBooking(after.getId(), after.getRoomId(), after.getBookingNo(),
                MeetingConstants.EVENT_CHECKIN, null, null, snapshot(after), current, null);
        return toVO(after, current, room);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public MeetingBookingDto.VO finish(long id) {
        SysUser current = guard.currentUser();
        MeetingBooking booking = bookingMapper.selectForUpdate(id);
        if (booking == null) {
            throw new BusinessException("會議記錄不存在或已刪除");
        }
        guard.requireBookingWritable(booking, current);
        if (!MeetingConstants.STATUS_OPEN.contains(booking.getStatus())) {
            throw new BusinessException("該會議已結束或已取消，無需再次收尾");
        }
        LocalDateTime now = LocalDateTime.now();
        if (now.isBefore(booking.getStartTime())) {
            throw new BusinessException("會議尚未開始，請改用取消或改期");
        }
        // 提前结束要释放真实占用：actual_end_at 取现在时刻，使用率统计按它算而不是按预约时长
        if (bookingMapper.update(null, new LambdaUpdateWrapper<MeetingBooking>()
                .eq(MeetingBooking::getId, id)
                .in(MeetingBooking::getStatus, MeetingConstants.OCCUPYING_STATUSES)
                .set(MeetingBooking::getStatus, MeetingConstants.STATUS_FINISHED)
                .set(MeetingBooking::getActualEndAt, now)
                .set(MeetingBooking::getUpdatedBy, current.getName())
                .setSql("version = version + 1")) == 0) {
            throw new BusinessException("會議狀態已變更，請刷新後重試");
        }
        MeetingBooking after = requireBooking(id);
        auditRecorder.recordBooking(id, after.getRoomId(), after.getBookingNo(),
                MeetingConstants.EVENT_FINISH, null, snapshot(booking), snapshot(after), current, null);
        notifyDispatcher.enqueue(after, MeetingConstants.NOTIFY_EVT_FINISHED, MeetingConstants.SCENARIO_OPS,
                inviteReceivers(attendeeMapper.findByBooking(id)), "會議已提前結束：" + now.format(FMT_TIME));
        return toVO(after, current, roomMapper.selectById(after.getRoomId()));
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public MeetingBookingDto.VO release(long id, MeetingBookingDto.ReleaseForm form) {
        SysUser current = guard.currentUser();
        MeetingBooking booking = bookingMapper.selectForUpdate(id);
        if (booking == null) {
            throw new BusinessException("會議記錄不存在或已刪除");
        }
        if (!guard.canOperateRecords(current)) {
            throw new BusinessException("只有行政可以釋放會議室");
        }
        if (!MeetingConstants.STATUS_OPEN.contains(booking.getStatus())) {
            throw new BusinessException("該會議已結束或已取消，無需釋放");
        }
        if (LocalDateTime.now().isBefore(booking.getStartTime())) {
            // 释放的事实是“已开始却无人到场”，因此必带爽约标记并写 actual_end_at；
            // 未开始的会没有爽约事实，放行会落下 actual_end_at 早于 start_time 的矛盾数据，
            // 还会虚增爽约次数把好好的人推向自动拉黑阈值，因此只允许走“代取消”。
            throw new BusinessException("會議尚未開始，請改用「代取消」；釋放僅針對已開始但未到場的會議");
        }
        requireVersion(form.getVersion(), booking);
        doRelease(booking, form.getReason().trim(), current.getId(), current.getName());
        return toVO(requireBooking(id), current, roomMapper.selectById(booking.getRoomId()));
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean releaseAsNoShow(MeetingBooking booking, String reason) {
        // 自动释放没有"操作人"：release_by_id 置 NULL，与行政手动释放在事实列上分得开
        MeetingRoom room = roomMapper.selectById(booking.getRoomId());
        MeetingRuleService.GlobalRule global = ruleService.globalRule();
        LocalDateTime deadline = releaseDeadline(booking, room, global);
        if (LocalDateTime.now().isBefore(deadline)) {
            // 上一轮 Job 与本行状态可能已不一致（手动签到了），未到释放线就什么也不做，不强行释放
            return false;
        }
        return doRelease(booking, reason, null, MeetingConstants.OPERATOR_SYSTEM);
    }

    /**
     * 释放一笔占用（爽约）。
     *
     * <p>{@code CHECK(status<>'released' OR (release_at IS NOT NULL AND no_show_flag=1))} 要求三个字段
     * 必须同一条 UPDATE 写完；而 {@code no_show_flag=1} 把"释放"等同于"爽约"，所以本方法只能被
     * 未签到释放路径调用——提前结束走 finished，主动取消走 cancelled。
     */
    private boolean doRelease(MeetingBooking booking, String reason, Long operatorId, String operatorName) {
        LocalDateTime now = LocalDateTime.now();
        int updated = bookingMapper.update(null, new LambdaUpdateWrapper<MeetingBooking>()
                .eq(MeetingBooking::getId, booking.getId())
                .in(MeetingBooking::getStatus, MeetingConstants.OCCUPYING_STATUSES)
                .set(MeetingBooking::getStatus, MeetingConstants.STATUS_RELEASED)
                .set(MeetingBooking::getReleaseAt, now)
                .set(MeetingBooking::getReleaseById, operatorId)
                .set(MeetingBooking::getReleaseReason, reason)
                .set(MeetingBooking::getNoShowFlag, 1)
                .set(MeetingBooking::getActualEndAt, now)
                .set(MeetingBooking::getUpdatedBy, operatorName)
                .setSql("version = version + 1"));
        if (updated == 0) {
            return false;
        }
        MeetingBooking after = requireBooking(booking.getId());
        if (operatorId == null) {
            auditRecorder.recordSystem(after.getId(), after.getRoomId(), after.getBookingNo(),
                    MeetingConstants.EVENT_RELEASE, reason, snapshot(booking), snapshot(after));
        } else {
            auditRecorder.recordBooking(after.getId(), after.getRoomId(), after.getBookingNo(),
                    MeetingConstants.EVENT_RELEASE, reason, snapshot(booking), snapshot(after),
                    userMapper.selectById(operatorId), null);
        }
        // 释放必须告知组织者：否则他以为会议室还占着，而下一场可能已被别人订走
        notifyDispatcher.enqueue(after, MeetingConstants.NOTIFY_EVT_RELEASED, MeetingConstants.SCENARIO_OPS,
                List.of(after.getOrganizerId()), reason);
        if (operatorId == null) {
            // 自动释放后才评估自动黑名单：手动释放不算爽约（可能只是行政清理占坑），
            // 把它计入阈值会让"被行政帮了一忙"变成被处分
            blacklistService.evaluateAutoBlacklist(after.getOrganizerId());
        }
        return true;
    }

    /** 签到窗口：开始前 checkin_open_minutes 至会议结束（未签到释放仅对启用签到的房间生效） */
    private LocalDateTime[] checkinWindow(MeetingBooking booking, MeetingRoom room,
                                          MeetingRuleService.GlobalRule global) {
        return new LocalDateTime[]{
                booking.getStartTime().minusMinutes(Math.max(0, global.getCheckinOpenMinutes())),
                booking.getEndTime()};
    }

    /** 超时未签到的释放截止时刻（房间列 NULL 时回落全局，与 MeetingRuleService 同口径） */
    private LocalDateTime releaseDeadline(MeetingBooking booking, MeetingRoom room,
                                          MeetingRuleService.GlobalRule global) {
        Integer configured = room == null ? null : room.getReleaseAfterMinutes();
        int minutes = configured != null && configured > 0 ? configured : global.getReleaseAfterMinutes();
        return booking.getStartTime().plusMinutes(Math.max(1, minutes));
    }

    /* ==================== 我的日程 ==================== */

    @Override
    public List<MeetingBookingDto.ScheduleVO> schedule(LocalDate date) {
        SysUser current = guard.currentUser();
        LocalDate day = date == null ? LocalDate.now() : date;
        List<MeetingBooking> bookings = bookingMapper.findUserSchedule(current.getId(),
                day.atStartOfDay(), day.atTime(23, 59, 59));
        List<MeetingBookingDto.ScheduleVO> result = new ArrayList<>();
        for (MeetingBooking booking : bookings) {
            if (result.size() >= SCHEDULE_LIMIT) {
                log.warn("单日日程超出 {} 条已截断，请检查查询条件: userId={}", SCHEDULE_LIMIT, current.getId());
                break;
            }
            result.add(toScheduleVO(booking, current));
        }
        return result;
    }

    @Override
    public MeetingBookingDto.MySummary mySummary() {
        SysUser current = guard.currentUser();
        Map<String, Object> counts = bookingMapper.countMySummary(current.getId());
        MeetingBookingDto.MySummary summary = new MeetingBookingDto.MySummary();
        summary.setTodayCount(asLong(counts, "todayCount"));
        summary.setUpcomingCount(asLong(counts, "upcomingCount"));
        summary.setPendingResponseCount(asLong(counts, "pendingResponseCount"));
        LocalDateTime now = LocalDateTime.now();
        bookingMapper.findUserSchedule(current.getId(), now, now.plusDays(UPCOMING_DAYS)).stream()
                .filter(booking -> MeetingConstants.OCCUPYING_STATUSES.contains(booking.getStatus()))
                .filter(booking -> booking.getStartTime().isAfter(now))
                .min(Comparator.comparing(MeetingBooking::getStartTime))
                .ifPresent(booking -> {
                    summary.setNextTitle(booking.getTitle());
                    summary.setNextStartTime(DateTimeUtils.format(booking.getStartTime()));
                    summary.setNextRoomName(booking.getRoomName());
                });
        return summary;
    }

    /* ==================== 范围与条件 ==================== */

    /**
     * 行级数据范围。
     *
     * <p>普通用户即使显式传 {@code all} 也只拿到自己相关的单：范围由服务端解释，
     * 不是由前端"自觉不传"。这是防 IDOR 的第一道、也是唯一可信的一道。
     */
    private Scope resolveScope(String requestedScope, SysUser current) {
        String scope = StringUtils.hasText(requestedScope) ? requestedScope.trim() : SCOPE_ATTENDED;
        boolean seeAll = SCOPE_ALL.equals(scope) && guard.canSeeAll(current);
        if (seeAll) {
            return new Scope(null, null);
        }
        if (SCOPE_MINE.equals(scope)) {
            return new Scope(current.getId(), null);
        }
        List<Long> myBookingIds = attendeeMapper.findBookingIdsByUser(current.getId());
        if (myBookingIds.isEmpty()) {
            return new Scope(null, List.of());
        }
        return new Scope(null, myBookingIds);
    }

    /** 范围载体：organizerOnly 非空即"我发起的"，bookingIds 非空即"我参与的"（空集合=无数据） */
    private record Scope(Long organizerId, List<Long> bookingIds) {
        boolean empty() {
            return organizerId == null && bookingIds != null && bookingIds.isEmpty();
        }
    }

    /**
     * 把范围收敛到"我还没表态的邀约"（「待我響應」Tab 的真值）。
     *
     * <p>响应属于"替自己表态"，所以它永远按登录人判定：行政视野传 {@code scope=all} 也不放宽成
     * 全站待响应名单，否则这个 Tab 就变成别人的待办清单。
     * <p>{@code scope=mine}（我发起的）与 {@code respond=pending} 在数据上互斥：组织者的参会行
     * 落库即为已接受、且被口径排除，同时传两者只能为空集，这里直接给出空而不是悄悄丢一个条件。
     * <p>取值不在白名单内直接拒绝而不是回落成"不筛"：静默回落会让前端写错的参数变成全量列表。
     */
    private Scope applyRespondFilter(Scope scope, String respond, SysUser current) {
        if (!StringUtils.hasText(respond)) {
            return scope;
        }
        String value = respond.trim();
        if (!MeetingConstants.RESPOND_PENDING.equals(value)) {
            throw new BusinessException("不支持的響應篩選：" + value);
        }
        if (scope.organizerId() != null) {
            return new Scope(null, List.of());
        }
        List<Long> pendingIds = attendeeMapper.findPendingResponseBookingIds(current.getId());
        if (scope.bookingIds() == null) {
            return new Scope(null, pendingIds);
        }
        List<Long> bounded = pendingIds.stream().filter(scope.bookingIds()::contains).toList();
        return new Scope(null, bounded);
    }

    private LambdaQueryWrapper<MeetingBooking> buildWrapper(MeetingBookingDto.Query query, Scope scope) {
        LambdaQueryWrapper<MeetingBooking> wrapper = new LambdaQueryWrapper<>();
        applyRange(wrapper, query, scope);
        applyGroup(wrapper, query.getGroup());
        if (StringUtils.hasText(query.getStatus())) {
            wrapper.eq(MeetingBooking::getStatus, query.getStatus().trim());
        }
        wrapper.orderByAsc(MeetingBooking::getStartTime).orderByDesc(MeetingBooking::getId);
        return wrapper;
    }

    /** 列表与统计共用的条件部分（状态/Tab 维度也已同时传给统计，见 {@code countByStatus}） */
    private void applyRange(LambdaQueryWrapper<MeetingBooking> wrapper,
                            MeetingBookingDto.Query query, Scope scope) {
        if (scope.organizerId() != null) {
            wrapper.eq(MeetingBooking::getOrganizerId, scope.organizerId());
        } else if (scope.bookingIds() != null) {
            wrapper.in(MeetingBooking::getId, scope.bookingIds());
        }
        if (query.getFrom() != null) {
            wrapper.ge(MeetingBooking::getEndTime, query.getFrom());
        }
        if (query.getTo() != null) {
            wrapper.le(MeetingBooking::getStartTime, query.getTo());
        }
        if (query.getRoomId() != null) {
            wrapper.eq(MeetingBooking::getRoomId, query.getRoomId());
        }
        if (query.getOrganizerId() != null) {
            wrapper.eq(MeetingBooking::getOrganizerId, query.getOrganizerId());
        }
        if (query.getDepartmentId() != null) {
            wrapper.eq(MeetingBooking::getDepartmentId, query.getDepartmentId());
        }
        if (StringUtils.hasText(query.getBizType())) {
            wrapper.eq(MeetingBooking::getBizType, query.getBizType().trim());
        }
        if (StringUtils.hasText(query.getKeyword())) {
            String kw = query.getKeyword().trim();
            wrapper.and(w -> w.like(MeetingBooking::getBookingNo, kw).or().like(MeetingBooking::getTitle, kw));
        }
    }

    /** Tab 口径与统计卡逐字对齐：pending/ongoing 都只看占用中的单，done 含"过期未收尾" */
    private void applyGroup(LambdaQueryWrapper<MeetingBooking> wrapper, String group) {
        LocalDateTime now = LocalDateTime.now();
        if (!StringUtils.hasText(group)) {
            return;
        }
        switch (group.trim()) {
            case GROUP_PENDING -> wrapper.in(MeetingBooking::getStatus, MeetingConstants.OCCUPYING_STATUSES)
                    .gt(MeetingBooking::getStartTime, now);
            case GROUP_ONGOING -> wrapper.in(MeetingBooking::getStatus, MeetingConstants.OCCUPYING_STATUSES)
                    .le(MeetingBooking::getStartTime, now)
                    .gt(MeetingBooking::getEndTime, now);
            case GROUP_DONE -> wrapper.and(w -> w.in(MeetingBooking::getStatus,
                            List.of(MeetingConstants.STATUS_FINISHED, MeetingConstants.STATUS_CANCELLED,
                                    MeetingConstants.STATUS_RELEASED))
                            .or(inner -> inner.in(MeetingBooking::getStatus, MeetingConstants.OCCUPYING_STATUSES)
                                    .le(MeetingBooking::getEndTime, now)));
            default -> throw new BusinessException("不支持的列表分組：" + group);
        }
    }

    private MeetingBookingDto.Stats buildStats(MeetingBookingDto.Query query, Scope scope) {
        String keyword = StringUtils.hasText(query.getKeyword())
                ? "%" + query.getKeyword().trim() + "%" : null;
        Map<String, Object> row = bookingMapper.countByStatus(LocalDateTime.now(),
                scope.bookingIds(), scope.organizerId(), query.getRoomId(), query.getDepartmentId(),
                StringUtils.hasText(query.getBizType()) ? query.getBizType().trim() : null,
                StringUtils.hasText(query.getStatus()) ? query.getStatus().trim() : null,
                StringUtils.hasText(query.getGroup()) ? query.getGroup().trim() : null,
                query.getFrom(), query.getTo(), keyword);
        MeetingBookingDto.Stats stats = new MeetingBookingDto.Stats();
        stats.setTotal(asLong(row, "total"));
        stats.setPending(asLong(row, "pending"));
        stats.setOngoing(asLong(row, "ongoing"));
        stats.setFinished(asLong(row, "finished"));
        stats.setCancelled(asLong(row, "cancelled"));
        stats.setReleased(asLong(row, "released"));
        return stats;
    }

    /* ==================== 参会人 ==================== */

    /**
     * 解析参会人名单并落成实体行。
     *
     * <p>三条硬口径：
     * <ul>
     *   <li><b>组织者也落一行</b>（{@code attendee_type=organizer}）：我的日程只需 JOIN 本表，
     *       不会漏掉"我发起的"；</li>
     *   <li><b>查不到的人一律拒绝</b>：静默剔除会让组织者以为通知发出去了，
     *       而实际名单少一个人；</li>
     *   <li><b>离职/停用一律拒绝</b>：参会人来源必须是 HR 在职真值，历史会议不因离职被改写。</li>
     * </ul>
     */
    private List<MeetingAttendee> buildAttendees(MeetingBookingDto.CreateForm form, SysUser organizer) {
        Set<Long> required = distinctIds(form.getAttendeeUserIds(), organizer.getId());
        Set<Long> optional = distinctIds(form.getOptionalUserIds(), organizer.getId());
        required.removeAll(optional);
        return resolveAttendees(required, optional, form.getExternalAttendees(), organizer);
    }

    /** 改期时的名单解析：沿用原单的组织者（代订场景下操作人不是组织者） */
    private List<MeetingAttendee> buildAttendees(MeetingBookingDto.UpdateForm form, MeetingBooking booking) {
        Set<Long> required = distinctIds(form.getAttendeeUserIds(), booking.getOrganizerId());
        Set<Long> optional = distinctIds(form.getOptionalUserIds(), booking.getOrganizerId());
        required.removeAll(optional);
        SysUser organizer = organizerOf(booking);
        return resolveAttendees(required, optional, form.getExternalAttendees(), organizer);
    }

    private List<MeetingAttendee> resolveAttendees(Set<Long> required, Set<Long> optional,
                                                   List<String> externals, SysUser organizer) {
        List<Long> all = new ArrayList<>(required);
        all.addAll(optional);
        List<MeetingAttendee> rows = new ArrayList<>();
        MeetingAttendee organizerRow = new MeetingAttendee();
        organizerRow.setUserId(organizer.getId());
        organizerRow.setEmpNo(Objects.toString(organizer.getEmpId(), ""));
        organizerRow.setName(displayName(organizer));
        organizerRow.setDepartmentName(Objects.toString(organizer.getDepartment(), ""));
        organizerRow.setAttendeeType(MeetingConstants.ATTENDEE_ORGANIZER);
        organizerRow.setResponse(MeetingConstants.RESPOND_ACCEPTED);
        organizerRow.setNotifyStatus(MeetingConstants.NOTIFY_SKIPPED);
        organizerRow.setNotifyNote("組織者本人不發送邀約");
        rows.add(organizerRow);

        if (!all.isEmpty()) {
            List<SysUser> users = userMapper.selectList(new LambdaQueryWrapper<SysUser>()
                    .in(SysUser::getId, all));
            Map<Long, SysUser> byId = users.stream()
                    .collect(Collectors.toMap(SysUser::getId, user -> user, (left, right) -> left));
            List<String> missing = all.stream().filter(id -> !byId.containsKey(id)).map(String::valueOf).toList();
            if (!missing.isEmpty()) {
                throw new BusinessException("參會人已不存在於系統，請重新選擇：" + String.join("、", missing));
            }
            List<String> inactive = byId.values().stream()
                    .filter(user -> user.getStatus() == null || user.getStatus() != 1)
                    .map(MeetingBookingServiceImpl::displayName).toList();
            if (!inactive.isEmpty()) {
                throw new BusinessException("以下人員已停用或離職，不可作為參會人：" + String.join("、", inactive));
            }
            for (Long id : all) {
                SysUser user = byId.get(id);
                MeetingAttendee row = new MeetingAttendee();
                row.setUserId(id);
                row.setEmpNo(Objects.toString(user.getEmpId(), ""));
                row.setName(displayName(user));
                row.setDepartmentName(Objects.toString(user.getDepartment(), ""));
                row.setAttendeeType(required.contains(id)
                        ? MeetingConstants.ATTENDEE_REQUIRED : MeetingConstants.ATTENDEE_OPTIONAL);
                row.setResponse(MeetingConstants.RESPOND_PENDING);
                rows.add(row);
            }
        }
        if (externals != null) {
            externals.stream().filter(StringUtils::hasText).map(String::trim).distinct()
                    .limit(50)
                    .forEach(name -> {
                        MeetingAttendee row = new MeetingAttendee();
                        row.setName(name.length() > 64 ? name.substring(0, 64) : name);
                        row.setAttendeeType(MeetingConstants.ATTENDEE_EXTERNAL);
                        row.setResponse(MeetingConstants.RESPOND_ACCEPTED);
                        row.setNotifyStatus(MeetingConstants.NOTIFY_SKIPPED);
                        row.setNotifyNote("外部參會人無系統帳號");
                        rows.add(row);
                    });
        }
        return rows;
    }

    /**
     * 同步改期后的名单。
     *
     * <p>已存在的人保留其响应记录（一个人已经"接受"过，不该因为组织者改了议程就被重置），
     * 只有时间/房间变化时才整体重置（见 {@link #resetResponses}）。
     */
    private void syncAttendees(long bookingId, List<MeetingAttendee> desired, SysUser operator) {
        List<MeetingAttendee> existing = attendeeMapper.findByBooking(bookingId);
        Map<Long, MeetingAttendee> existingByUser = existing.stream()
                .filter(row -> row.getUserId() != null)
                .collect(Collectors.toMap(MeetingAttendee::getUserId, row -> row, (left, right) -> left));

        Set<Long> keep = new LinkedHashSet<>();
        for (MeetingAttendee row : desired) {
            if (row.getUserId() == null) {
                row.setBookingId(bookingId);
                row.setCreatedBy(operator.getName());
                row.setUpdatedBy(operator.getName());
                attendeeMapper.insert(row);
                continue;
            }
            keep.add(row.getUserId());
            MeetingAttendee old = existingByUser.get(row.getUserId());
            if (old == null) {
                row.setBookingId(bookingId);
                row.setCreatedBy(operator.getName());
                row.setUpdatedBy(operator.getName());
                attendeeMapper.insert(row);
            } else if (!Objects.equals(old.getAttendeeType(), row.getAttendeeType())) {
                attendeeMapper.update(null, new LambdaUpdateWrapper<MeetingAttendee>()
                        .eq(MeetingAttendee::getId, old.getId())
                        .set(MeetingAttendee::getAttendeeType, row.getAttendeeType())
                        .set(MeetingAttendee::getUpdatedBy, operator.getName()));
            }
        }
        // 被移出的人：逻辑删行（历史会议的名单以审计快照为准，不靠留存脏行来还原）
        existingByUser.entrySet().stream()
                .filter(entry -> !keep.contains(entry.getKey())
                        && !MeetingConstants.ATTENDEE_ORGANIZER.equals(entry.getValue().getAttendeeType()))
                .forEach(entry -> attendeeMapper.deleteById(entry.getValue().getId()));
    }

    /** 时间或房间变了 → 全部非组织者响应重置为 pending：旧表态是针对旧安排做出的 */
    private void resetResponses(long bookingId, SysUser operator) {
        attendeeMapper.update(null, new LambdaUpdateWrapper<MeetingAttendee>()
                .eq(MeetingAttendee::getBookingId, bookingId)
                .ne(MeetingAttendee::getAttendeeType, MeetingConstants.ATTENDEE_ORGANIZER)
                .set(MeetingAttendee::getResponse, MeetingConstants.RESPOND_PENDING)
                .set(MeetingAttendee::getRespondAt, null)
                .set(MeetingAttendee::getUpdatedBy, operator.getName()));
    }

    private SysUser organizerOf(MeetingBooking booking) {
        SysUser organizer = userMapper.selectById(booking.getOrganizerId());
        if (organizer == null) {
            throw new BusinessException("會議組織者帳號已不存在，請聯系行政處理");
        }
        return organizer;
    }

    /** 邀约接收人：必参 + 选参（组织者与外部人不在内） */
    private static List<Long> inviteReceivers(List<MeetingAttendee> attendees) {
        return attendees.stream()
                .filter(row -> row.getUserId() != null)
                .filter(row -> MeetingConstants.ATTENDEE_REQUIRED.equals(row.getAttendeeType())
                        || MeetingConstants.ATTENDEE_OPTIONAL.equals(row.getAttendeeType()))
                .map(MeetingAttendee::getUserId)
                .distinct()
                .toList();
    }

    /* ==================== 冲突与校验 ==================== */

    private void rejectConflicts(List<MeetingBooking> conflicts, String head) {
        if (!conflicts.isEmpty()) {
            throw conflict(head, conflicts);
        }
    }

    /** 冲突提示必须点名"被谁的哪场会占了"：只说"时段冲突"会让人反复试错 */
    private BusinessException conflict(String head, List<MeetingBooking> conflicts) {
        String detail = conflicts.stream().limit(3)
                .map(booking -> String.format("%s「%s」（%s，%s–%s）",
                        booking.getBookingNo(), booking.getTitle(),
                        Objects.toString(booking.getOrganizerName(), ""),
                        DateTimeUtils.format(booking.getStartTime()),
                        DateTimeUtils.format(booking.getEndTime())))
                .collect(Collectors.joining("；"));
        String more = conflicts.size() > 3 ? " 等 " + conflicts.size() + " 場" : "";
        return new BusinessException(head + "：" + detail + more);
    }

    private void requireVersion(Integer expected, MeetingBooking booking) {
        if (expected == null) {
            throw new BusinessException("缺少版本號，請刷新後重試");
        }
        if (!expected.equals(booking.getVersion())) {
            throw new BusinessException("該會議已被他人修改，請刷新後重試");
        }
    }

    private String resolveBizType(String raw) {
        String value = StringUtils.hasText(raw) ? raw.trim() : MeetingConstants.BIZ_GENERAL;
        if (!MeetingConstants.BIZ_TYPES.contains(value)) {
            throw new BusinessException("不支持的關聯業務類型：" + value);
        }
        return value;
    }

    private MeetingBooking requireBooking(long id) {
        MeetingBooking booking = bookingMapper.selectById(id);
        if (booking == null) {
            throw new BusinessException("會議記錄不存在或已刪除");
        }
        return booking;
    }

    /* ==================== 视图转换 ==================== */

    private List<MeetingBookingDto.VO> toVoList(List<MeetingBooking> bookings, SysUser current) {
        if (bookings.isEmpty()) {
            return List.of();
        }
        // 列表页的"我的身份"、参会人数与房间规则各一次 IN 取回，不在循环里逐场查：
        // 签到按钮与释放倒计时每行都要用房间规则，逐行查会变成 20 行 × 2 次往返
        List<Long> ids = bookings.stream().map(MeetingBooking::getId).toList();
        Map<Long, List<MeetingAttendee>> byBooking = attendeeMapper.findByBookings(ids).stream()
                .collect(Collectors.groupingBy(MeetingAttendee::getBookingId));
        List<Long> roomIds = bookings.stream().map(MeetingBooking::getRoomId)
                .filter(Objects::nonNull).distinct().toList();
        Map<Long, MeetingRoom> rooms = roomIds.isEmpty() ? Map.of()
                : roomMapper.selectBatchIds(roomIds).stream()
                        .collect(Collectors.toMap(MeetingRoom::getId, room -> room, (left, right) -> left));
        MeetingRuleService.GlobalRule global = ruleService.globalRule();
        // 纪要状态与入口一次批量取：逐行查会变成 20 行 × 1 次往返，而列表页每次切 Tab 都要重跑
        Map<Long, MeetingMinutes> minutesByBooking = minutesMapper.findByBookings(ids).stream()
                .collect(Collectors.toMap(MeetingMinutes::getBookingId, row -> row, (left, right) -> left));
        boolean mayRecordOwn = guard.canRecordMinutes(current);
        boolean mayRecordAsAdmin = guard.canOperateRecords(current);
        List<MeetingBookingDto.VO> records = new ArrayList<>(bookings.size());
        for (MeetingBooking booking : bookings) {
            List<MeetingAttendee> attendees = byBooking.getOrDefault(booking.getId(), List.of());
            MeetingBookingDto.VO vo = toVO(booking, current,
                    rooms.get(booking.getRoomId()), global, findMyRow(attendees, current.getId()));
            vo.setAttendees(attendees.stream().map(this::toAttendeeVO).toList());
            applyMinutes(vo, minutesByBooking.get(booking.getId()), mayRecordOwn, mayRecordAsAdmin);
            records.add(vo);
        }
        return records;
    }

    /**
     * 把纪要状态挂到会议行上。
     *
     * <p>canMinutes 在服务端算而不是让前端复算：前端只看到 myRole/phase，看不到动作权与行政代录的分支，
     * 自己拼一份判定迟早与 {@code MeetingMinutesServiceImpl.requireRecordable} 漂移，
     * 结果是列表给了入口、点进去被拒——这种"按钮能点但一定失败"比没有按钮更糟。
     *
     * <p>谁能拿到入口同样要跟 requireRecordable 同口径：行政代录本来就不要求他是这场会的人
     * （预约记录是全量台账，行政替他人补纪要与代取消/代释放同源）。早先这里再要求一次 related，
     * 就会服务层允许、列表却不给入口，等于把行政代录能力锁在按钮后面。
     *
     * @param mayRecordOwn     持有使用侧 edit（meeting-my:edit）：只给自己相关的会记纪要
     * @param mayRecordAsAdmin 持有行政侧 edit（meeting-record:edit）：可替任意一场会代录
     */
    private void applyMinutes(MeetingBookingDto.VO vo, MeetingMinutes minutes,
                              boolean mayRecordOwn, boolean mayRecordAsAdmin) {
        vo.setMinutesId(minutes == null ? null : minutes.getId());
        vo.setMinutesStatus(minutes == null ? "none" : minutes.getStatus());
        boolean related = vo.getMyRole() != null && !"none".equals(vo.getMyRole());
        boolean phaseAllowed = !NON_RECORDABLE_STATUSES.contains(vo.getStatus())
                && RECORDABLE_PHASES.contains(vo.getPhase());
        vo.setCanMinutes((mayRecordAsAdmin || (related && mayRecordOwn)) && phaseAllowed);
    }

    /** 单行兜底入口（改期/响应等写后立即回显的路径）：自己补齐房间、规则与"我"的行 */
    private MeetingBookingDto.VO toVO(MeetingBooking booking, SysUser current) {
        return toVO(booking, current, roomMapper.selectById(booking.getRoomId()), ruleService.globalRule(),
                current.getId() == null ? null : attendeeMapper.selectOne(new LambdaQueryWrapper<MeetingAttendee>()
                        .eq(MeetingAttendee::getBookingId, booking.getId())
                        .eq(MeetingAttendee::getUserId, current.getId())
                        .last("LIMIT 1")));
    }

    private MeetingBookingDto.VO toVO(MeetingBooking booking, SysUser current, MeetingRoom room) {
        return toVO(booking, current, room, ruleService.globalRule(), null);
    }

    /**
     * 视图转换核心。
     *
     * <p>房间、全局规则与"我的参会行"一律由调用方备好再传进来：这三样在列表页是共享数据，
     * 在核心里各查一次会让一页 20 行变成 60 次往返；但函数签名也因此必须携带它们，
     * 这是"批量取数"与"少参数"之间必须选的哪一头。
     */
    private MeetingBookingDto.VO toVO(MeetingBooking booking, SysUser current, MeetingRoom room,
                                      MeetingRuleService.GlobalRule global, MeetingAttendee mine) {
        MeetingBookingDto.VO vo = new MeetingBookingDto.VO();
        LocalDateTime now = LocalDateTime.now();
        vo.setId(booking.getId());
        vo.setBookingNo(booking.getBookingNo());
        vo.setTitle(booking.getTitle());
        vo.setStatus(booking.getStatus());
        vo.setPhase(phase(booking, now));
        vo.setStartTime(DateTimeUtils.format(booking.getStartTime()));
        vo.setEndTime(DateTimeUtils.format(booking.getEndTime()));
        vo.setTimeText(timeText(booking.getStartTime(), booking.getEndTime()));
        vo.setDurationMinutes(MeetingNotifyDispatcher.durationMinutes(booking.getStartTime(), booking.getEndTime()));
        vo.setRoomId(booking.getRoomId());
        vo.setRoomNo(booking.getRoomNo());
        vo.setRoomName(booking.getRoomName());
        vo.setRoomLocation(booking.getRoomLocation());
        vo.setOrganizerId(booking.getOrganizerId());
        vo.setOrganizerEmpNo(booking.getOrganizerEmpNo());
        vo.setOrganizerName(booking.getOrganizerName());
        vo.setDepartmentId(booking.getDepartmentId());
        vo.setDepartmentName(booking.getDepartmentName());
        vo.setDelegateForId(booking.getDelegateForId());
        vo.setDelegateForName(booking.getDelegateForName());
        vo.setAttendeeCount(booking.getAttendeeCount());
        vo.setDescription(booking.getDescription());
        vo.setOnlineMeetingUrl(booking.getOnlineMeetingUrl());
        vo.setExternalAttendees(booking.getExternalAttendees());
        vo.setBizType(booking.getBizType());
        vo.setBizId(booking.getBizId());
        vo.setBizNo(booking.getBizNo());
        vo.setBizUrl(booking.getBizUrl());
        vo.setDelegateForId(booking.getDelegateForId());
        vo.setDelegateForName(booking.getDelegateForName());
        vo.setMyRole(guard.myRole(booking, current));
        vo.setMyResponse(MeetingConstants.ATTENDEE_ORGANIZER.equals(vo.getMyRole())
                ? MeetingConstants.RESPOND_ACCEPTED : guard.myResponse(booking, current));
        vo.setSeriesId(booking.getSeriesId());
        vo.setSeriesSeq(booking.getSeriesSeq());
        boolean writable = guard.isOrganizer(booking, current) || guard.canOperateRecords(current);
        boolean occupying = MeetingConstants.OCCUPYING_STATUSES.contains(booking.getStatus());
        vo.setCanEdit(writable && occupying && booking.getStartTime().isAfter(now));
        vo.setCanCancel(writable && occupying && booking.getEndTime().isAfter(now));
        // 按钮可见性只看服务端结论：前端拿 canXxx 决定渲不渲染，不再自己复算一遍窗口口径
        // 释放必须与 release() 的护栏同口径：未开始的会不给“釋放房間”入口，否则点了只会碰壁
        vo.setCanRelease(occupying && !booking.getStartTime().isAfter(now) && guard.canOperateRecords(current));
        vo.setCanFinish(writable && occupying && !booking.getStartTime().isAfter(now));
        vo.setCheckinRequired(room != null && Integer.valueOf(1).equals(room.getCheckinRequired()));
        if (occupying && booking.getStartTime() != null) {
            LocalDateTime openAt = booking.getStartTime()
                    .minusMinutes(Math.max(0, global.getCheckinOpenMinutes()));
            vo.setCheckinOpenAt(DateTimeUtils.format(openAt));
            Integer configured = room == null ? null : room.getReleaseAfterMinutes();
            int releaseAfter = configured != null && configured > 0
                    ? configured : global.getReleaseAfterMinutes();
            vo.setCheckinDeadlineAt(DateTimeUtils.format(
                    booking.getStartTime().plusMinutes(Math.max(1, releaseAfter))));
            boolean arrived = mine != null && mine.getCheckinAt() != null;
            vo.setCanCheckin(occupying && !arrived && mine != null
                    && !now.isBefore(openAt) && !now.isAfter(booking.getEndTime()));
        } else {
            vo.setCanCheckin(false);
        }
        vo.setCheckinAt(DateTimeUtils.format(booking.getCheckinAt()));
        vo.setActualEndAt(DateTimeUtils.format(booking.getActualEndAt()));
        vo.setNoShow(booking.getNoShowFlag());
        vo.setCancelReason(booking.getCancelReason());
        vo.setReleaseReason(booking.getReleaseReason());
        vo.setReleaseAt(DateTimeUtils.format(booking.getReleaseAt()));
        vo.setVersion(booking.getVersion());
        vo.setCreatedBy(booking.getCreatedBy());
        vo.setCreatedAt(DateTimeUtils.format(booking.getCreatedAt()));
        vo.setUpdatedBy(booking.getUpdatedBy());
        vo.setUpdatedAt(DateTimeUtils.format(booking.getUpdatedAt()));
        return vo;
    }

    /** 派生态：终态直接取状态，占用单再按时间与现在比较 */
    private static String phase(MeetingBooking booking, LocalDateTime now) {
        if (!MeetingConstants.OCCUPYING_STATUSES.contains(booking.getStatus())) {
            return booking.getStatus();
        }
        if (booking.getEndTime().isBefore(now) || booking.getEndTime().isEqual(now)) {
            return PHASE_ENDED;
        }
        return booking.getStartTime().isAfter(now) ? PHASE_PENDING : PHASE_ONGOING;
    }

    private static String timeText(LocalDateTime start, LocalDateTime end) {
        if (start == null || end == null) {
            return "";
        }
        String date = DateTimeUtils.format(start).substring(0, 10);
        return date + " " + hourMinute(start) + "–" + hourMinute(end);
    }

    private static String hourMinute(LocalDateTime value) {
        return String.format("%02d:%02d", value.getHour(), value.getMinute());
    }

    private MeetingBookingDto.ScheduleVO toScheduleVO(MeetingBooking booking, SysUser current) {
        MeetingBookingDto.ScheduleVO vo = new MeetingBookingDto.ScheduleVO();
        vo.setBookingId(booking.getId());
        vo.setBookingNo(booking.getBookingNo());
        vo.setTitle(booking.getTitle());
        vo.setDate(DateTimeUtils.format(booking.getStartTime()).substring(0, 10));
        vo.setStartTime(DateTimeUtils.format(booking.getStartTime()));
        vo.setEndTime(DateTimeUtils.format(booking.getEndTime()));
        vo.setRoomName(booking.getRoomName());
        vo.setRoomLocation(booking.getRoomLocation());
        vo.setStatus(booking.getStatus());
        vo.setPhase(phase(booking, LocalDateTime.now()));
        vo.setMyRole(guard.myRole(booking, current));
        vo.setMyResponse(MeetingConstants.ATTENDEE_ORGANIZER.equals(vo.getMyRole())
                ? MeetingConstants.RESPOND_ACCEPTED : guard.myResponse(booking, current));
        vo.setCanCheckin(false);
        return vo;
    }

    private MeetingBookingDto.AttendeeVO toAttendeeVO(MeetingAttendee attendee) {
        MeetingBookingDto.AttendeeVO vo = new MeetingBookingDto.AttendeeVO();
        vo.setId(attendee.getId());
        vo.setUserId(attendee.getUserId());
        vo.setEmpNo(attendee.getEmpNo());
        vo.setName(attendee.getName());
        vo.setDepartmentName(attendee.getDepartmentName());
        vo.setAttendeeType(attendee.getAttendeeType());
        vo.setResponse(attendee.getResponse());
        vo.setRespondAt(DateTimeUtils.format(attendee.getRespondAt()));
        vo.setNotifyStatus(attendee.getNotifyStatus());
        vo.setNotifyNote(attendee.getNotifyNote());
        vo.setCheckinAt(DateTimeUtils.format(attendee.getCheckinAt()));
        vo.setInvalidReason(attendee.getInvalidReason());
        return vo;
    }

    private MeetingBookingDto.NotifyVO toNotifyVO(MeetingNotifyLog entry) {
        MeetingBookingDto.NotifyVO vo = new MeetingBookingDto.NotifyVO();
        vo.setId(entry.getId());
        vo.setEventCode(entry.getEventCode());
        vo.setScenario(entry.getScenario());
        vo.setReceiverName(entry.getReceiverName());
        vo.setReceiverEmpNo(entry.getReceiverEmpNo());
        vo.setDingtalkBound(StringUtils.hasText(entry.getReceiverDingtalkId()));
        vo.setSendStatus(entry.getSendStatus());
        vo.setRetryCount(entry.getRetryCount());
        vo.setErrorMsg(entry.getErrorMsg());
        vo.setUpdatedAt(DateTimeUtils.format(entry.getUpdatedAt()));
        return vo;
    }

    private MeetingBookingDto.EventVO toEventVO(MeetingEvent event) {
        MeetingBookingDto.EventVO vo = new MeetingBookingDto.EventVO();
        vo.setId(event.getId());
        vo.setEventCode(event.getEventCode());
        vo.setReason(event.getReason());
        vo.setOperatorName(event.getOperatorName());
        vo.setOperatorEmpNo(event.getOperatorEmpNo());
        vo.setOccurredAt(DateTimeUtils.format(event.getOccurredAt()));
        vo.setBeforeJson(event.getBeforeJson());
        vo.setAfterJson(event.getAfterJson());
        return vo;
    }

    private MeetingBookingDto.CreateResult createResult(MeetingBooking booking, boolean inviteQueued,
                                                       boolean scenarioActive, int skipped) {
        MeetingBookingDto.CreateResult result = new MeetingBookingDto.CreateResult();
        result.setBookingId(booking.getId());
        result.setBookingNo(booking.getBookingNo());
        result.setInviteQueued(inviteQueued);
        result.setScenarioActive(scenarioActive);
        result.setNotifySkippedCount(skipped);
        return result;
    }

    /* ==================== 快照与工具 ==================== */

    private void applyRoomSnapshot(MeetingBooking booking, MeetingRoom room) {
        booking.setRoomId(room.getId());
        booking.setRoomNo(room.getRoomNo());
        booking.setRoomName(room.getRoomName());
        booking.setRoomLocation(roomLocation(room));
    }

    private void applyOrganizerSnapshot(MeetingBooking booking, SysUser organizer) {
        booking.setOrganizerId(organizer.getId());
        booking.setOrganizerEmpNo(Objects.toString(organizer.getEmpId(), ""));
        booking.setOrganizerName(displayName(organizer));
        booking.setDepartmentId(organizer.getDepartmentId());
        booking.setDepartmentName(Objects.toString(organizer.getDepartment(), ""));
    }

    /** 房间位置快照：城市在最前，跨城同名会议室靠它区分（与 MeetingRoomServiceImpl.locationText 同口径） */
    private static String roomLocation(MeetingRoom room) {
        return java.util.stream.Stream.of(room.getCity(), room.getCampus(), room.getBuilding(),
                        room.getFloorCode(), room.getLocationDesc())
                .filter(StringUtils::hasText)
                .map(String::trim)
                .collect(Collectors.joining(" · "));
    }

    /** 审计快照：只取会改变预约结果与邀约内容的字段 */
    private Map<String, Object> snapshot(MeetingBooking booking) {
        Map<String, Object> map = new java.util.LinkedHashMap<>();
        map.put("bookingNo", booking.getBookingNo());
        map.put("title", booking.getTitle());
        map.put("roomId", booking.getRoomId());
        map.put("roomName", booking.getRoomName());
        map.put("startTime", DateTimeUtils.format(booking.getStartTime()));
        map.put("endTime", DateTimeUtils.format(booking.getEndTime()));
        map.put("attendeeCount", booking.getAttendeeCount());
        map.put("status", booking.getStatus());
        map.put("bizType", booking.getBizType());
        map.put("bizId", booking.getBizId());
        return map;
    }

    /**
     * 请求内容摘要。
     *
     * <p>幂等键只能证明"这是同一次点击"，不能证明"内容还是同一份"：
     * 前端复用 key 却改了时间时，服务端必须拒绝而不是把改动静默丢掉，
     * 否则用户以为改成了，实际占着的还是旧窗口。
     *
     * <p>包级可见仅供单测复现同一算法，不是对外 API。
     */
    static String hash(MeetingBookingDto.CreateForm form) {
        List<Long> required = sorted(form.getAttendeeUserIds());
        List<Long> optional = sorted(form.getOptionalUserIds());
        List<String> externals = form.getExternalAttendees() == null ? List.of()
                : form.getExternalAttendees().stream().filter(Objects::nonNull).map(String::trim)
                        .filter(StringUtils::hasText).sorted().toList();
        String canonical = String.join("|",
                Objects.toString(trimToNull(form.getTitle()), ""),
                String.valueOf(form.getRoomId()),
                Objects.toString(form.getStartTime(), ""),
                Objects.toString(form.getEndTime(), ""),
                String.valueOf(required), String.valueOf(optional), String.valueOf(externals),
                Objects.toString(trimToNull(form.getDescription()), ""),
                Objects.toString(trimToNull(form.getOnlineMeetingUrl()), ""),
                Objects.toString(trimToNull(form.getBizType()), ""),
                String.valueOf(form.getBizId()),
                // 代订人参与哈希：同一幂等键换"挂名给谁"必须是不同请求，
                // 否则重放一次就把会议悄悄换到别人名下
                String.valueOf(form.getDelegateForId()));
        return sha256(canonical);
    }

    /** 摘要统一走 RequestHashUtil：预约与周期系列必须对"内容变了没有"给出同一个答案 */
    private static String sha256(String value) {
        return RequestHashUtil.sha256Hex(value);
    }

    private static List<Long> sorted(List<Long> ids) {
        return ids == null ? List.of() : ids.stream().filter(Objects::nonNull).distinct()
                .sorted(Comparator.naturalOrder()).toList();
    }

    private static Set<Long> distinctIds(List<Long> ids, Long exclude) {
        return ids == null ? new LinkedHashSet<>() : ids.stream()
                .filter(Objects::nonNull)
                .filter(id -> !Objects.equals(id, exclude))
                .collect(Collectors.toCollection(LinkedHashSet::new));
    }

    private static String joinExternal(List<String> names) {
        if (names == null) {
            return null;
        }
        String joined = names.stream().filter(StringUtils::hasText).map(String::trim).distinct()
                .collect(Collectors.joining("、"));
        return joined.isEmpty() ? null : truncate(joined, 500);
    }

    private static String displayName(SysUser user) {
        return StringUtils.hasText(user.getName()) ? user.getName() : user.getUsername();
    }

    private static long asLong(Map<String, Object> row, String key) {
        if (row == null) {
            return 0L;
        }
        Object value = row.get(key);
        return value instanceof Number number ? number.longValue() : 0L;
    }

    private static String trimToNull(String value) {
        return StringUtils.hasText(value) ? value.trim() : null;
    }

    private static String trimToEmpty(String value) {
        return value == null ? "" : value.trim();
    }

    private static String truncate(String value, int max) {
        if (value == null) {
            return null;
        }
        return value.length() > max ? value.substring(0, max) : value;
    }
}
