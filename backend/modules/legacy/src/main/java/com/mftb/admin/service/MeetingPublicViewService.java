package com.mftb.admin.service;

import com.mftb.admin.constant.MeetingConstants;
import com.mftb.admin.dto.MeetingBookingDto;
import com.mftb.admin.entity.MeetingAttendee;
import com.mftb.admin.entity.MeetingBooking;
import com.mftb.admin.mapper.MeetingAttendeeMapper;
import com.mftb.admin.mapper.MeetingBookingMapper;
import com.mftb.admin.util.DateTimeUtils;
import com.mftb.admin.util.MeetingViewTokenUtil;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.security.SecureRandom;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * 会议详情免登链接：签发（邀约卡片）与读取（公开页）的唯一入口。
 *
 * <p>三件事由结构保证，不靠调用方约定：
 * <ol>
 *   <li><b>令牌只绑会议与有效期</b>：邀约发给 N 个人，逐人签发会让同一场会长出 N 条链接；
 *       这里只授予「这一场会的只读查看权」，与日报看板同一安全模型；</li>
 *   <li><b>密钥与签到/纪要分开</b>：换一把不该让另一类链接同时失效；</li>
 *   <li><b>响应里不出现内部字段</b>：免登链接可被转发，参会人只给姓名/身份/响应态，
 *       工号、手机号、部门、投递明细、审计轨迹一律不回；只回会议本身与状态。</li>
 * </ol>
 *
 * <p>失败响应对"签名错/过期/会议不存在"统一给同一句提示：区分它们等于让攻击者
 * 用错误码枚举有效令牌。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class MeetingPublicViewService {

    /** 免登页对无效令牌的统一文案（不暴露无效原因） */
    private static final String INVALID_TOKEN_MESSAGE = "會議詳情連結無效或已過期，請從釘釘卡片重新進入";
    private static final int SECRET_BYTES = 32;

    private final MeetingBookingMapper bookingMapper;
    private final MeetingAttendeeMapper attendeeMapper;
    private final SysConfigService sysConfigService;

    /* ==================== 链接签发 ==================== */

    /**
     * 生成邀约卡片里的免登详情链接。
     *
     * <p>有效期 = 会议结束时间 + {@link MeetingConstants#VIEW_LINK_TTL_DAYS} 天；
     * 结束时间为空或已过很久时至少保留 1 天，避免卡片刚发出就点不开。
     *
     * @return 链接；站点地址缺失时返回 null（调用方降级为纯文本卡片，不发空链接）
     */
    public String detailUrl(String baseUrl, MeetingBooking booking) {
        if (booking == null || booking.getId() == null || !StringUtils.hasText(baseUrl)) {
            return null;
        }
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime expire = booking.getEndTime() == null
                ? now.plusDays(MeetingConstants.VIEW_LINK_TTL_DAYS)
                : booking.getEndTime().plusDays(MeetingConstants.VIEW_LINK_TTL_DAYS);
        if (expire.isBefore(now.plusDays(1))) {
            expire = now.plusDays(1);
        }
        String token = MeetingViewTokenUtil.generate(booking.getId(), expire, secret());
        String base = baseUrl.trim();
        while (base.endsWith("/") || base.endsWith("#")) {
            base = base.substring(0, base.length() - 1);
        }
        // 管理后台是 HashRouter，query 必须写在 #/ 之内才会被路由识别
        return base + "/#/meeting-view?token=" + token;
    }

    /* ==================== 免登读取 ==================== */

    public MeetingBookingDto.PublicView view(String token) {
        // 读路径只读密钥：免登请求可能来自任何拿到链接的人，不能让它触发配置写入
        MeetingViewTokenUtil.Token parsed = MeetingViewTokenUtil.parse(token, readSecret());
        if (parsed == null) {
            return invalid();
        }
        MeetingBooking booking = bookingMapper.selectById(parsed.bookingId());
        if (booking == null) {
            return invalid();
        }

        LocalDateTime now = LocalDateTime.now();
        MeetingBookingDto.PublicView view = new MeetingBookingDto.PublicView();
        view.setValid(Boolean.TRUE);
        view.setBookingId(booking.getId());
        view.setBookingNo(booking.getBookingNo());
        view.setTitle(booking.getTitle());
        view.setStatus(booking.getStatus());
        view.setPhase(phase(booking, now));
        view.setStatusText(statusText(booking, now));
        view.setClosed(closed(booking, now));
        view.setStartTime(DateTimeUtils.format(booking.getStartTime()));
        view.setEndTime(DateTimeUtils.format(booking.getEndTime()));
        view.setTimeText(timeText(booking));
        view.setRoomName(booking.getRoomName());
        view.setRoomLocation(booking.getRoomLocation());
        view.setOrganizerName(booking.getOrganizerName());
        view.setDelegateForName(booking.getDelegateForName());
        view.setDescription(booking.getDescription());
        // 线上会议地址只在会议仍有效时下放：已取消的会再给入口只会把人引到空会议室
        view.setOnlineMeetingUrl(Boolean.TRUE.equals(view.getClosed()) ? null : booking.getOnlineMeetingUrl());
        view.setCancelReason(MeetingConstants.STATUS_CANCELLED.equals(booking.getStatus())
                ? booking.getCancelReason() : null);
        view.setReleaseReason(MeetingConstants.STATUS_RELEASED.equals(booking.getStatus())
                ? booking.getReleaseReason() : null);
        view.setTokenExpireAt(DateTimeUtils.format(toLocal(parsed.expireAt())));
        view.setAttendees(attendeesOf(booking));
        return view;
    }

    /* ==================== 内部 ==================== */

    /**
     * 参会人清单（只给姓名 + 身份 + 响应态）。
     *
     * <p>免登链接可被转发，联系方式与组织归属不下放；但"谁会来"是参会人最关心的信息，
     * 没有它就无法会前沟通。失效账号（离职等）不再列出。
     * <p>名单查询失败不让整页 500：会议主体仍可看，宁可少一块名单也不白屏。
     */
    private List<MeetingBookingDto.PublicAttendee> attendeesOf(MeetingBooking booking) {
        List<MeetingBookingDto.PublicAttendee> out = new ArrayList<>();
        Set<String> seen = new LinkedHashSet<>();
        try {
            for (MeetingAttendee row : attendeeMapper.findByBooking(booking.getId())) {
                if (row == null || !StringUtils.hasText(row.getName())) {
                    continue;
                }
                if (MeetingConstants.RESPOND_INVALID.equals(row.getResponse())) {
                    continue;
                }
                String name = row.getName().trim();
                String role = StringUtils.hasText(row.getAttendeeType())
                        ? row.getAttendeeType() : MeetingConstants.ATTENDEE_REQUIRED;
                if (!seen.add(role + "|" + name)) {
                    continue;
                }
                out.add(attendee(role, name, row.getResponse()));
            }
        } catch (RuntimeException e) {
            log.warn("讀取會議參會人失敗，公開頁降級為無名單: bookingId={}, error={}",
                    booking.getId(), e.getClass().getSimpleName());
        }
        // 单据快照兜底：历史数据可能存在外部参会人只在快照里、没有明细行
        if (StringUtils.hasText(booking.getExternalAttendees())) {
            for (String raw : booking.getExternalAttendees().split("[,，]")) {
                String name = raw.trim();
                if (!name.isEmpty() && seen.add(MeetingConstants.ATTENDEE_EXTERNAL + "|" + name)) {
                    out.add(attendee(MeetingConstants.ATTENDEE_EXTERNAL, name, null));
                }
            }
        }
        // 组织者必须在首位：老数据的参会人行可能没有 organizer
        boolean hasOrganizer = out.stream()
                .anyMatch(row -> MeetingConstants.ATTENDEE_ORGANIZER.equals(row.getRole()));
        if (!hasOrganizer && StringUtils.hasText(booking.getOrganizerName())) {
            out.add(0, attendee(MeetingConstants.ATTENDEE_ORGANIZER,
                    booking.getOrganizerName().trim(), MeetingConstants.RESPOND_ACCEPTED));
        }
        return out;
    }

    private static MeetingBookingDto.PublicAttendee attendee(String role, String name, String response) {
        MeetingBookingDto.PublicAttendee row = new MeetingBookingDto.PublicAttendee();
        row.setName(name);
        row.setRole(role);
        row.setRoleText(roleText(role));
        row.setResponse(StringUtils.hasText(response) ? response : null);
        row.setResponseText(responseText(response));
        return row;
    }

    private static String roleText(String role) {
        if (role == null) {
            return "參會人";
        }
        return switch (role) {
            case MeetingConstants.ATTENDEE_ORGANIZER -> "組織者";
            case MeetingConstants.ATTENDEE_OPTIONAL -> "選參";
            case MeetingConstants.ATTENDEE_EXTERNAL -> "外部人員";
            default -> "必參";
        };
    }

    private static String responseText(String response) {
        if (response == null) {
            return null;
        }
        return switch (response) {
            case MeetingConstants.RESPOND_ACCEPTED -> "已接受";
            case MeetingConstants.RESPOND_DECLINED -> "已婉拒";
            case MeetingConstants.RESPOND_PENDING -> "待響應";
            case MeetingConstants.RESPOND_INVALID -> "已失效";
            default -> null;
        };
    }

    private static MeetingBookingDto.PublicView invalid() {
        MeetingBookingDto.PublicView view = new MeetingBookingDto.PublicView();
        view.setValid(Boolean.FALSE);
        view.setClosed(Boolean.TRUE);
        view.setMessage(INVALID_TOKEN_MESSAGE);
        return view;
    }

    /** 派生展示态：终态直接取状态，占用单再与当前时间比较 */
    static String phase(MeetingBooking booking, LocalDateTime now) {
        String status = booking.getStatus();
        if (!StringUtils.hasText(status) || !MeetingConstants.OCCUPYING_STATUSES.contains(status)) {
            return status;
        }
        if (booking.getEndTime() != null && !booking.getEndTime().isAfter(now)) {
            return "ended";
        }
        return booking.getStartTime() != null && booking.getStartTime().isAfter(now) ? "pending" : "ongoing";
    }

    /** 公开页文案由服务端给：免登页不加载后台的菜单/状态词典 */
    static String statusText(MeetingBooking booking, LocalDateTime now) {
        String phase = phase(booking, now);
        return switch (phase) {
            case "pending" -> "待開始";
            case "ongoing" -> "進行中";
            case "ended" -> "已結束";
            case MeetingConstants.STATUS_CANCELLED -> "已取消";
            case MeetingConstants.STATUS_RELEASED -> "已釋放";
            case MeetingConstants.STATUS_FINISHED -> "已完成";
            default -> "已預約";
        };
    }

    /** 终态或已过结束时间：页面只能回看，不提供任何动作入口 */
    static boolean closed(MeetingBooking booking, LocalDateTime now) {
        if (!StringUtils.hasText(booking.getStatus())
                || !MeetingConstants.OCCUPYING_STATUSES.contains(booking.getStatus())) {
            return true;
        }
        return booking.getEndTime() != null && !booking.getEndTime().isAfter(now);
    }

    private static String timeText(MeetingBooking booking) {
        if (booking.getStartTime() == null || booking.getEndTime() == null) {
            return "";
        }
        String date = DateTimeUtils.format(booking.getStartTime()).substring(0, 10);
        return date + " " + hourMinute(booking.getStartTime()) + "–" + hourMinute(booking.getEndTime());
    }

    private static String hourMinute(LocalDateTime value) {
        return String.format("%02d:%02d", value.getHour(), value.getMinute());
    }

    /** 读当前密钥；未配置时返回 null（读路径不生成，避免免登请求触发配置写入） */
    private String readSecret() {
        try {
            String secret = sysConfigService.getConfigValue(MeetingConstants.CFG_VIEW_TOKEN_SECRET);
            return StringUtils.hasText(secret) ? secret : null;
        } catch (RuntimeException e) {
            log.warn("讀取會議詳情密鑰失敗: {}", e.getClass().getSimpleName());
            return null;
        }
    }

    /** 签发路径必须有密钥：未配置时生成一把并回读（与免登签到同一做法） */
    private String secret() {
        String secret = readSecret();
        return StringUtils.hasText(secret) ? secret : createSecret();
    }

    /**
     * 首次使用时生成密钥。
     *
     * <p>并发下两个实例可能各生成一把、后写的赢：先写后回读，用回读到的值签发，
     * 这样同一进程内后续校验一定与已写入的一致。
     */
    private String createSecret() {
        byte[] bytes = new byte[SECRET_BYTES];
        new SecureRandom().nextBytes(bytes);
        String generated = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        sysConfigService.updateConfig(MeetingConstants.CFG_VIEW_TOKEN_SECRET, generated);
        String stored = sysConfigService.getConfigValue(MeetingConstants.CFG_VIEW_TOKEN_SECRET);
        log.info("會議詳情密鑰已生成: usedStored={}", StringUtils.hasText(stored));
        return StringUtils.hasText(stored) ? stored : generated;
    }

    private static LocalDateTime toLocal(long epochMilli) {
        return LocalDateTime.ofInstant(Instant.ofEpochMilli(epochMilli), ZoneId.systemDefault());
    }
}
