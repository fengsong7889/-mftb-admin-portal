package com.mftb.admin.service;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.MeetingConstants;
import com.mftb.admin.dto.MeetingBookingDto;
import com.mftb.admin.dto.MeetingSeriesDto;
import com.mftb.admin.entity.MeetingBooking;
import com.mftb.admin.entity.MeetingRoom;
import com.mftb.admin.entity.MeetingSeries;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.MeetingBookingMapper;
import com.mftb.admin.mapper.MeetingRoomMapper;
import com.mftb.admin.mapper.MeetingSeriesMapper;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.RequestHashUtil;
import com.mftb.admin.util.DateTimeUtils;
import com.mftb.admin.util.JsonUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;
import com.mftb.admin.service.impl.MeetingBookingServiceImpl;

/**
 * 周期会议系列（M2）：模板校验 → 一次性物化实例 → 三档取消 → 只影响未来的改期。
 *
 * <p>三条不可让的语义，全部在服务端钉住：
 * <ol>
 *   <li><b>历史实例永不改写</b>：取消与改模板都只作用于"仍占用窗口的未来场次"。
 *       已开过的会带着自己的签到、参会人与审计才是当时发生的事实，跟着模板一起变等于篡改历史；</li>
 *   <li><b>冲突场次跳过而不是整批失败</b>：每周例会有两场撞上别人的会，应该建出剩下的并逐条列出被跳过的
 *       那两场与原因；整批回滚会让用户以为"功能坏了"而反复重试；</li>
 *   <li><b>规则不合法不跳过</b>：时长超上限、跨天这类模板级错误直接拒绝创建，
 *       降级成"跳过"会把配置错误伪装成"那两天刚好没订上"。</li>
 * </ol>
 *
 * <p>每场实例都走 {@link MeetingBookingService#materializeInstance}，与手工新建共用同一套
 * 锁→规则→冲突→落单→审计实现：周期与单次各写一份，必然出现"手工建会挡了容量、周期建会没挡"。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class MeetingSeriesService {

    private static final String WEEKDAY_TEXT = "一二三四五六日";
    /** 邀请通知只发第一条实例：一场系列发 N 遍同一份名单等于轰炸，后续日期在详情与日程里可见 */
    private static final int INVITE_ON_SEQ = 1;

    private final MeetingSeriesMapper seriesMapper;
    private final MeetingBookingMapper bookingMapper;
    private final MeetingRoomMapper roomMapper;
    private final MeetingAccessGuard guard;
    private final MeetingAuditRecorder auditRecorder;
    private final MeetingBookingService bookingService;
    private final MeetingBlacklistService blacklistService;
    private final BizSeqService bizSeqService;

    /* ==================== 创建 ==================== */

    @Transactional(rollbackFor = Exception.class)
    public MeetingSeriesDto.CreateResult create(MeetingSeriesDto.CreateForm form) {
        SysUser current = guard.currentUser();
        blacklistService.assertNotBlacklisted(current);
        // 代订资格在整个系列上裁定一次：实例阶段逐场再查一次用户与权限，
        // 100 场就是 200 次无谓往返，而且中途权限被收回还会出现"前 3 场成功、后 97 场失败"的半套状态
        SysUser delegate = guard.resolveDelegateFor(form.getDelegateForId(), current);
        if (delegate != null) {
            blacklistService.assertNotBlacklisted(delegate.getId(), "實際使用人");
            form.setAttendeeUserIds(
                    MeetingBookingServiceImpl.withDelegate(form.getAttendeeUserIds(), delegate.getId()));
        }
        MeetingRoom room = roomMapper.selectForUpdate(form.getRoomId());
        if (room == null) {
            throw new BusinessException("會議室不存在或已刪除");
        }

        String requestKey = trimToNull(form.getRequestKey());
        String requestHash = hash(form);
        if (requestKey != null) {
            MeetingSeries existing = seriesMapper.findByIdempotencyKey(current.getId(), requestKey);
            if (existing != null) {
                if (!Objects.equals(requestHash, existing.getRequestHash())) {
                    throw new BusinessException("同一請求編號已對應另一組週期會議，請重新提交");
                }
                return resultOf(existing, false, 0);
            }
        }

        LocalDateTime[] first = windowOf(form, form.getStartDate());
        MeetingBookingDto.CreateForm template = toInstanceForm(form, first[0], first[1]);
        int attendeeCount = attendeeCount(form);
        // 模板级校验一次即可：日期递从不改变时长、粒度与每日窗
        ruleValidate(room, template, attendeeCount);

        MeetingSeries series = new MeetingSeries();
        applyTemplate(series, form, room, current, requestKey, requestHash, attendeeCount);
        series.setSeriesNo(bizSeqService.next(MeetingConstants.SEQ_SERIES));
        series.setStatus(MeetingConstants.SERIES_ACTIVE);
        series.setGeneratedCount(0);
        series.setSkippedCount(0);
        series.setVersion(0);
        try {
            seriesMapper.insert(series);
        } catch (org.springframework.dao.DuplicateKeyException e) {
            throw new BusinessException("週期系列編號衝突，請刷新後重試");
        }

        List<LocalDate> days = occurrences(form);
        if (days.isEmpty()) {
            throw new BusinessException("按所選頻率沒有生成任何日期，請檢查開始日期與星期設定");
        }
        int generated = 0;
        int seq = 0;
        List<MeetingSeriesDto.SkippedVO> skipped = new ArrayList<>();
        MeetingBooking firstBooking = null;
        for (LocalDate day : days) {
            seq++;
            LocalDateTime[] window = windowOf(form, day);
            MeetingBookingDto.CreateForm instance = toInstanceForm(form, window[0], window[1]);
            MeetingBooking booking = bookingService.materializeInstance(
                    instance, current, delegate, series.getId(), seq);
            if (booking == null) {
                MeetingSeriesDto.SkippedVO item = new MeetingSeriesDto.SkippedVO();
                item.setSeq(seq);
                item.setStartTime(DateTimeUtils.format(window[0]));
                item.setEndTime(DateTimeUtils.format(window[1]));
                item.setReason("該時段會議室已被其他會議佔用");
                skipped.add(item);
                continue;
            }
            if (firstBooking == null) {
                firstBooking = booking;
            }
            generated++;
        }
        if (generated == 0) {
            // 一场都没建出来：把系列本身回滚（抛异常），留下"整批未生效"的确定结论，
            // 而不是存一个 generatedCount=0 的空系列挂在列表里
            throw new BusinessException("所選時段已全部被佔用，未生成任何會議，請調整時間或頻率");
        }

        int updated = seriesMapper.update(null, new LambdaUpdateWrapper<MeetingSeries>()
                .eq(MeetingSeries::getId, series.getId())
                .set(MeetingSeries::getGeneratedCount, generated)
                .set(MeetingSeries::getSkippedCount, days.size() - generated)
                .set(MeetingSeries::getUpdatedBy, current.getName())
                .setSql("version = version + 1"));
        if (updated == 0) {
            throw new BusinessException("週期系列保存失敗，請刷新後重試");
        }
        series.setGeneratedCount(generated);
        series.setSkippedCount(days.size() - generated);

        auditRecorder.recordBooking(firstBooking == null ? null : firstBooking.getId(), series.getRoomId(),
                series.getSeriesNo(), MeetingConstants.EVENT_SERIES_CREATE, null, null,
                Map.of("seriesNo", series.getSeriesNo(), "generated", generated,
                        "skipped", days.size() - generated), current, requestKey);

        MeetingSeriesDto.CreateResult result = resultOf(series, true, skipped.size());
        result.setSkipped(skipped);
        if (firstBooking != null && INVITE_ON_SEQ == 1) {
            MeetingNotifyDispatcher.EnqueueResult queued = bookingService.notifySeriesFirstInvite(firstBooking);
            result.setInviteQueued(queued.isScenarioActive() && queued.getQueued() > 0);
            result.setNotifySkippedCount(queued.getSkipped());
        }
        log.info("週期會議已創建: seriesNo={}, generated={}, skipped={}",
                series.getSeriesNo(), generated, days.size() - generated);
        return result;
    }

    /* ==================== 详情与预览 ==================== */

    /** 实例日期预览：与创建共用同一个 {@link #occurrences} 算法，避免"预览说 12 场、实际建出 11 场" */
    public List<MeetingSeriesDto.PreviewVO> preview(MeetingSeriesDto.CreateForm form) {
        validateShape(form);
        return occurrences(form).stream().map(day -> {
            LocalDateTime[] window = windowOf(form, day);
            MeetingSeriesDto.PreviewVO vo = new MeetingSeriesDto.PreviewVO();
            vo.setDate(DateTimeUtils.format(day));
            vo.setWeekdayText("週" + WEEKDAY_TEXT.charAt(window[0].getDayOfWeek().getValue() - 1));
            vo.setStartTime(DateTimeUtils.format(window[0]));
            vo.setEndTime(DateTimeUtils.format(window[1]));
            return vo;
        }).collect(Collectors.toList());
    }

    public MeetingSeriesDto.VO detail(long id) {
        SysUser current = guard.currentUser();
        MeetingSeries series = requireSeries(id);
        requireReadable(series, current);
        MeetingSeriesDto.VO vo = toVO(series);
        List<MeetingBooking> instances = bookingMapper.findSeriesInstances(id);
        vo.setInstances(instances.stream().map(booking -> bookingService.viewForSeries(booking, current)).toList());
        return vo;
    }

    /* ==================== 取消 ==================== */

    /**
     * 三档取消。
     *
     * <p>{@code this} 只动指定那一场的实例，系列本身保持 active——"这周不开会"不等于"这个例会废了"，
     * 这是用户选"仅此次"时的真实意图。{@code future}/{@code all} 才把系列标成 cancelled。
     */
    @Transactional(rollbackFor = Exception.class)
    public void cancel(long id, MeetingSeriesDto.CancelForm form) {
        SysUser current = guard.currentUser();
        MeetingSeries series = seriesMapper.selectForUpdate(id);
        if (series == null) {
            throw new BusinessException("週期系列不存在或已刪除");
        }
        if (current.getId() == null || !(Objects.equals(series.getOrganizerId(), current.getId())
                || guard.canOperateRecords(current))) {
            throw new BusinessException("只有會議組織者或行政可以取消週期會議");
        }
        if (form.getVersion() == null) {
            throw new BusinessException("缺少版本號，請刷新後重試");
        }
        if (!form.getVersion().equals(series.getVersion())) {
            throw new BusinessException("該系列已被他人修改，請刷新後重試");
        }
        String scope = form.getScope().trim();
        if (!MeetingConstants.CANCEL_SCOPES.contains(scope)) {
            throw new BusinessException("不支持的取消範圍：" + scope);
        }
        String reason = form.getReason().trim();

        if (MeetingConstants.CANCEL_THIS.equals(scope)) {
            if (form.getBookingId() == null) {
                throw new BusinessException("請選擇要取消的場次");
            }
            MeetingBooking target = bookingMapper.selectById(form.getBookingId());
            if (target == null || !Objects.equals(target.getSeriesId(), id)) {
                throw new BusinessException("該場次不屬於此週期系列");
            }
            MeetingBookingDto.CancelForm cancel = new MeetingBookingDto.CancelForm();
            cancel.setReason("週期會議單場取消：" + reason);
            cancel.setVersion(target.getVersion());
            bookingService.cancel(target.getId(), cancel);
            auditRecorder.recordBooking(target.getId(), series.getRoomId(), series.getSeriesNo(),
                    MeetingConstants.EVENT_SERIES_CANCEL, reason, null,
                    Map.of("scope", scope, "bookingNo", Objects.toString(target.getBookingNo(), "")),
                    current, null);
            return;
        }

        List<MeetingBooking> targets = MeetingConstants.CANCEL_ALL.equals(scope)
                ? bookingMapper.findSeriesInstances(id).stream()
                        .filter(booking -> MeetingConstants.OCCUPYING_STATUSES.contains(booking.getStatus()))
                        .toList()
                : bookingMapper.findFutureInstances(id, LocalDateTime.now());
        int cancelled = 0;
        for (MeetingBooking booking : targets) {
            MeetingBookingDto.CancelForm cancel = new MeetingBookingDto.CancelForm();
            cancel.setReason(("週期會議全部取消：" + reason));
            cancel.setVersion(booking.getVersion());
            try {
                bookingService.cancel(booking.getId(), cancel);
                cancelled++;
            } catch (BusinessException e) {
                // 单场取消失败不阻断整档：那一场的窗口可能刚被签到或已被释放，
                // 让它保持原状并在审计里记录，比整批回滚留下"半取消"状态更可解释
                log.warn("週期會議單場取消跳過: bookingNo={}, reason={}", booking.getBookingNo(), e.getMessage());
            }
        }
        if (seriesMapper.update(null, new LambdaUpdateWrapper<MeetingSeries>()
                .eq(MeetingSeries::getId, id)
                .eq(MeetingSeries::getVersion, form.getVersion())
                .set(MeetingSeries::getStatus, MeetingConstants.SERIES_CANCELLED)
                .set(MeetingSeries::getCancelledScope, scope)
                .set(MeetingSeries::getCancelReason, reason)
                .set(MeetingSeries::getCancelledBy, current.getId())
                .set(MeetingSeries::getCancelledAt, LocalDateTime.now())
                .set(MeetingSeries::getUpdatedBy, current.getName())
                .setSql("version = version + 1")) == 0) {
            throw new BusinessException("該系列已被他人修改，請刷新後重試");
        }
        auditRecorder.recordBooking(null, series.getRoomId(), series.getSeriesNo(),
                MeetingConstants.EVENT_SERIES_CANCEL, reason,
                Map.of("status", series.getStatus()),
                Map.of("status", MeetingConstants.SERIES_CANCELLED, "scope", scope, "cancelled", cancelled),
                current, null);
    }

    /* ==================== 修改模板（只影响未来实例） ==================== */

    /**
     * 修改系列模板。
     *
     * <p>做法是"取消全部未来实例 + 按新模板重新物化"，而不是逐场 diff 更新：
     * diff 更新要同时处理改时间、改房间、改名单、新增场次、删除场次五种组合，
     * 而重建路径复用了创建时的全部校验与冲突判定，代价只是未来实例的 {@code series_seq} 重新编号。
     * 历史实例（已签到/已结束/已取消）完全不碰。
     */
    @Transactional(rollbackFor = Exception.class)
    public MeetingSeriesDto.VO update(long id, MeetingSeriesDto.UpdateForm form) {
        SysUser current = guard.currentUser();
        // 变更会重建全部未来实例，等价于重新占用一批窗口，因此必须与创建一样先过黑名单：
        // 少这一道，被限制的人只要把已有系列改个时间就能继续预约，黑名单等于只对新建生效
        blacklistService.assertNotBlacklisted(current);
        SysUser delegate = guard.resolveDelegateFor(form.getDelegateForId(), current);
        if (delegate != null) {
            blacklistService.assertNotBlacklisted(delegate.getId(), "實際使用人");
            form.setAttendeeUserIds(
                    MeetingBookingServiceImpl.withDelegate(form.getAttendeeUserIds(), delegate.getId()));
        }
        MeetingSeries before = seriesMapper.selectForUpdate(id);
        if (before == null) {
            throw new BusinessException("週期系列不存在或已刪除");
        }
        if (!Objects.equals(before.getOrganizerId(), current.getId()) && !guard.canOperateRecords(current)) {
            throw new BusinessException("只有會議組織者或行政可以變更週期會議");
        }
        if (form.getVersion() == null || !form.getVersion().equals(before.getVersion())) {
            throw new BusinessException("該系列已被他人修改，請刷新後重試");
        }
        if (!MeetingConstants.SERIES_ACTIVE.equals(before.getStatus())) {
            throw new BusinessException("已取消的週期系列不可再變更");
        }
        MeetingRoom room = roomMapper.selectForUpdate(form.getRoomId());
        if (room == null) {
            throw new BusinessException("會議室不存在或已刪除");
        }
        validateShape(form);
        LocalDateTime[] first = windowOf(form, form.getStartDate());
        MeetingBookingDto.CreateForm template = toInstanceForm(form, first[0], first[1]);
        ruleValidate(room, template, attendeeCount(form));

        int dropped = 0;
        for (MeetingBooking booking : bookingMapper.findFutureInstances(id, LocalDateTime.now())) {
            MeetingBookingDto.CancelForm cancel = new MeetingBookingDto.CancelForm();
            cancel.setReason("週期會議變更：" + (StringUtils.hasText(form.getChangeNote())
                    ? form.getChangeNote().trim() : "調整時段或參會人"));
            cancel.setVersion(booking.getVersion());
            try {
                bookingService.cancel(booking.getId(), cancel);
                dropped++;
            } catch (BusinessException e) {
                log.warn("系列變更時單場釋放跳過: bookingNo={}, reason={}",
                        booking.getBookingNo(), e.getMessage());
            }
        }

        int seq = bookingMapper.maxSeriesSeq(id);
        int generated = 0;
        int skipped = 0;
        for (LocalDate day : occurrences(form)) {
            seq++;
            LocalDateTime[] window = windowOf(form, day);
            MeetingBooking booking = bookingService.materializeInstance(
                    toInstanceForm(form, window[0], window[1]), current, delegate, id, seq);
            if (booking == null) {
                skipped++;
            } else {
                generated++;
            }
        }

        MeetingSeries after = new MeetingSeries();
        applyTemplate(after, form, room, current, null, null, attendeeCount(form));
        if (seriesMapper.update(null, new LambdaUpdateWrapper<MeetingSeries>()
                .eq(MeetingSeries::getId, id)
                .eq(MeetingSeries::getVersion, form.getVersion())
                .set(MeetingSeries::getFreq, after.getFreq())
                .set(MeetingSeries::getIntervalN, after.getIntervalN())
                .set(MeetingSeries::getByWeekday, after.getByWeekday())
                .set(MeetingSeries::getTimeStart, after.getTimeStart())
                .set(MeetingSeries::getTimeEnd, after.getTimeEnd())
                .set(MeetingSeries::getStartDate, after.getStartDate())
                .set(MeetingSeries::getEndDate, after.getEndDate())
                .set(MeetingSeries::getOccurrenceLimit, after.getOccurrenceLimit())
                .set(MeetingSeries::getRoomId, after.getRoomId())
                .set(MeetingSeries::getRoomNo, after.getRoomNo())
                .set(MeetingSeries::getRoomName, after.getRoomName())
                .set(MeetingSeries::getRoomLocation, after.getRoomLocation())
                .set(MeetingSeries::getTitle, after.getTitle())
                .set(MeetingSeries::getDescription, after.getDescription())
                .set(MeetingSeries::getOnlineMeetingUrl, after.getOnlineMeetingUrl())
                .set(MeetingSeries::getBizType, after.getBizType())
                .set(MeetingSeries::getBizId, after.getBizId())
                .set(MeetingSeries::getBizNo, after.getBizNo())
                .set(MeetingSeries::getBizUrl, after.getBizUrl())
                .set(MeetingSeries::getAttendeeJson, after.getAttendeeJson())
                .set(MeetingSeries::getGeneratedCount, (before.getGeneratedCount() - dropped) + generated)
                .set(MeetingSeries::getSkippedCount, Objects.requireNonNullElse(before.getSkippedCount(), 0) + skipped)
                .set(MeetingSeries::getUpdatedBy, current.getName())
                .setSql("version = version + 1")) == 0) {
            throw new BusinessException("該系列已被他人修改，請刷新後重試");
        }
        auditRecorder.recordBooking(null, room.getId(), before.getSeriesNo(),
                MeetingConstants.EVENT_SERIES_UPDATE, trimToNull(form.getChangeNote()),
                snapshot(before), snapshot(after), current, null);
        return toVO(requireSeries(id));
    }

    /* ==================== 日期递推（创建/预览/更新共用） ==================== */

    /**
     * 按模板算出全部实例日期。
     *
     * <p>三重收口，缺一不可：{@code occurrenceLimit}（用户意图）、{@code endDate}（用户意图）、
     * {@code SERIES_MAX_SPAN_DAYS}（系统兜底）。只靠前两条，一次"每 1 天直到 2100 年"的输入
     * 就能把预约表埋掉；只靠后一条，用户明确写的 100 次上限又会被悄悄改写。
     */
    static List<LocalDate> occurrences(MeetingSeriesDto.CreateForm form) {
        boolean weekly = MeetingConstants.FREQ_WEEKLY.equals(form.getFreq());
        Set<Integer> weekdays = normalizeWeekday(form.getByWeekday());
        int limit = form.getOccurrenceLimit() == null ? 20 : Math.min(
                MeetingConstants.SERIES_MAX_OCCURRENCES, Math.max(1, form.getOccurrenceLimit()));
        int interval = form.getIntervalN() == null || form.getIntervalN() < 1 ? 1 : form.getIntervalN();
        LocalDate start = form.getStartDate();
        LocalDate hardEnd = start.plusDays(MeetingConstants.SERIES_MAX_SPAN_DAYS);
        LocalDate end = form.getEndDate() == null || form.getEndDate().isAfter(hardEnd) ? hardEnd : form.getEndDate();

        List<LocalDate> days = new ArrayList<>();
        if (!weekly) {
            // daily：每 N 天一场，步进就是间隔本身，不需要逐日判定
            for (LocalDate cursor = start; !cursor.isAfter(end) && days.size() < limit; cursor = cursor.plusDays(interval)) {
                days.add(cursor);
            }
            return days;
        }
        // weekly：以"所在周的周一序号"取模来落实「每 N 周」。
        // 直接 cursor.plusWeeks(N) 会漏掉 byWeekday 里的其它天（周三和周五的例会不是同一个偏移量）。
        Set<Integer> wanted = weekdays.isEmpty() ? Set.of(start.getDayOfWeek().getValue()) : weekdays;
        LocalDate startMonday = start.minusDays(start.getDayOfWeek().getValue() - 1L);
        for (LocalDate cursor = start; !cursor.isAfter(end) && days.size() < limit; cursor = cursor.plusDays(1)) {
            long weekIndex = java.time.temporal.ChronoUnit.WEEKS.between(
                    startMonday, cursor.minusDays(cursor.getDayOfWeek().getValue() - 1L));
            if (weekIndex % interval != 0 || !wanted.contains(cursor.getDayOfWeek().getValue())) {
                continue;
            }
            days.add(cursor);
        }
        return days;
    }

    private static Set<Integer> normalizeWeekday(List<Integer> input) {
        if (input == null || input.isEmpty()) {
            return Set.of();
        }
        Set<Integer> out = new LinkedHashSet<>();
        for (Integer value : input) {
            if (value != null && value >= DayOfWeek.MONDAY.getValue() && value <= DayOfWeek.SUNDAY.getValue()) {
                out.add(value);
            }
        }
        return out;
    }

    /* ==================== 内部 ==================== */

    private void ruleValidate(MeetingRoom room, MeetingBookingDto.CreateForm instance, int attendeeCount) {
        bookingService.validateTemplate(room, instance.getStartTime(), instance.getEndTime(), attendeeCount);
    }

    private static LocalDateTime[] windowOf(MeetingSeriesDto.CreateForm form, LocalDate day) {
        LocalTime start = parseTime(form.getTimeStart(), "開始時間");
        LocalTime end = parseTime(form.getTimeEnd(), "結束時間");
        if (!end.isAfter(start)) {
            throw new BusinessException("結束時間必須晚於開始時間");
        }
        return new LocalDateTime[]{day.atTime(start), day.atTime(end)};
    }

    private static MeetingBookingDto.CreateForm toInstanceForm(MeetingSeriesDto.CreateForm form,
                                                              LocalDateTime start, LocalDateTime end) {
        MeetingBookingDto.CreateForm instance = new MeetingBookingDto.CreateForm();
        instance.setTitle(form.getTitle().trim());
        instance.setRoomId(form.getRoomId());
        instance.setStartTime(start);
        instance.setEndTime(end);
        instance.setAttendeeUserIds(form.getAttendeeUserIds());
        instance.setOptionalUserIds(form.getOptionalUserIds());
        instance.setExternalAttendees(form.getExternalAttendees());
        instance.setDescription(form.getDescription());
        instance.setOnlineMeetingUrl(form.getOnlineMeetingUrl());
        instance.setBizType(form.getBizType());
        instance.setBizId(form.getBizId());
        instance.setBizNo(form.getBizNo());
        instance.setBizUrl(form.getBizUrl());
        // 代订的使用人由实例自己承载：台账要能回答"这间房是给谁用的"，
        // 只挂在系列上会让单场实例查不到使用人，签到与日程归属也无处对照
        instance.setDelegateForId(form.getDelegateForId());
        return instance;
    }

    private static int attendeeCount(MeetingSeriesDto.CreateForm form) {
        Set<Long> required = new LinkedHashSet<>(form.getAttendeeUserIds() == null ? List.of() : form.getAttendeeUserIds());
        Set<Long> optional = new LinkedHashSet<>(form.getOptionalUserIds() == null ? List.of() : form.getOptionalUserIds());
        required.remove(null);
        optional.remove(null);
        optional.removeAll(required);
        long external = form.getExternalAttendees() == null ? 0
                : form.getExternalAttendees().stream().filter(StringUtils::hasText).map(String::trim).distinct().count();
        // 组织者本人占一个位置：与后端容量校验同口径，否则 8 人房实际坐 9 个人
        return 1 + required.size() + optional.size() + (int) external;
    }

    private void validateShape(MeetingSeriesDto.CreateForm form) {
        if (form.getStartDate() == null) {
            throw new BusinessException("請選擇首次日期");
        }
        if (!MeetingConstants.SERIES_FREQS.contains(form.getFreq() == null ? "" : form.getFreq().trim())) {
            throw new BusinessException("不支持的重複頻率：" + form.getFreq());
        }
        if (MeetingConstants.FREQ_WEEKLY.equals(form.getFreq().trim())
                && (form.getByWeekday() == null || form.getByWeekday().isEmpty())) {
            throw new BusinessException("每週重複請至少選擇一個星期");
        }
        if (form.getEndDate() != null && form.getEndDate().isBefore(form.getStartDate())) {
            throw new BusinessException("結束日期不得早於開始日期");
        }
        if (form.getIntervalN() != null && (form.getIntervalN() < 1 || form.getIntervalN() > 30)) {
            throw new BusinessException("間隔數需在 1~30 之間");
        }
        windowOf(form, form.getStartDate());
    }

    private void applyTemplate(MeetingSeries series, MeetingSeriesDto.CreateForm form, MeetingRoom room,
                               SysUser current, String requestKey, String requestHash, int attendeeCount) {
        validateShape(form);
        series.setFreq(form.getFreq().trim());
        series.setIntervalN(form.getIntervalN() == null || form.getIntervalN() < 1 ? 1 : form.getIntervalN());
        series.setByWeekday(form.getByWeekday() == null || form.getByWeekday().isEmpty()
                ? "" : "," + form.getByWeekday().stream().filter(Objects::nonNull).distinct()
                        .map(String::valueOf).collect(Collectors.joining(",")) + ",");
        LocalDateTime[] window = windowOf(form, form.getStartDate());
        series.setTimeStart(window[0].toLocalTime());
        series.setTimeEnd(window[1].toLocalTime());
        series.setStartDate(form.getStartDate());
        series.setEndDate(form.getEndDate());
        series.setOccurrenceLimit(form.getOccurrenceLimit() == null ? 20
                : Math.min(MeetingConstants.SERIES_MAX_OCCURRENCES, Math.max(1, form.getOccurrenceLimit())));
        series.setRoomId(room.getId());
        series.setRoomNo(room.getRoomNo());
        series.setRoomName(room.getRoomName());
        series.setRoomLocation(roomLocation(room));
        series.setTitle(form.getTitle().trim());
        series.setDescription(trimToNull(form.getDescription()));
        series.setOnlineMeetingUrl(trimToNull(form.getOnlineMeetingUrl()));
        series.setBizType(StringUtils.hasText(form.getBizType()) ? form.getBizType().trim() : MeetingConstants.BIZ_GENERAL);
        series.setBizId(form.getBizId());
        series.setBizNo(Objects.toString(form.getBizNo(), ""));
        series.setBizUrl(trimToNull(form.getBizUrl()));
        series.setAttendeeJson(JsonUtils.toJson(new AttendeeSnapshot(
                form.getAttendeeUserIds(), form.getOptionalUserIds(), form.getExternalAttendees(), attendeeCount)));
        series.setOrganizerId(current.getId());
        series.setOrganizerEmpNo(Objects.toString(current.getEmpId(), ""));
        series.setOrganizerName(StringUtils.hasText(current.getName()) ? current.getName() : current.getUsername());
        series.setDepartmentId(current.getDepartmentId());
        series.setDepartmentName(Objects.toString(current.getDepartment(), ""));
        series.setRequestKey(requestKey);
        series.setRequestHash(requestHash);
        series.setCreatedBy(current.getName());
        series.setUpdatedBy(current.getName());
    }

    /** 参会人名单快照：实例重建时沿用当时选的人，而不是回查 HR——人已离职时新实例名单会莫名缩短 */
    private record AttendeeSnapshot(List<Long> required, List<Long> optional,
                                    List<String> external, int headcount) {
    }

    private void requireReadable(MeetingSeries series, SysUser current) {
        if (Objects.equals(series.getOrganizerId(), current.getId()) || guard.canSeeAll(current)) {
            return;
        }
        throw new BusinessException("無權查看該週期會議");
    }

    private MeetingSeries requireSeries(long id) {
        MeetingSeries series = seriesMapper.selectById(id);
        if (series == null) {
            throw new BusinessException("週期系列不存在或已刪除");
        }
        return series;
    }

    private MeetingSeriesDto.VO toVO(MeetingSeries series) {
        MeetingSeriesDto.VO vo = new MeetingSeriesDto.VO();
        vo.setId(series.getId());
        vo.setSeriesNo(series.getSeriesNo());
        vo.setFreq(series.getFreq());
        vo.setIntervalN(series.getIntervalN());
        vo.setByWeekday(parseWeekday(series.getByWeekday()));
        vo.setFreqText(freqText(series));
        vo.setTimeStart(series.getTimeStart() == null ? null : series.getTimeStart().toString());
        vo.setTimeEnd(series.getTimeEnd() == null ? null : series.getTimeEnd().toString());
        vo.setStartDate(DateTimeUtils.format(series.getStartDate()));
        vo.setEndDate(DateTimeUtils.format(series.getEndDate()));
        vo.setOccurrenceLimit(series.getOccurrenceLimit());
        vo.setGeneratedCount(series.getGeneratedCount());
        vo.setSkippedCount(series.getSkippedCount());
        vo.setRoomId(series.getRoomId());
        vo.setRoomNo(series.getRoomNo());
        vo.setRoomName(series.getRoomName());
        vo.setRoomLocation(series.getRoomLocation());
        vo.setTitle(series.getTitle());
        vo.setDescription(series.getDescription());
        vo.setOnlineMeetingUrl(series.getOnlineMeetingUrl());
        vo.setBizType(series.getBizType());
        vo.setBizId(series.getBizId());
        vo.setBizNo(series.getBizNo());
        vo.setBizUrl(series.getBizUrl());
        vo.setOrganizerId(series.getOrganizerId());
        vo.setOrganizerName(series.getOrganizerName());
        vo.setOrganizerEmpNo(series.getOrganizerEmpNo());
        vo.setDepartmentName(series.getDepartmentName());
        vo.setStatus(series.getStatus());
        vo.setCancelledScope(series.getCancelledScope());
        vo.setCancelReason(series.getCancelReason());
        vo.setVersion(series.getVersion());
        vo.setCreatedBy(series.getCreatedBy());
        vo.setCreatedAt(DateTimeUtils.format(series.getCreatedAt()));
        vo.setUpdatedBy(series.getUpdatedBy());
        vo.setUpdatedAt(DateTimeUtils.format(series.getUpdatedAt()));
        return vo;
    }

    private static String freqText(MeetingSeries series) {
        String base = MeetingConstants.FREQ_DAILY.equals(series.getFreq())
                ? (Objects.requireNonNullElse(series.getIntervalN(), 1) > 1
                        ? "每 " + series.getIntervalN() + " 天" : "每天")
                : (Objects.requireNonNullElse(series.getIntervalN(), 1) > 1
                        ? "每 " + series.getIntervalN() + " 週" : "每週");
        List<Integer> days = parseWeekday(series.getByWeekday());
        if (days.isEmpty()) {
            return base;
        }
        return base + " " + days.stream().map(d -> "週" + WEEKDAY_TEXT.charAt(d - 1))
                .collect(Collectors.joining("、"));
    }

    private static List<Integer> parseWeekday(String column) {
        if (!StringUtils.hasText(column)) {
            return List.of();
        }
        return java.util.Arrays.stream(column.split(",")).map(String::trim).filter(StringUtils::hasText)
                .map(value -> {
                    try {
                        return Integer.valueOf(value);
                    } catch (NumberFormatException e) {
                        return null;
                    }
                })
                .filter(Objects::nonNull).distinct().sorted().toList();
    }

    private static String roomLocation(MeetingRoom room) {
        return java.util.stream.Stream.of(room.getCampus(), room.getBuilding(), room.getFloorCode(),
                        room.getLocationDesc())
                .filter(StringUtils::hasText).map(String::trim).collect(Collectors.joining(" · "));
    }

    private static MeetingSeriesDto.CreateResult resultOf(MeetingSeries series, boolean fresh, int skippedCount) {
        MeetingSeriesDto.CreateResult result = new MeetingSeriesDto.CreateResult();
        result.setSeriesId(series.getId());
        result.setSeriesNo(series.getSeriesNo());
        result.setGeneratedCount(Objects.requireNonNullElse(series.getGeneratedCount(), 0));
        result.setSkippedCount(fresh ? skippedCount : Objects.requireNonNullElse(series.getSkippedCount(), 0));
        return result;
    }

    private static Map<String, Object> snapshot(MeetingSeries series) {
        Map<String, Object> map = new java.util.LinkedHashMap<>();
        map.put("seriesNo", series.getSeriesNo());
        map.put("title", series.getTitle());
        map.put("freq", series.getFreq());
        map.put("intervalN", series.getIntervalN());
        map.put("byWeekday", series.getByWeekday());
        map.put("timeStart", Objects.toString(series.getTimeStart(), ""));
        map.put("timeEnd", Objects.toString(series.getTimeEnd(), ""));
        map.put("startDate", Objects.toString(series.getStartDate(), ""));
        map.put("endDate", Objects.toString(series.getEndDate(), ""));
        map.put("roomId", series.getRoomId());
        map.put("roomName", series.getRoomName());
        map.put("status", series.getStatus());
        map.put("generatedCount", series.getGeneratedCount());
        map.put("skippedCount", series.getSkippedCount());
        return map;
    }

    private static LocalTime parseTime(String value, String label) {
        if (!StringUtils.hasText(value)) {
            throw new BusinessException("請選擇" + label);
        }
        try {
            return LocalTime.parse(value.trim());
        } catch (DateTimeParseException e) {
            throw new BusinessException(label + "格式不正確，應為 HH:mm");
        }
    }

    private static String trimToNull(String value) {
        return StringUtils.hasText(value) ? value.trim() : null;
    }

    /** 与预约域同一套摘要算法：同键不同内容必须被拒绝，否则改动静默丢失 */
    private static String hash(MeetingSeriesDto.CreateForm form) {
        String canonical = String.join("|",
                Objects.toString(trimToNull(form.getTitle()), ""),
                String.valueOf(form.getRoomId()),
                Objects.toString(form.getStartDate(), ""),
                Objects.toString(form.getEndDate(), ""),
                Objects.toString(trimToNull(form.getFreq()), ""),
                String.valueOf(form.getIntervalN()),
                Objects.toString(form.getByWeekday(), ""),
                Objects.toString(trimToNull(form.getTimeStart()), ""),
                Objects.toString(trimToNull(form.getTimeEnd()), ""),
                String.valueOf(form.getOccurrenceLimit()),
                String.valueOf(form.getAttendeeUserIds()), String.valueOf(form.getOptionalUserIds()),
                // 使用人参与哈希：同一幂等键换挂名对象必须是不同请求
                String.valueOf(form.getDelegateForId()));
        return RequestHashUtil.sha256Hex(canonical);
    }
}
