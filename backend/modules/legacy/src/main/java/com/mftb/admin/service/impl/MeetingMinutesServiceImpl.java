package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.MeetingConstants;
import com.mftb.admin.dto.MeetingMinutesContent;
import com.mftb.admin.dto.MeetingMinutesDto;
import com.mftb.admin.entity.MeetingAttendee;
import com.mftb.admin.entity.MeetingBooking;
import com.mftb.admin.entity.MeetingMinutes;
import com.mftb.admin.entity.MeetingMinutesDelivery;
import com.mftb.admin.entity.MeetingMinutesItem;
import com.mftb.admin.entity.MeetingMinutesLink;
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
import com.mftb.admin.service.MeetingMinutesDispatcher;
import com.mftb.admin.service.MeetingMinutesRenderer;
import com.mftb.admin.service.MeetingMinutesService;
import com.mftb.admin.service.MeetingNotifyTemplateService;
import com.mftb.admin.service.NotificationAppService;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.DateTimeUtils;
import com.mftb.admin.util.JsonUtils;
import com.mftb.admin.util.MinutesViewTokenUtil;
import com.mftb.admin.util.PublicLinkGuard;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 会议纪要服务实现。
 *
 * <p><b>权限矩阵（与前端 deriveCanRecordMinutes 逐字同口径，只收窄不放宽）</b>：
 * <ul>
 *   <li>读：组织者 / 参会人 / 行政视野 / <b>被发送过这份纪要的人</b>。最后一条是需求
 *       "发给没参会的人"的直接后果——若沿用会议详情的三重判定，被单独发送的收件人点开链接必然 403；</li>
 *   <li>写（录入/编辑/发送/作废链接）：组织者、持有 {@code meeting-my:edit} 的参会人、行政（代录）。
 *       纪要一旦发出，正文只能改后重发，不做物理删除（删除会让已发出的批次悬空）。</li>
 * </ul>
 *
 * <p><b>发送为什么分三步而不是一个大事务</b>：批次行与明细行必须在同一事务里落库（否则出现"有批次没明细"），
 * 但真实投递在 {@code afterCommit} 之后（回滚的事务不该把纪要发出去）；卡片正文里带的免登链接
 * 需要批次 id 才能签发，所以顺序是 插批次 → 领 id → 签令牌 → 渲染正文 → 回写正文快照。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class MeetingMinutesServiceImpl implements MeetingMinutesService {

    /**
     * 纪要可录入的会议阶段：会议一到开始时间（ongoing）就能记，不必等散会。
     * <p>开会过程中就要边讲边记才符合实际场景；未开始的会没有结论可记，
     * 因此 pending 不在这里，与会议列表给不给入口（{@code MeetingBookingServiceImpl.RECORDABLE_PHASES}）同口径。
     */
    private static final List<String> RECORDABLE_PHASES = List.of("ongoing", "ended", "finished");
    /** 已取消/已释放的会不产生纪要：没开成的会没有"结论"可记 */
    private static final List<String> NON_RECORDABLE_STATUSES = List.of(
            MeetingConstants.STATUS_CANCELLED, MeetingConstants.STATUS_RELEASED);
    private static final String NOT_ENABLED = "會議紀要功能尚未啟用，請聯繫管理員開啟";
    private static final String CONFLICT = "紀要已被他人修改，請刷新後重試";
    private static final String LOCK_REASON_PERMISSION = "PERMISSION";
    private static final String LOCK_REASON_TIMING = "MEETING_NOT_RECORDED";
    private static final String TOKEN_INVALID = "連結無效或已失效，請向發送你紀要的人重新索取";
    /**
     * 不存在与无权限统一用这一句：minutesId 是自增的，两种错误给不同文案等于提供
     * “这个 id 存在但你没权限”的枚举口子。方案的安全校验点明确要求同一结论。
     */
    private static final String NOT_FOUND = "紀要不存在或已刪除";

    private final MeetingMinutesMapper minutesMapper;
    private final MeetingMinutesSendMapper sendMapper;
    private final MeetingMinutesDeliveryMapper deliveryMapper;
    private final MeetingMinutesItemMapper itemMapper;
    private final MeetingMinutesLinkMapper linkMapper;
    private final MeetingBookingMapper bookingMapper;
    private final MeetingAttendeeMapper attendeeMapper;
    private final SysUserMapper userMapper;
    private final JdbcTemplate jdbc;
    private final MeetingAccessGuard guard;
    private final MeetingAuditRecorder audit;
    private final MeetingMinutesDispatcher dispatcher;
    private final MeetingNotifyTemplateService templateService;
    private final com.mftb.admin.service.DingTalkService dingTalkService;
    private final NotificationAppService appService;
    private final BizSeqService bizSeqService;

    /**
     * 纪要能力开关：默认开，生产可用 {@code MEETING_MINUTES_ENABLED=false} 灰度关闭。
     * <p>关在接口而不是只藏按钮：入口按钮能被旧页面绕过，接口不判就等于没关。
     */
    @Value("${meeting.minutes.enabled:true}")
    private boolean minutesEnabled;

    /**
     * 免登签名密钥：优先应开变量注入；没配时惰性生成一把并落到 sys_config（与签到令牌同一做法）。
     * <p>不拿 JWT_SECRET 兜底：纪要链接的签名密钥与登录令牌分开，换登录密钥不该让已发出的链接全失效。
     */
    @Value("${meeting.minutes.token-secret:}")
    private String tokenSecretConfig;

    /* ==================== 读 ==================== */

    @Override
    public MeetingMinutesDto.VO viewByBooking(long bookingId) {
        requireEnabled();
        SysUser current = guard.currentUser();
        MeetingBooking booking = requireBooking(bookingId);
        guard.requireBookingReadable(booking, current);
        MeetingMinutes minutes = minutesMapper.findByBooking(bookingId);
        return toVO(minutes, booking, current);
    }

    @Override
    public MeetingMinutesDto.VO view(long minutesId) {
        requireEnabled();
        SysUser current = guard.currentUser();
        MeetingMinutes minutes = requireMinutes(minutesId);
        MeetingBooking booking = requireBooking(minutes.getBookingId());
        // 行政视野/组织者/参会人之外，被发送过这份纪要的人也算可读
        if (!isReadable(minutes, booking, current)) {
            throw new BusinessException(NOT_FOUND);
        }
        return toVO(minutes, booking, current);
    }

    @Override
    public List<MeetingMinutesDto.SendVO> sends(long minutesId) {
        requireEnabled();
        SysUser current = guard.currentUser();
        MeetingMinutes minutes = requireMinutes(minutesId);
        MeetingBooking booking = requireBooking(minutes.getBookingId());
        if (!isReadable(minutes, booking, current)) {
            throw new BusinessException(NOT_FOUND);
        }
        List<MeetingMinutesSend> batches = sendMapper.findByMinutes(minutesId);
        if (batches.isEmpty()) {
            return List.of();
        }
        List<Long> batchIds = batches.stream().map(MeetingMinutesSend::getId).filter(Objects::nonNull).toList();
        Map<Long, List<MeetingMinutesDelivery>> deliveriesByBatch = deliveryMapper.findBySends(batchIds).stream()
                .collect(Collectors.groupingBy(MeetingMinutesDelivery::getSendId));
        List<MeetingMinutesDto.SendVO> rows = new ArrayList<>();
        for (MeetingMinutesSend batch : batches) {
            rows.add(toSendVO(batch, minutes, deliveriesByBatch.getOrDefault(batch.getId(), List.of())));
        }
        return rows;
    }

    @Override
    public List<MeetingMinutesDto.GroupOptionVO> groupOptions() {
        requireEnabled();
        // 只校验登录态与菜单入口（控制器注解已挡）：群名称不是凭据，但 webhook/secret 一个都不回
        guard.currentUser();
        return dispatcher.usableChannels().stream().map(this::toGroupOption).toList();
    }

    /* ==================== 写 ==================== */

    @Override
    @Transactional(rollbackFor = Exception.class)
    public MeetingMinutesDto.VO create(MeetingMinutesDto.Form form) {
        requireEnabled();
        SysUser current = guard.currentUser();
        if (form.getBookingId() == null) {
            throw new BusinessException("缺少會議編號");
        }
        MeetingBooking booking = requireBooking(form.getBookingId());
        requireRecordable(booking, current);
        MeetingMinutesContent content = requireContent(form);
        if (minutesMapper.findByBooking(booking.getId()) != null) {
            // 两个人同时打开录入页时，后提交者必须看见"已存在"而不是长出第二条纪要
            throw new BusinessException("這場會議已有紀要，請重新打開後再編輯");
        }

        MeetingMinutes minutes = new MeetingMinutes();
        minutes.setMinutesNo(bizSeqService.next(MeetingConstants.SEQ_MINUTES));
        minutes.setBookingId(booking.getId());
        minutes.setBookingNo(booking.getBookingNo());
        minutes.setMeetingTitle(booking.getTitle());
        minutes.setMeetingTimeText(timeText(booking.getStartTime(), booking.getEndTime()));
        minutes.setRoomText(roomText(booking));
        minutes.setOrganizerName(booking.getOrganizerName());
        minutes.setSeriesId(booking.getSeriesId());
        minutes.setSeriesSeq(booking.getSeriesSeq());
        minutes.setRecorderUserId(current.getId());
        minutes.setRecorderEmpNo(Objects.toString(current.getEmpId(), ""));
        minutes.setRecorderName(displayName(current));
        minutes.setContentJson(JsonUtils.toJson(content));
        minutes.setDigest(content.digest());
        minutes.setStatus(MeetingConstants.MINUTES_DRAFT);
        minutes.setSendCount(0);
        minutes.setTokenVersion(0);
        minutes.setRequestKey(trimToNull(form.getRequestKey()));
        minutes.setRequestHash(hashOf(content));
        minutes.setCreatedBy(current.getName());
        minutes.setUpdatedBy(current.getName());
        minutes.setVersion(0);
        try {
            minutesMapper.insert(minutes);
        } catch (DuplicateKeyException e) {
            // 撞 uk_meeting_minutes_request 是幂等重放：回读已存在的那条，不报"系统异常"
            MeetingMinutes existing = minutesMapper.findByBooking(booking.getId());
            if (existing == null) {
                throw new BusinessException("紀要保存失敗，請重試");
            }
            log.info("紀要新建幂等重放: bookingId={}, minutesNo={}", booking.getId(), existing.getMinutesNo());
            return toVO(existing, booking, current);
        }
        audit.recordBooking(booking.getId(), booking.getRoomId(), booking.getBookingNo(),
                MeetingConstants.EVENT_MINUTES_CREATE, "錄入會議紀要 " + minutes.getMinutesNo(),
                null, Map.of("minutesNo", minutes.getMinutesNo(), "digest", minutes.getDigest()),
                current, trimToNull(form.getRequestKey()));
        // 事项/关联/参会补录跟正文同事务：纪要保存成功但待办没落库，等于发出去一张没人负责的空单
        saveItems(minutes, form);
        saveLinks(minutes, form);
        applyAttendance(booking, form, current);
        return toVO(minutes, booking, current);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public MeetingMinutesDto.VO update(long minutesId, MeetingMinutesDto.Form form) {
        requireEnabled();
        SysUser current = guard.currentUser();
        MeetingMinutes minutes = requireMinutes(minutesId);
        MeetingBooking booking = requireBooking(minutes.getBookingId());
        requireWritable(minutes, current);
        MeetingMinutesContent content = requireContent(form);
        int expectVersion = requireVersion(versionOf(form.getVersion(), form.getExpectVersion()));
        if (!Objects.equals(minutes.getVersion(), expectVersion)) {
            throw new BusinessException(CONFLICT);
        }
        MeetingMinutes before = snapshot(minutes);
        // 正文与摘要一起改：摘要是列表与卡片的第一眼内容，只改正文会让两处读到不同的结论
        int changed = minutesMapper.update(null, new LambdaUpdateWrapper<MeetingMinutes>()
                .eq(MeetingMinutes::getId, minutesId)
                .eq(MeetingMinutes::getVersion, expectVersion)
                .set(MeetingMinutes::getContentJson, JsonUtils.toJson(content))
                .set(MeetingMinutes::getDigest, content.digest())
                .set(MeetingMinutes::getUpdatedBy, current.getName())
                .set(MeetingMinutes::getVersion, expectVersion + 1)
                .set(MeetingMinutes::getUpdatedAt, LocalDateTime.now()));
        if (changed == 0) {
            throw new BusinessException(CONFLICT);
        }
        // 编辑正文不影响已有事项的状态：saveItems 按位置 upsert，只覆盖内容与负责人
        saveItems(requireMinutes(minutesId), form);
        saveLinks(requireMinutes(minutesId), form);
        applyAttendance(booking, form, current);
        audit.recordBooking(booking.getId(), booking.getRoomId(), booking.getBookingNo(),
                MeetingConstants.EVENT_MINUTES_UPDATE, "修改會議紀要 " + minutes.getMinutesNo(),
                Map.of("digest", nullToEmpty(before.getDigest())),
                Map.of("digest", content.digest()), current, null);
        return view(minutesId);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public MeetingMinutesDto.SendResult send(long minutesId, MeetingMinutesDto.SendForm form) {
        requireEnabled();
        SysUser current = guard.currentUser();
        MeetingMinutes minutes = requireMinutes(minutesId);
        MeetingBooking booking = requireBooking(minutes.getBookingId());
        requireWritable(minutes, current);
        // 发送前先校版本：拿着一周前打开的页面点「發送」，发出去的其实是别人后来改过的正文，
        // 而用户在预览里看到的还是自己那份——版本不一致时拒绝，让他刷新后重看
        if (!Objects.equals(minutes.getVersion(),
                requireVersion(versionOf(form.getVersion(), form.getExpectVersion())))) {
            throw new BusinessException(CONFLICT);
        }
        MeetingMinutesContent content = decodeContent(minutes);
        content.validate();

        LinkedHashSet<Long> receivers = new LinkedHashSet<>();
        if (form.getReceiverUserIds() != null) {
            form.getReceiverUserIds().stream().filter(Objects::nonNull).filter(id -> id > 0).forEach(receivers::add);
        }
        SysNotificationChannel channel = dispatcher.usableChannel(form.getGroupChannelId());
        if (form.getGroupChannelId() != null && channel == null) {
            throw new BusinessException("釘釘群渠道不存在或已停用，請重新選擇");
        }
        // alsoNotifyAttendees：把本场参会人并入收件人（方案契约里的可选开关）。
        // 只并入有系统账号的参会人；外部参会人没有 sys_user，无法工作通知。
        if (Boolean.TRUE.equals(form.getAlsoNotifyAttendees())) {
            attendeeMapper.selectList(new LambdaQueryWrapper<MeetingAttendee>()
                            .eq(MeetingAttendee::getBookingId, booking.getId())).stream()
                    .map(MeetingAttendee::getUserId)
                    .filter(Objects::nonNull)
                    .forEach(receivers::add);
        }
        if (channel == null && receivers.isEmpty()) {
            throw new BusinessException("請選擇釘釘群或至少一位收件人");
        }
        // 群推送被静音时直接拦住：让用户在这里就知道"这批不会进群"，比发完在历史里看到 skipped 更早一步
        if (channel != null && !templateService.enabled(MeetingConstants.SCENARIO_MINUTES,
                com.mftb.admin.entity.SysNotificationSwitch.CHANNEL_GROUP)) {
            throw new BusinessException("「群推送」已靜音，請到推送開關開啟，或取消選擇群");
        }

        MeetingMinutesSend batch = new MeetingMinutesSend();
        batch.setMinutesId(minutes.getId());
        batch.setBookingId(booking.getId());
        batch.setBookingNo(booking.getBookingNo());
        batch.setMinutesNo(minutes.getMinutesNo());
        batch.setBatchSeq(nextBatchSeq(minutes.getId()));
        batch.setTitle(MeetingMinutesRenderer.title(minutes));
        batch.setContentSnapshot(minutes.getContentJson());
        batch.setScenario(MeetingConstants.SCENARIO_MINUTES);
        batch.setGroupChannelId(channel == null ? null : channel.getId());
        batch.setGroupChannelName(channel == null ? "" : Objects.toString(channel.getName(), ""));
        batch.setReceiverCount(receivers.size());
        batch.setTokenVersion(minutes.getTokenVersion() == null ? 0 : minutes.getTokenVersion());
        // 到期时间抹到整秒：它是令牌 payload 的一部分。存库的 DATETIME 会丢毫秒，
        // 不抹秒则“发送当下算的 token”与“发送历史里重算的 token”不相等，
        // 用户从钉钉卡片点开的链接与页面「複製鏈接」得到的就不是同一条。
        LocalDateTime expireAt = LocalDateTime.now().plusDays(MeetingConstants.MINUTES_LINK_TTL_DAYS).withNano(0);
        batch.setLinkExpireAt(expireAt);
        batch.setSendStatus(MeetingConstants.NOTIFY_PENDING);
        batch.setSuccessCount(0);
        batch.setFailedCount(0);
        batch.setSkippedCount(0);
        batch.setOperatorId(current.getId());
        batch.setOperatorEmpNo(Objects.toString(current.getEmpId(), ""));
        batch.setOperatorName(displayName(current));
        batch.setRequestKey(trimToNull(form.getRequestKey()));
        batch.setSentAt(LocalDateTime.now());
        try {
            sendMapper.insert(batch);
        } catch (DuplicateKeyException e) {
            // 撞批次号或幂等键都是"这一次已经提交过了"：回读当前批次号让调用方重试，而不是发第二批
            throw new BusinessException("本次發送已在處理中，請稍後在發送歷史查看結果");
        }

        // 令牌绑批次 id，因此必须插完才知道；正文要带链接，所以链接先于正文渲染
        String token = MinutesViewTokenUtil.generate(minutes.getId(), batch.getId(),
                batch.getTokenVersion(), expireAt, tokenSecret());
        // 站点地址只取一次：渲染、发送结论、审计三处必须是同一个值，避免“卡片里一个域名、提示里另一个”
        String linkBase = baseUrl();
        boolean linkPublic = PublicLinkGuard.isPubliclyReachable(linkBase);
        String absolute = linkBase == null ? null : linkBase + "/#/meeting-minutes-view?token=" + token;
        MeetingMinutesRenderer.Rendered rendered = MeetingMinutesRenderer.render(minutes,
                itemMapper.findByMinutes(minutes.getId()), linkMapper.findByMinutes(minutes.getId()),
                batch.getBatchSeq(), DateTimeUtils.format(batch.getSentAt()), displayName(current)
                        + (StringUtils.hasText(current.getEmpId()) ? "（" + current.getEmpId() + "）" : ""),
                absolute, templateService);
        sendMapper.update(null, new LambdaUpdateWrapper<MeetingMinutesSend>()
                .eq(MeetingMinutesSend::getId, batch.getId())
                .set(MeetingMinutesSend::getMarkdownSnapshot, rendered.markdown())
                .set(MeetingMinutesSend::getUpdatedAt, LocalDateTime.now()));
        batch.setMarkdownSnapshot(rendered.markdown());

        MeetingMinutesDispatcher.RegisterResult registered = dispatcher.register(minutes, batch, receivers);
        minutesMapper.markSent(minutes.getId(), batch.getSentAt());
        audit.recordBooking(booking.getId(), booking.getRoomId(), booking.getBookingNo(),
                MeetingConstants.EVENT_MINUTES_SEND,
                "發送紀要 " + minutes.getMinutesNo() + " 第 " + batch.getBatchSeq() + " 批："
                        + (channel == null ? "未發群" : "群「" + channel.getName() + "」")
                        + "，收件人 " + receivers.size() + " 人",
                null, Map.of("batchSeq", batch.getBatchSeq(), "queued", registered.getQueued(),
                        "skipped", registered.getSkipped(),
                        "linkBase", nullToEmpty(linkBase), "linkPublic", linkPublic),
                current, trimToNull(form.getRequestKey()));

        MeetingMinutesDto.SendResult result = new MeetingMinutesDto.SendResult();
        result.setSendId(batch.getId());
        result.setBatchSeq(batch.getBatchSeq());
        result.setQueued(registered.getQueued());
        result.setSkipped(registered.getSkipped());
        result.setScenarioActive(registered.isScenarioActive());
        result.setGroupQueued(registered.isGroupQueued());
        result.setGroupChannelName(batch.getGroupChannelName());
        result.setViewUrl(relativeViewUrl(token));
        result.setLinkBaseUrl(linkBase);
        result.setLinkBasePublic(linkPublic);
        result.setDeliveries(registered.getRows().stream().filter(Objects::nonNull).map(this::toDeliveryVO).toList());
        return result;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public MeetingMinutesDto.VO revokeLinks(long minutesId, MeetingMinutesDto.RevokeForm form) {
        requireEnabled();
        SysUser current = guard.currentUser();
        MeetingMinutes minutes = requireMinutes(minutesId);
        MeetingBooking booking = requireBooking(minutes.getBookingId());
        requireWritable(minutes, current);
        int expectVersion = requireVersion(form == null ? null
                : versionOf(form.getVersion(), form.getExpectVersion()));
        if (!Objects.equals(minutes.getVersion(), expectVersion)) {
            throw new BusinessException(CONFLICT);
        }
        int tokenVersion = minutes.getTokenVersion() == null ? 0 : minutes.getTokenVersion();
        // 带旧版本号更新：并发两个人同时点作废时，只有一个成功，另一个拿到冲突而不是"又加了一次"
        if (minutesMapper.bumpTokenVersion(minutesId, tokenVersion, current.getName()) == 0) {
            throw new BusinessException(CONFLICT);
        }
        audit.recordBooking(booking.getId(), booking.getRoomId(), booking.getBookingNo(),
                MeetingConstants.EVENT_MINUTES_REVOKE, "作廢紀要查看鏈接 " + minutes.getMinutesNo(),
                null, Map.of("tokenVersion", tokenVersion + 1), current, null);
        return view(minutesId);
    }

    /* ==================== 免登 ==================== */

    @Override
    public MeetingMinutesDto.PublicView publicView(String token) {
        MeetingMinutesDto.PublicView invalid = new MeetingMinutesDto.PublicView();
        invalid.setValid(false);
        invalid.setMessage(TOKEN_INVALID);
        if (!StringUtils.hasText(token)) {
            return invalid;
        }
        MinutesViewTokenUtil.Token parsed = MinutesViewTokenUtil.parse(token, tokenSecret());
        if (parsed == null) {
            return invalid;
        }
        MeetingMinutes minutes = minutesMapper.selectById(parsed.minutesId());
        MeetingMinutesSend batch = sendMapper.selectById(parsed.sendId());
        // 三个事实必须同时成立：令牌签发的批次存在、批次确实属于这份纪要、批次用的令牌版本仍是当前版本
        if (minutes == null || batch == null || !Objects.equals(batch.getMinutesId(), minutes.getId())
                || batch.getTokenVersion() == null || batch.getTokenVersion() != parsed.tokenVersion()
                || minutes.getTokenVersion() == null || minutes.getTokenVersion() != parsed.tokenVersion()) {
            return invalid;
        }
        MeetingMinutesDto.PublicView view = new MeetingMinutesDto.PublicView();
        view.setValid(true);
        view.setMinutesNo(minutes.getMinutesNo());
        view.setTitle(minutes.getMeetingTitle());
        view.setBookingNo(batch.getBookingNo());
        view.setMeetingTimeText(minutes.getMeetingTimeText());
        view.setRoomText(minutes.getRoomText());
        view.setOrganizerName(minutes.getOrganizerName());
        // 记录人姓名/工号来自纪要而不是批次：被转发出去时也要能认出是谁记的
        view.setRecorderName(minutes.getRecorderName());
        view.setRecorderEmpNo(minutes.getRecorderEmpNo());
        view.setBatchSeq(batch.getBatchSeq());
        view.setSentByName(batch.getOperatorName());
        view.setSentAt(DateTimeUtils.format(batch.getSentAt()));
        view.setExpireAt(DateTimeUtils.format(batch.getLinkExpireAt()));
        // 正文取批次快照，不取消极的当前版本：收件人点开必须还是"发给我的那一版"
        view.setContent(JsonUtils.parse(batch.getContentSnapshot(), MeetingMinutesContent.class));
        return view;
    }

    @Override
    public boolean enabled() {
        return minutesEnabled;
    }

    /** 与会议列表行同源的纪要查数：一次批量查而不是逐行查，一页 20 行逐行查就是 20 次往返 */
    public Map<Long, MeetingMinutes> briefByBookings(Collection<Long> bookingIds) {
        List<Long> ids = bookingIds == null ? List.of() : bookingIds.stream()
                .filter(Objects::nonNull).distinct().toList();
        if (ids.isEmpty()) {
            return Map.of();
        }
        return minutesMapper.findByBookings(ids).stream()
                .collect(Collectors.toMap(MeetingMinutes::getBookingId, Function.identity(), (a, b) -> a));
    }

    /* ==================== 判定 ==================== */

    private boolean isReadable(MeetingMinutes minutes, MeetingBooking booking, SysUser current) {
        try {
            guard.requireBookingReadable(booking, current);
            return true;
        } catch (BusinessException e) {
            // 非相关人只有一种情况能读：他在这份纪要的任一发送批次名单里（需求要求可发给非参会人）
            return deliveryMapper.countSentToUser(minutes.getId(), current.getId()) > 0;
        }
    }

    /** 录入与编辑的权限锚：由守卫统一给出（行政代录走 canOperateRecords） */
    private boolean canRecordPermission(SysUser current) {
        return guard.canRecordMinutes(current);
    }

    private void requireRecordable(MeetingBooking booking, SysUser current) {
        boolean admin = guard.canOperateRecords(current);
        if (!admin) {
            // 非行政必须是与这场会有关的人：凭一个 bookingId 就能替别人补纪要，等于把会议内容的写入权交给全公司
            if (!isRelated(booking, current) || !guard.canRecordMinutes(current)) {
                throw new BusinessException("只有會議相關人員或行政可以錄入紀要");
            }
        }
        if (!recordableByPhase(booking, LocalDateTime.now())) {
            throw new BusinessException("會議尚未開始或已取消/釋放，無需錄入紀要");
        }
    }

    /** 可编辑/可发送：记录人本人、组织者、行政 */
    private void requireWritable(MeetingMinutes minutes, SysUser current) {
        if (Objects.equals(minutes.getRecorderUserId(), current.getId())) {
            return;
        }
        MeetingBooking booking = requireBooking(minutes.getBookingId());
        if (guard.isOrganizer(booking, current) || guard.canOperateRecords(current)) {
            return;
        }
        // 与“不存在”同一句：否则可以拿自增 id 探测哪些纪要对别人存在
        throw new BusinessException(NOT_FOUND);
    }

    private boolean isRelated(MeetingBooking booking, SysUser current) {
        if (guard.isOrganizer(booking, current)) {
            return true;
        }
        return attendeeMapper.selectCount(new LambdaQueryWrapper<MeetingAttendee>()
                .eq(MeetingAttendee::getBookingId, booking.getId())
                .eq(MeetingAttendee::getUserId, current.getId())) > 0;
    }

    private void requireEnabled() {
        if (!minutesEnabled) {
            throw new BusinessException(NOT_ENABLED);
        }
    }

    /* ==================== 取数 ==================== */

    /* ==================== 事项 / 关联 / 签到补录 ==================== */

    private static final int MAX_ITEMS_PER_KIND = 50;
    private static final int MAX_LINKS = 10;
    private static final List<String> RESULTS = List.of(MeetingMinutesItem.RESULT_COMPLETED,
            MeetingMinutesItem.RESULT_PARTIAL, MeetingMinutesItem.RESULT_CANNOT);

    /**
     * 保存事项：按 (kind, seq) 位置 upsert，再删除超出条数的行。
     *
     * <p>刻意<b>不</b>先删后插：那样每次编辑都会换一批新 id，负责人页面上的“更新状态”按钮
     * 会在别人编辑一次后全部失效；也没法保留已填的处理结果——组织者改句措辞不该抹掉别人的进度。
     */
    private void saveItems(MeetingMinutes minutes, MeetingMinutesDto.Form form) {
        List<MeetingMinutesDto.ItemForm> items = form.getItems() == null ? List.of() : form.getItems();
        if (items.isEmpty()) {
            // 旧客户端（或只传 content 的调用方）没有 items：从正文里的 actions/openIssues 兜底，
            // 否则升级后第一次编辑会把旧行动项在事项表里全部删掉
            items = legacyItems(form.getContent());
        }
        List<MeetingMinutesDto.ItemForm> actions = items.stream()
                .filter(item -> item != null && !MeetingMinutesItem.KIND_FOLLOW.equals(item.getKind()))
                .filter(item -> StringUtils.hasText(item.getContent())).toList();
        List<MeetingMinutesDto.ItemForm> follows = items.stream()
                .filter(item -> item != null && MeetingMinutesItem.KIND_FOLLOW.equals(item.getKind()))
                .filter(item -> StringUtils.hasText(item.getContent())).toList();
        if (actions.size() > MAX_ITEMS_PER_KIND || follows.size() > MAX_ITEMS_PER_KIND) {
            throw new BusinessException("行動項與跟進事項各最多 " + MAX_ITEMS_PER_KIND + " 條");
        }
        Set<Long> ownerIds = items.stream().map(MeetingMinutesDto.ItemForm::getOwnerUserId)
                .filter(Objects::nonNull).collect(Collectors.toSet());
        Map<Long, SysUser> owners = ownerIds.isEmpty() ? Map.of()
                : userMapper.selectBatchIds(ownerIds).stream()
                        .collect(Collectors.toMap(SysUser::getId, Function.identity(), (a, b) -> a));
        upsertKind(minutes, MeetingMinutesItem.KIND_ACTION, actions, owners);
        upsertKind(minutes, MeetingMinutesItem.KIND_FOLLOW, follows, owners);
    }

    /** 正文里的旧结构 → 事项入参（只用于兼容；新页面一律直接传 items） */
    private static List<MeetingMinutesDto.ItemForm> legacyItems(MeetingMinutesContent content) {
        List<MeetingMinutesDto.ItemForm> out = new ArrayList<>();
        if (content == null) {
            return out;
        }
        if (content.getActions() != null) {
            for (MeetingMinutesContent.Action action : content.getActions()) {
                out.add(legacyItem(MeetingMinutesItem.KIND_ACTION, action.getContent(),
                        action.getOwnerUserId(), action.getDueDate()));
            }
        }
        if (content.getOpenIssues() != null) {
            for (MeetingMinutesContent.OpenIssue issue : content.getOpenIssues()) {
                out.add(legacyItem(MeetingMinutesItem.KIND_FOLLOW, issue.getContent(), null, null));
            }
        }
        return out;
    }

    private static MeetingMinutesDto.ItemForm legacyItem(String kind, String content, Long ownerId, String dueDate) {
        MeetingMinutesDto.ItemForm item = new MeetingMinutesDto.ItemForm();
        item.setKind(kind);
        item.setContent(content);
        item.setOwnerUserId(ownerId);
        item.setDueDate(dueDate);
        return item;
    }

    private void upsertKind(MeetingMinutes minutes, String kind, List<MeetingMinutesDto.ItemForm> items,
                            Map<Long, SysUser> owners) {
        int seq = 0;
        for (MeetingMinutesDto.ItemForm item : items) {
            seq++;
            SysUser owner = item.getOwnerUserId() == null ? null : owners.get(item.getOwnerUserId());
            if (item.getOwnerUserId() != null && owner == null) {
                throw new BusinessException("負責人不存在或已離職，請重新選擇");
            }
            itemMapper.upsertRow(minutes.getId(), minutes.getBookingId(), kind, seq,
                    truncate(item.getContent().trim(), 500),
                    owner == null ? null : owner.getId(),
                    owner == null ? "" : displayName(owner),
                    owner == null ? "" : Objects.toString(owner.getEmpId(), ""),
                    parseDueDate(item.getDueDate()));
        }
        itemMapper.deleteSurplus(minutes.getId(), kind, seq);
    }

    /**
     * 重建关联纪要：只采信 id，标题/时间/单号由服务端回查后做快照。
     * <p>拒绝关联自己：页面上看不出差异，但收件人会读到“引自本会”的荒唐来源。
     */
    private void saveLinks(MeetingMinutes minutes, MeetingMinutesDto.Form form) {
        linkMapper.deleteByMinutes(minutes.getId());
        List<Long> ids = form.getLinkedMinutesIds() == null ? List.of()
                : form.getLinkedMinutesIds().stream().filter(Objects::nonNull).distinct().toList();
        if (ids.isEmpty()) {
            return;
        }
        if (ids.size() > MAX_LINKS) {
            throw new BusinessException("最多關聯 " + MAX_LINKS + " 份紀要");
        }
        Map<Long, MeetingMinutes> targets = minutesMapper.selectBatchIds(ids).stream()
                .filter(target -> !Objects.equals(target.getId(), minutes.getId()))
                .filter(target -> !Integer.valueOf(1).equals(target.getDeleted()))
                .collect(Collectors.toMap(MeetingMinutes::getId, Function.identity(), (a, b) -> a));
        for (Long id : ids) {
            MeetingMinutes target = targets.get(id);
            if (target == null) {
                continue;
            }
            linkMapper.insertIgnore(minutes.getId(), target.getId(), target.getMinutesNo(), target.getBookingNo(),
                    target.getMeetingTitle(), target.getMeetingTimeText());
        }
    }

    /**
     * 签到补录：把“确实到了但没点钉钉签到”的人改为已参会。
     * <p>只补不撤：已签到的人不会被改回未签到；只影响本会议自己的参会记录。
     */
    private void applyAttendance(MeetingBooking booking, MeetingMinutesDto.Form form, SysUser current) {
        List<Long> ids = form.getMarkPresentUserIds() == null ? List.of()
                : form.getMarkPresentUserIds().stream().filter(Objects::nonNull).distinct().toList();
        if (ids.isEmpty()) {
            return;
        }
        int changed = 0;
        for (Long userId : ids) {
            changed += attendeeMapper.update(null, new LambdaUpdateWrapper<MeetingAttendee>()
                    .eq(MeetingAttendee::getBookingId, booking.getId())
                    .eq(MeetingAttendee::getUserId, userId)
                    .isNull(MeetingAttendee::getCheckinAt)
                    .set(MeetingAttendee::getCheckinAt, LocalDateTime.now())
                    .set(MeetingAttendee::getUpdatedBy, current.getName())
                    .set(MeetingAttendee::getUpdatedAt, LocalDateTime.now()));
        }
        if (changed > 0) {
            audit.recordBooking(booking.getId(), booking.getRoomId(), booking.getBookingNo(),
                    MeetingConstants.EVENT_MINUTES_UPDATE, "補錄參會 " + changed + " 人",
                    null, Map.of("present", changed), current, null);
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public MeetingMinutesDto.VO resolveItem(long itemId, MeetingMinutesDto.ResolveForm form) {
        requireEnabled();
        SysUser current = guard.currentUser();
        MeetingMinutesItem item = itemMapper.selectById(itemId);
        if (item == null || Integer.valueOf(1).equals(item.getDeleted())) {
            throw new BusinessException("事項不存在或已被刪除");
        }
        MeetingMinutes minutes = requireMinutes(item.getMinutesId());
        MeetingBooking booking = requireBooking(minutes.getBookingId());
        boolean writable = Objects.equals(minutes.getRecorderUserId(), current.getId())
                || guard.isOrganizer(booking, current) || guard.canOperateRecords(current);
        // 负责人回来更新自己那一条不需要菜单写权限：他可能连会议菜单都没有，但事是交给他办的
        boolean owner = Objects.equals(item.getOwnerUserId(), current.getId());
        if (!writable && !owner) {
            throw new BusinessException("只有負責人、記錄人或行政可以更新此事項");
        }
        String result = trimToNull(form == null ? null : form.getResult());
        if (result == null || !RESULTS.contains(result)) {
            throw new BusinessException("請選擇處理結果");
        }
        String note = trimToNull(form.getNote());
        if (!MeetingMinutesItem.RESULT_COMPLETED.equals(result) && note == null) {
            throw new BusinessException("部分完成或無法完成時，請說明原因");
        }
        if (note != null && note.length() > 500) {
            throw new BusinessException("說明最多 500 字");
        }
        itemMapper.markResolved(item.getId(), MeetingMinutesItem.STATUS_DONE, result, note,
                LocalDateTime.now(), current.getId(), displayName(current));
        audit.recordBooking(booking.getId(), booking.getRoomId(), booking.getBookingNo(),
                MeetingConstants.EVENT_MINUTES_UPDATE,
                "更新跟進事項：" + truncate(item.getContent(), 40) + " → " + MeetingMinutesRenderer.resultLabel(result),
                Map.of("status", nullToEmpty(item.getStatus())),
                Map.of("status", MeetingMinutesItem.STATUS_DONE, "result", result),
                current, null);
        MeetingMinutesItem updated = itemMapper.selectById(item.getId());
        afterCommit(() -> notifyItemDone(minutes, booking, updated, note, current));
        return toVO(minutes, booking, current);
    }

    /** 完成/部分完成/无法完成都要回到当初发纪要的群里说一声（没发过群则不通知，只留审计） */
    private void notifyItemDone(MeetingMinutes minutes, MeetingBooking booking, MeetingMinutesItem item,
                                String note, SysUser current) {
        MeetingMinutesSend batch = sendMapper.findLastGroupBatch(minutes.getId());
        if (batch == null || batch.getGroupChannelId() == null) {
            log.info("紀要未發過群，事項完成不通知群: minutesId={}", minutes.getId());
            return;
        }
        if (!templateService.enabled(MeetingConstants.SCENARIO_FOLLOW_DONE,
                com.mftb.admin.entity.SysNotificationSwitch.CHANNEL_GROUP)) {
            log.info("跟進完成通知已靜音: minutesId={}", minutes.getId());
            return;
        }
        String base = baseUrl();
        String viewUrl = base == null ? "" : base + "/meeting-minutes?bookingId=" + booking.getId();
        Map<String, String> vars = new java.util.LinkedHashMap<>();
        vars.put("itemContent", nullToEmpty(item.getContent()));
        vars.put("meetingTitle", nullToEmpty(minutes.getMeetingTitle()));
        vars.put("meetingTime", nullToEmpty(minutes.getMeetingTimeText()));
        vars.put("resultLabel", MeetingMinutesRenderer.resultLabel(item.getResult()));
        vars.put("ownerName", nullToEmpty(item.getOwnerName()));
        vars.put("ownerEmpNo", nullToEmpty(item.getOwnerEmpNo()));
        vars.put("doneByName", nullToEmpty(item.getDoneByName()));
        vars.put("noteLine", StringUtils.hasText(note) ? "說明：" + note + "\n" : "");
        vars.put("viewUrl", viewUrl);
        MeetingNotifyTemplateService.Rendered rendered =
                templateService.render(MeetingConstants.SCENARIO_FOLLOW_DONE, vars);
        String title = rendered != null ? rendered.title() : "【待辦完成】" + nullToEmpty(item.getContent());
        String body = rendered != null ? rendered.body() : fallbackItemDone(vars);
        try {
            dingTalkService.sendMarkdownSyncToChannel(batch.getGroupChannelId(), title, body, List.of(), false);
            audit.recordBooking(booking.getId(), booking.getRoomId(), booking.getBookingNo(),
                    MeetingConstants.EVENT_MINUTES_UPDATE, "事項完成通知已發群：" + batch.getGroupChannelName(),
                    null, Map.of("channel", batch.getGroupChannelName()), current, null);
        } catch (RuntimeException e) {
            // 通知失败不影响业务：状态已经落库，失败只留痕（与投递队列同一口径：不静默吞）
            log.warn("事項完成通知發送失敗: minutesId={}, type={}", minutes.getId(), e.getClass().getSimpleName());
        }
    }

    private String fallbackItemDone(Map<String, String> vars) {
        return "**會議待辦已更新**\n\n**" + vars.get("itemContent") + "**\n\n"
                + "來源會議：" + vars.get("meetingTitle") + "（" + vars.get("meetingTime") + "）\n"
                + "處理結果：**" + vars.get("resultLabel") + "**\n"
                + "負責人：👤 **" + vars.get("ownerName") + "（" + vars.get("ownerEmpNo") + "）**\n"
                + "更新人：" + vars.get("doneByName") + "\n" + vars.get("noteLine");
    }

    private void afterCommit(Runnable action) {
        if (org.springframework.transaction.support.TransactionSynchronizationManager.isSynchronizationActive()) {
            org.springframework.transaction.support.TransactionSynchronizationManager.registerSynchronization(
                    new org.springframework.transaction.support.TransactionSynchronization() {
                        @Override
                        public void afterCommit() {
                            action.run();
                        }
                    });
        } else {
            action.run();
        }
    }

    private List<MeetingMinutesDto.ItemVO> toItemVOs(MeetingMinutes minutes, MeetingBooking booking, SysUser current) {
        List<MeetingMinutesItem> rows = itemMapper.findByMinutes(minutes.getId());
        boolean writable = Objects.equals(minutes.getRecorderUserId(), current.getId())
                || guard.isOrganizer(booking, current) || guard.canOperateRecords(current);
        java.time.LocalDate today = java.time.LocalDate.now();
        List<MeetingMinutesDto.ItemVO> out = new ArrayList<>();
        for (MeetingMinutesItem row : rows) {
            MeetingMinutesDto.ItemVO vo = new MeetingMinutesDto.ItemVO();
            vo.setId(row.getId());
            vo.setKind(row.getKind());
            vo.setSeq(row.getSeq());
            vo.setContent(row.getContent());
            vo.setOwnerUserId(row.getOwnerUserId());
            vo.setOwnerName(row.getOwnerName());
            vo.setOwnerEmpNo(row.getOwnerEmpNo());
            vo.setDueDate(row.getDueDate() == null ? null : row.getDueDate().toString());
            vo.setStatus(row.getStatus());
            vo.setResult(row.getResult());
            vo.setResolutionNote(row.getResolutionNote());
            vo.setDoneAt(DateTimeUtils.format(row.getDoneAt()));
            vo.setDoneByName(row.getDoneByName());
            vo.setOverdue(MeetingMinutesItem.STATUS_PENDING.equals(row.getStatus())
                    && row.getDueDate() != null && row.getDueDate().isBefore(today));
            vo.setCanResolve(!MeetingMinutesItem.STATUS_DONE.equals(row.getStatus())
                    && (writable || Objects.equals(row.getOwnerUserId(), current.getId())));
            out.add(vo);
        }
        return out;
    }

    private MeetingMinutesDto.LinkVO toLinkVO(MeetingMinutesLink link) {
        MeetingMinutesDto.LinkVO vo = new MeetingMinutesDto.LinkVO();
        vo.setMinutesId(link.getLinkedMinutesId());
        vo.setMinutesNo(link.getLinkedMinutesNo());
        vo.setBookingNo(link.getLinkedBookingNo());
        vo.setTitle(link.getLinkedTitle());
        vo.setTimeText(link.getLinkedTimeText());
        return vo;
    }

    /* ==================== 行政检索 ==================== */

    @Override
    public List<MeetingMinutesDto.LinkVO> search(String minutesIdOrKeyword, Long excludeId) {
        requireEnabled();
        guard.currentUser();
        StringBuilder sql = new StringBuilder("SELECT * FROM biz_meeting_minutes WHERE deleted = 0");
        List<Object> params = new ArrayList<>();
        if (excludeId != null) {
            sql.append(" AND id <> ?");
            params.add(excludeId);
        }
        if (StringUtils.hasText(minutesIdOrKeyword)) {
            String like = "%" + minutesIdOrKeyword.trim() + "%";
            sql.append(" AND (minutes_no LIKE ? OR booking_no LIKE ? OR meeting_title LIKE ?)");
            params.add(like);
            params.add(like);
            params.add(like);
        }
        sql.append(" ORDER BY id DESC LIMIT 20");
        List<MeetingMinutes> rows = jdbc.query(sql.toString(),
                (rs, rowNum) -> {
                    MeetingMinutes minutes = new MeetingMinutes();
                    minutes.setId(rs.getLong("id"));
                    minutes.setMinutesNo(rs.getString("minutes_no"));
                    minutes.setBookingNo(rs.getString("booking_no"));
                    minutes.setMeetingTitle(rs.getString("meeting_title"));
                    minutes.setMeetingTimeText(rs.getString("meeting_time_text"));
                    return minutes;
                }, params.toArray());
        List<MeetingMinutesDto.LinkVO> out = new ArrayList<>();
        for (MeetingMinutes row : rows) {
            MeetingMinutesDto.LinkVO vo = new MeetingMinutesDto.LinkVO();
            vo.setMinutesId(row.getId());
            vo.setMinutesNo(row.getMinutesNo());
            vo.setBookingNo(row.getBookingNo());
            vo.setTitle(row.getMeetingTitle());
            vo.setTimeText(row.getMeetingTimeText());
            out.add(vo);
        }
        return out;
    }

    @Override
    public MeetingMinutesDto.AdminPage adminPage(MeetingMinutesDto.AdminQuery query) {
        requireEnabled();
        SysUser current = guard.currentUser();
        if (!guard.canOperateRecords(current)) {
            throw new BusinessException("無權查看全部會議紀要");
        }
        StringBuilder where = new StringBuilder(" WHERE m.deleted = 0");
        List<Object> params = new ArrayList<>();
        if (StringUtils.hasText(query.getKeyword())) {
            String like = "%" + query.getKeyword().trim() + "%";
            where.append(" AND (m.minutes_no LIKE ? OR m.booking_no LIKE ? OR m.meeting_title LIKE ? ")
                    .append("OR m.digest LIKE ?)");
            params.add(like);
            params.add(like);
            params.add(like);
            params.add(like);
        }
        if (StringUtils.hasText(query.getRecorderKeyword())) {
            String like = "%" + query.getRecorderKeyword().trim() + "%";
            where.append(" AND (m.recorder_name LIKE ? OR m.recorder_emp_no LIKE ?)");
            params.add(like);
            params.add(like);
        }
        if (StringUtils.hasText(query.getStatus())) {
            where.append(" AND m.status = ?");
            params.add(query.getStatus().trim());
        }
        if (StringUtils.hasText(query.getStartDate())) {
            where.append(" AND b.start_time >= ?");
            params.add(java.time.LocalDate.parse(query.getStartDate().trim()).atStartOfDay());
        }
        if (StringUtils.hasText(query.getEndDate())) {
            where.append(" AND b.start_time < ?");
            params.add(java.time.LocalDate.parse(query.getEndDate().trim()).plusDays(1).atStartOfDay());
        }
        String itemState = trimToNull(query.getItemState());
        if ("pending".equals(itemState)) {
            where.append(" AND EXISTS (SELECT 1 FROM biz_meeting_minutes_item i WHERE i.minutes_id = m.id ")
                    .append("AND i.deleted = 0 AND i.status = 'pending')");
        } else if ("overdue".equals(itemState)) {
            where.append(" AND EXISTS (SELECT 1 FROM biz_meeting_minutes_item i WHERE i.minutes_id = m.id ")
                    .append("AND i.deleted = 0 AND i.status = 'pending' AND i.due_date < CURDATE())");
        } else if ("empty".equals(itemState)) {
            where.append(" AND NOT EXISTS (SELECT 1 FROM biz_meeting_minutes_item i WHERE i.minutes_id = m.id ")
                    .append("AND i.deleted = 0)");
        }
        String from = " FROM biz_meeting_minutes m LEFT JOIN biz_meeting_booking b ON b.id = m.booking_id";
        Map<String, Object> stats = jdbc.queryForMap("SELECT COUNT(*) AS total, "
                + "COALESCE(SUM(EXISTS (SELECT 1 FROM biz_meeting_minutes_item i WHERE i.minutes_id = m.id "
                + "AND i.deleted = 0 AND i.status = 'pending')), 0) AS pending_items, "
                + "COALESCE(SUM(EXISTS (SELECT 1 FROM biz_meeting_minutes_item i WHERE i.minutes_id = m.id "
                + "AND i.deleted = 0 AND i.status = 'pending' AND i.due_date < CURDATE())), 0) AS overdue_items, "
                + "COALESCE(SUM(CASE WHEN m.status = 'sent' THEN 1 ELSE 0 END), 0) AS sent_minutes"
                + from + where, params.toArray());

        long page = com.mftb.admin.dto.PageResult.normalizePage(query.getPage() == null ? 1 : query.getPage());
        long size = com.mftb.admin.dto.PageResult.normalizeSize(query.getSize() == null ? 20 : query.getSize());
        List<Object> listParams = new ArrayList<>(params);
        listParams.add((page - 1) * size);
        listParams.add(size);
        List<MeetingMinutesDto.AdminRow> rows = jdbc.query("SELECT m.id, m.booking_id, m.minutes_no, m.booking_no, "
                + "m.meeting_title, m.meeting_time_text, m.room_text, m.recorder_name, m.recorder_emp_no, "
                + "m.status, m.send_count, m.last_send_at, m.digest, "
                + "(SELECT COUNT(*) FROM biz_meeting_minutes_item i WHERE i.minutes_id = m.id AND i.deleted = 0) AS item_total, "
                + "(SELECT COUNT(*) FROM biz_meeting_minutes_item i WHERE i.minutes_id = m.id AND i.deleted = 0 "
                + " AND i.status = 'pending') AS item_pending, "
                + "(SELECT COUNT(*) FROM biz_meeting_minutes_item i WHERE i.minutes_id = m.id AND i.deleted = 0 "
                + " AND i.status = 'pending' AND i.due_date < CURDATE()) AS item_overdue"
                + from + where + " ORDER BY b.start_time DESC, m.id DESC LIMIT ?, ?",
                (rs, rowNum) -> {
                    MeetingMinutesDto.AdminRow row = new MeetingMinutesDto.AdminRow();
                    row.setMinutesId(rs.getLong("id"));
                    row.setBookingId(rs.getLong("booking_id"));
                    row.setMinutesNo(rs.getString("minutes_no"));
                    row.setBookingNo(rs.getString("booking_no"));
                    row.setMeetingTitle(rs.getString("meeting_title"));
                    row.setMeetingTimeText(rs.getString("meeting_time_text"));
                    row.setRoomText(rs.getString("room_text"));
                    row.setRecorderName(rs.getString("recorder_name"));
                    row.setRecorderEmpNo(rs.getString("recorder_emp_no"));
                    row.setStatus(rs.getString("status"));
                    row.setSendCount(rs.getInt("send_count"));
                    java.sql.Timestamp lastSend = rs.getTimestamp("last_send_at");
                    row.setLastSendAt(lastSend == null ? null
                            : DateTimeUtils.format(lastSend.toLocalDateTime()));
                    row.setDigest(rs.getString("digest"));
                    row.setItemTotal(rs.getInt("item_total"));
                    row.setItemPending(rs.getInt("item_pending"));
                    row.setItemOverdue(rs.getInt("item_overdue"));
                    return row;
                }, listParams.toArray());
        MeetingMinutesDto.AdminPage result = new MeetingMinutesDto.AdminPage();
        result.setList(rows);
        result.setTotal(((Number) stats.get("total")).longValue());
        result.setPendingItems(((Number) stats.get("pending_items")).longValue());
        result.setOverdueItems(((Number) stats.get("overdue_items")).longValue());
        result.setSentMinutes(((Number) stats.get("sent_minutes")).longValue());
        return result;
    }

    private static java.time.LocalDate parseDueDate(String value) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        try {
            return java.time.LocalDate.parse(value.trim());
        } catch (RuntimeException e) {
            throw new BusinessException("完成時限格式不正確，應為 yyyy-MM-dd");
        }
    }

    private MeetingMinutes requireMinutes(long minutesId) {
        MeetingMinutes minutes = minutesMapper.selectById(minutesId);
        if (minutes == null) {
            throw new BusinessException(NOT_FOUND);
        }
        return minutes;
    }

    private MeetingBooking requireBooking(long bookingId) {
        MeetingBooking booking = bookingMapper.selectById(bookingId);
        if (booking == null) {
            throw new BusinessException("會議記錄不存在或已刪除");
        }
        return booking;
    }

    private MeetingMinutesContent requireContent(MeetingMinutesDto.Form form) {
        MeetingMinutesContent content = form.getContent();
        if (content == null) {
            throw new BusinessException("請填寫紀要內容");
        }
        // 行动项负责人要按 id 回查姓名与工号：前端自报的名字进不了台账
        resolveActionOwners(content);
        content.validate();
        return content;
    }

    private MeetingMinutesContent decodeContent(MeetingMinutes minutes) {
        MeetingMinutesContent content = JsonUtils.parse(minutes.getContentJson(), MeetingMinutesContent.class);
        if (content == null) {
            throw new BusinessException("紀要正文無法解析，請重新編輯後保存");
        }
        return content;
    }

    /**
     * 负责人姓名/工号由服务端按 id 回查。
     *
     * <p>与行政代订的 delegateForId 同一口径：请求体里只有 id，名字是查出来的快照。
     * 允许前端传名字，等于允许在纪要里写任意"负责人"，事后要追责时对不上人。
     */
    private void resolveActionOwners(MeetingMinutesContent content) {
        List<MeetingMinutesContent.Action> actions = content.getActions();
        if (actions == null || actions.isEmpty()) {
            return;
        }
        List<Long> ids = actions.stream().map(MeetingMinutesContent.Action::getOwnerUserId)
                .filter(Objects::nonNull).filter(id -> id > 0).distinct().toList();
        if (ids.isEmpty()) {
            actions.forEach(action -> {
                action.setOwnerName(null);
                action.setOwnerEmpNo(null);
            });
            return;
        }
        Map<Long, SysUser> users = userMapper.selectList(new LambdaQueryWrapper<SysUser>().in(SysUser::getId, ids))
                .stream().collect(Collectors.toMap(SysUser::getId, Function.identity(), (a, b) -> a));
        for (MeetingMinutesContent.Action action : actions) {
            Long userId = action.getOwnerUserId();
            SysUser owner = userId == null ? null : users.get(userId);
            if (userId != null && owner == null) {
                throw new BusinessException("行動項負責人不存在或已離職，請重新選擇");
            }
            action.setOwnerName(owner == null ? null : displayName(owner));
            action.setOwnerEmpNo(owner == null ? null : Objects.toString(owner.getEmpId(), ""));
        }
    }

    /* ==================== 视图转换 ==================== */

    private MeetingMinutesDto.VO toVO(MeetingMinutes minutes, MeetingBooking booking, SysUser current) {
        MeetingMinutesDto.VO vo = new MeetingMinutesDto.VO();
        vo.setBookingId(booking.getId());
        vo.setBookingNo(booking.getBookingNo());
        vo.setMinutesEnabled(minutesEnabled);
        // 站点地址在打开页面时就告诉前端：内网地址要在“点发送之前”提示，不能等发完才发现
        String linkBase = baseUrl();
        vo.setLinkBaseUrl(linkBase);
        vo.setLinkBasePublic(PublicLinkGuard.isPubliclyReachable(linkBase));
        if (minutes == null) {
            vo.setExists(false);
            vo.setMeetingTitle(booking.getTitle());
            vo.setMeetingTimeText(timeText(booking.getStartTime(), booking.getEndTime()));
            vo.setRoomText(roomText(booking));
            vo.setOrganizerName(booking.getOrganizerName());
            // 记录人默认就是当前登录人：前端只读展示，写库时服务端仍按 JWT 落，不采信回传
            vo.setRecorderUserId(current.getId());
            vo.setRecorderName(displayName(current));
            vo.setRecorderEmpNo(Objects.toString(current.getEmpId(), ""));
            vo.setContent(new MeetingMinutesContent());
            boolean mayCreate = (isRelated(booking, current) && canRecordPermission(current))
                    || guard.canOperateRecords(current);
            boolean recordable = recordableByPhase(booking, LocalDateTime.now());
            vo.setCanEdit(mayCreate && recordable);
            vo.setEditLockReason(lockReason(mayCreate, recordable));
            vo.setCanSend(false);
            vo.setVersion(0);
            vo.setSeries(seriesNodes(booking, null));
            vo.setSuggestedAbsentees(suggestedAbsentees(booking));
            return vo;
        }
        vo.setExists(true);
        vo.setId(minutes.getId());
        vo.setMinutesNo(minutes.getMinutesNo());
        vo.setMeetingTitle(minutes.getMeetingTitle());
        vo.setMeetingTimeText(minutes.getMeetingTimeText());
        vo.setRoomText(minutes.getRoomText());
        vo.setOrganizerName(minutes.getOrganizerName());
        vo.setRecorderUserId(minutes.getRecorderUserId());
        vo.setRecorderName(minutes.getRecorderName());
        vo.setRecorderEmpNo(minutes.getRecorderEmpNo());
        vo.setContent(JsonUtils.parse(minutes.getContentJson(), MeetingMinutesContent.class));
        vo.setDigest(minutes.getDigest());
        vo.setStatus(minutes.getStatus());
        vo.setSendCount(minutes.getSendCount());
        vo.setLastSendAt(DateTimeUtils.format(minutes.getLastSendAt()));
        vo.setVersion(minutes.getVersion());
        boolean writable = Objects.equals(minutes.getRecorderUserId(), current.getId())
                || guard.isOrganizer(booking, current) || guard.canOperateRecords(current);
        vo.setCanEdit(writable);
        vo.setCanSend(writable);
        // 已存在的纪要只被"谁记的/谁组织的/行政"管，与会议阶段无关
        vo.setEditLockReason(lockReason(writable, true));
        vo.setCreatedBy(minutes.getCreatedBy());
        vo.setCreatedAt(DateTimeUtils.format(minutes.getCreatedAt()));
        vo.setUpdatedBy(minutes.getUpdatedBy());
        vo.setUpdatedAt(DateTimeUtils.format(minutes.getUpdatedAt()));
        vo.setSeries(seriesNodes(booking, minutes));
        vo.setItems(toItemVOs(minutes, booking, current));
        vo.setLinks(linkMapper.findByMinutes(minutes.getId()).stream().map(this::toLinkVO).toList());
        vo.setItemOwner(vo.getItems().stream()
                .anyMatch(item -> Objects.equals(item.getOwnerUserId(), current.getId())));
        return vo;
    }

    /**
     * 建议缺席名单：已婉拒的人确定不来；会议已结束仍未签到的人按“未签到缺席”提示。
     * <p>只作为记录人的初始参考——开会迟到十分钟不该被系统写成缺席，前端仍可增删。
     * <p>排除组织者：组织者不到场是异常，不该被默认写进缺席名单。
     */
    private List<MeetingMinutesDto.SuggestedAbsenteeVO> suggestedAbsentees(MeetingBooking booking) {
        List<MeetingAttendee> attendees = attendeeMapper.selectList(new LambdaQueryWrapper<MeetingAttendee>()
                .eq(MeetingAttendee::getBookingId, booking.getId()));
        boolean ended = List.of("ended", "finished", "released").contains(phaseOf(booking, LocalDateTime.now()));
        List<MeetingMinutesDto.SuggestedAbsenteeVO> out = new ArrayList<>();
        for (MeetingAttendee attendee : attendees) {
            if ("organizer".equals(attendee.getAttendeeType())) {
                continue;
            }
            String reason = null;
            if ("declined".equals(attendee.getResponse())) {
                reason = "DECLINED";
            } else if (ended && attendee.getCheckinAt() == null) {
                reason = "NO_CHECKIN";
            }
            if (reason == null) {
                continue;
            }
            MeetingMinutesDto.SuggestedAbsenteeVO vo = new MeetingMinutesDto.SuggestedAbsenteeVO();
            vo.setUserId(attendee.getUserId());
            vo.setName(attendee.getName());
            vo.setEmpNo(attendee.getEmpNo());
            vo.setReasonCode(reason);
            out.add(vo);
        }
        return out;
    }

    /**
     * 系列纪要时间轴。
     *
     * <p>只在会议属于周期系列时返回，并且把系列下<strong>所有场次</strong>都列出来（含还没录纪要的）：
     * 只列已录入的那几场会让人误判"这个系列就开了 2 次会"。
     */
    private List<MeetingMinutesDto.SeriesNodeVO> seriesNodes(MeetingBooking booking, MeetingMinutes minutes) {
        if (booking.getSeriesId() == null) {
            return List.of();
        }
        List<MeetingBooking> occurrences = bookingMapper.selectList(new LambdaQueryWrapper<MeetingBooking>()
                .eq(MeetingBooking::getSeriesId, booking.getSeriesId())
                .orderByAsc(MeetingBooking::getSeriesSeq));
        Map<Long, MeetingMinutes> byBooking = minutesMapper.findByBookings(
                        occurrences.stream().map(MeetingBooking::getId).toList()).stream()
                .collect(Collectors.toMap(MeetingMinutes::getBookingId, Function.identity(), (a, b) -> a));
        List<MeetingMinutesDto.SeriesNodeVO> nodes = new ArrayList<>();
        for (MeetingBooking occurrence : occurrences) {
            MeetingMinutes exist = byBooking.get(occurrence.getId());
            MeetingMinutesDto.SeriesNodeVO node = new MeetingMinutesDto.SeriesNodeVO();
            node.setBookingId(occurrence.getId());
            node.setSeriesSeq(occurrence.getSeriesSeq());
            node.setTitle(occurrence.getTitle());
            node.setStartTime(DateTimeUtils.format(occurrence.getStartTime()));
            node.setStatus(occurrence.getStatus());
            node.setHasMinutes(exist != null);
            node.setMinutesId(exist == null ? null : exist.getId());
            node.setCurrent(Objects.equals(occurrence.getId(), booking.getId()));
            nodes.add(node);
        }
        if (nodes.isEmpty() && minutes != null) {
            // 兜底：系列场次已被删除但纪要还在，至少让自己这一条可点
            MeetingMinutesDto.SeriesNodeVO self = new MeetingMinutesDto.SeriesNodeVO();
            self.setBookingId(booking.getId());
            self.setSeriesSeq(booking.getSeriesSeq());
            self.setTitle(booking.getTitle());
            self.setStartTime(DateTimeUtils.format(booking.getStartTime()));
            self.setStatus(booking.getStatus());
            self.setHasMinutes(true);
            self.setMinutesId(minutes.getId());
            self.setCurrent(true);
            nodes.add(self);
        }
        return nodes;
    }

    private MeetingMinutesDto.SendVO toSendVO(MeetingMinutesSend batch, MeetingMinutes minutes,
                                              List<MeetingMinutesDelivery> deliveries) {
        MeetingMinutesDto.SendVO vo = new MeetingMinutesDto.SendVO();
        vo.setId(batch.getId());
        vo.setMinutesId(batch.getMinutesId());
        vo.setBatchSeq(batch.getBatchSeq());
        vo.setMinutesNo(batch.getMinutesNo());
        vo.setBookingNo(batch.getBookingNo());
        vo.setTitle(batch.getTitle());
        vo.setContentSnapshot(JsonUtils.parse(batch.getContentSnapshot(), MeetingMinutesContent.class));
        vo.setMarkdownSnapshot(batch.getMarkdownSnapshot());
        vo.setGroupChannelId(batch.getGroupChannelId());
        vo.setGroupChannelName(batch.getGroupChannelName());
        vo.setReceiverCount(batch.getReceiverCount());
        vo.setSendStatus(batch.getSendStatus());
        vo.setSuccessCount(batch.getSuccessCount());
        vo.setFailedCount(batch.getFailedCount());
        vo.setSkippedCount(batch.getSkippedCount());
        vo.setErrorMsg(batch.getErrorMsg());
        vo.setOperatorName(batch.getOperatorName());
        vo.setOperatorEmpNo(batch.getOperatorEmpNo());
        vo.setSentAt(DateTimeUtils.format(batch.getSentAt()));
        vo.setLinkExpireAt(DateTimeUtils.format(batch.getLinkExpireAt()));
        boolean revoked = !Objects.equals(batch.getTokenVersion(), minutes.getTokenVersion());
        vo.setLinkRevoked(revoked);
        if (!revoked && batch.getTokenVersion() != null && batch.getLinkExpireAt() != null) {
            String token = MinutesViewTokenUtil.generate(minutes.getId(), batch.getId(), batch.getTokenVersion(),
                    batch.getLinkExpireAt(), tokenSecret());
            vo.setViewUrl(relativeViewUrl(token));
        }
        vo.setDeliveries(deliveries.stream().map(this::toDeliveryVO).toList());
        return vo;
    }

    private MeetingMinutesDto.DeliveryVO toDeliveryVO(MeetingMinutesDelivery row) {
        MeetingMinutesDto.DeliveryVO vo = new MeetingMinutesDto.DeliveryVO();
        if (row == null) {
            return vo;
        }
        vo.setId(row.getId());
        vo.setTargetType(row.getTargetType());
        boolean group = MeetingConstants.MINUTES_TARGET_GROUP.equals(row.getTargetType());
        vo.setGroupName(group ? row.getReceiverName() : null);
        vo.setReceiverName(group ? null : row.getReceiverName());
        vo.setReceiverEmpNo(row.getReceiverEmpNo());
        vo.setReceiverDepartment(row.getReceiverDepartment());
        // 群行的投递对象就是机器人，不存在"没绑定"；只有收件人才需要区分未绑定钉钉
        vo.setDingtalkBound(group ? Boolean.TRUE : StringUtils.hasText(row.getReceiverDingtalkId()));
        vo.setSendStatus(row.getSendStatus());
        vo.setRetryCount(row.getRetryCount());
        vo.setErrorMsg(row.getErrorMsg());
        vo.setUpdatedAt(DateTimeUtils.format(row.getUpdatedAt()));
        return vo;
    }

    private MeetingMinutesDto.GroupOptionVO toGroupOption(SysNotificationChannel channel) {
        MeetingMinutesDto.GroupOptionVO vo = new MeetingMinutesDto.GroupOptionVO();
        vo.setId(channel.getId());
        vo.setName(channel.getName());
        return vo;
    }

    private MeetingMinutes snapshot(MeetingMinutes source) {
        MeetingMinutes copy = new MeetingMinutes();
        copy.setId(source.getId());
        copy.setDigest(source.getDigest());
        copy.setStatus(source.getStatus());
        copy.setVersion(source.getVersion());
        return copy;
    }

    /* ==================== 小工具 ==================== */

    /** 令牌密钥：优先环境变量；没配时惰性生成并落到 sys_config，与签到令牌同一套做法 */
    private String tokenSecret() {
        String configured = tokenSecretConfig;
        if (StringUtils.hasText(configured)) {
            return configured;
        }
        return lazySecretFromConfig();
    }

    /**
     * 从 sys_config 取密钥，没有就生成一把。
     *
     * <p>并发下两个实例可能各生成一把、后写的赢：先写后回读，用回读到的值签发，
     * 这样同一进程内后续校验一定与已写入的一致（极端情况下早先签出的令牌失效，重新索取即可）。
     */
    private String lazySecretFromConfig() {
        String stored = configValue(MeetingConstants.CFG_MINUTES_TOKEN_SECRET);
        if (StringUtils.hasText(stored)) {
            return stored;
        }
        byte[] bytes = new byte[32];
        new java.security.SecureRandom().nextBytes(bytes);
        String generated = java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        saveConfig(MeetingConstants.CFG_MINUTES_TOKEN_SECRET, generated);
        String reread = configValue(MeetingConstants.CFG_MINUTES_TOKEN_SECRET);
        log.info("會議紀要查看密鑰已生成: usedStored={}", StringUtils.hasText(reread));
        return StringUtils.hasText(reread) ? reread : generated;
    }

    private String configValue(String key) {
        return sysConfigValue(key);
    }

    private void saveConfig(String key, String value) {
        sysConfigUpdate(key, value);
    }
    /** sys_config 读写：密钥这类运行期配置存库而不是存文件，管理员不需要重启就能换密钥 */
    private String sysConfigValue(String key) {
        try {
            List<String> values = jdbc.queryForList(
                    "SELECT config_value FROM sys_config WHERE config_key = ? LIMIT 1", String.class, key);
            return values.isEmpty() ? null : values.get(0);
        } catch (RuntimeException e) {
            log.warn("讀取會議紀要密鑰失敗: {}", e.getClass().getSimpleName());
            return null;
        }
    }

    private void sysConfigUpdate(String key, String value) {
        try {
            jdbc.update("INSERT INTO sys_config (config_key, config_value) VALUES (?, ?) "
                    + "ON DUPLICATE KEY UPDATE config_value = VALUES(config_value)", key, value);
        } catch (RuntimeException e) {
            log.warn("寫入會議紀要密鑰失敗: {}", e.getClass().getSimpleName());
        }
    }

    /** 站点地址：纪要链接要能点开，优先纪要场景绑定的应用，其次沿用邀约场景的站点（同一套管理后台） */
    private String baseUrl() {
        for (String scenario : List.of(MeetingConstants.SCENARIO_MINUTES, MeetingConstants.SCENARIO_INVITE)) {
            NotificationAppService.Credentials app = appService.resolve(scenario);
            if (app != null && StringUtils.hasText(app.getBaseUrl())) {
                String base = app.getBaseUrl().trim();
                while (base.endsWith("/") || base.endsWith("#")) {
                    base = base.substring(0, base.length() - 1);
                }
                return base;
            }
        }
        return null;
    }

    /** 站内返回相对路径：开发/生产域名不同，写死绝对地址会让链接在另一环境里失效 */
    private String relativeViewUrl(String token) {
        return "/meeting-minutes-view?token=" + token;
    }

    private int nextBatchSeq(long minutesId) {
        return sendMapper.nextBatchSeq(minutesId);
    }

    /** 锁定原因：没权限与"还不是时候"必须分开报，两者在界面上都只表现为按钮消失 */
    private static String lockReason(boolean permitted, boolean recordableTiming) {
        if (permitted && recordableTiming) {
            return null;
        }
        return !permitted ? LOCK_REASON_PERMISSION : LOCK_REASON_TIMING;
    }

    private static boolean recordableByPhase(MeetingBooking booking, LocalDateTime now) {
        if (NON_RECORDABLE_STATUSES.contains(booking.getStatus())) {
            return false;
        }
        return RECORDABLE_PHASES.contains(phaseOf(booking, now));
    }

    /** 阶段派生与 MeetingBookingServiceImpl 同口径：进行中不落库，由时间与状态算出 */
    private static String phaseOf(MeetingBooking booking, LocalDateTime now) {
        if (!MeetingConstants.OCCUPYING_STATUSES.contains(booking.getStatus())) {
            return booking.getStatus();
        }
        if (booking.getEndTime() == null || !booking.getEndTime().isAfter(now)) {
            return "ended";
        }
        return booking.getStartTime() != null && booking.getStartTime().isAfter(now) ? "pending" : "ongoing";
    }

    private static String timeText(LocalDateTime start, LocalDateTime end) {
        if (start == null || end == null) {
            return "";
        }
        String date = DateTimeUtils.format(start).substring(0, 10);
        return date + " " + String.format("%02d:%02d", start.getHour(), start.getMinute())
                + "–" + String.format("%02d:%02d", end.getHour(), end.getMinute());
    }

    private static String roomText(MeetingBooking booking) {
        List<String> parts = new ArrayList<>();
        if (StringUtils.hasText(booking.getRoomName())) {
            parts.add(booking.getRoomName());
        }
        if (StringUtils.hasText(booking.getRoomLocation())) {
            parts.add(booking.getRoomLocation());
        }
        return String.join(" · ", parts);
    }

    private static String displayName(SysUser user) {
        return StringUtils.hasText(user.getName()) ? user.getName() : user.getUsername();
    }

    /** 乐观锁字段兼容：契约名 expectVersion 优先于历史字段 version（两者都空按 0 处理，交给冲突分支拒绝） */
    private static Integer versionOf(Integer version, Integer expectVersion) {
        return version != null ? version : expectVersion;
    }

    private static int requireVersion(Integer version) {
        if (version == null || version < 0) {
            throw new BusinessException("缺少版本號，請刷新後重試");
        }
        return version;
    }

    private static String trimToNull(String value) {
        return StringUtils.hasText(value) ? value.trim() : null;
    }

    private static String truncate(String value, int max) {
        if (value == null) {
            return "";
        }
        return value.length() <= max ? value : value.substring(0, max);
    }

    private static String nullToEmpty(String value) {
        return value == null ? "" : value;
    }

    /** 正文摘要哈希：同幂等键不同内容要被拒绝（与预约单的 request_hash 同一语义） */
    private static String hashOf(MeetingMinutesContent content) {
        return org.springframework.util.DigestUtils.md5DigestAsHex(
                JsonUtils.toJson(content).getBytes(java.nio.charset.StandardCharsets.UTF_8));
    }
}
