package com.mftb.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.MeetingConstants;
import com.mftb.admin.dto.MeetingBookingDto;
import com.mftb.admin.dto.MeetingCheckinDto;
import com.mftb.admin.entity.MeetingAttendee;
import com.mftb.admin.entity.MeetingBooking;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.MeetingAttendeeMapper;
import com.mftb.admin.mapper.MeetingBookingMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.util.CheckinTokenUtil;
import com.mftb.admin.util.DateTimeUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.security.SecureRandom;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Base64;
import java.util.List;
import java.util.Objects;

/**
 * 会议签到免登页（扫码直达，无 JWT）。
 *
 * <p>安全边界与 {@code EamSignPageController} 同一套：令牌是 HMAC 签名的三元组
 * {@code bookingId.userId.expireAt}，会议结束后 2 小时自动失效。三件事由结构保证，不靠约定：
 * <ul>
 *   <li><b>令牌绑人</b>：只绑会议的令牌等于任何拿到链接的人都能替别人签到，出席记录失去证据价值；</li>
 *   <li><b>名单仍要查库</b>：令牌只证明"谁在何时之前"，是否真是参会人由本服务查参会人表判定，
 *       否则伪造一个签名正确的令牌就能签到任意会议；</li>
 *   <li><b>响应里不出现敏感字段</b>：免登页暴露在安全白名单里，参会人名单/议程/关联需求一律不回，
 *       只回令牌绑定者自己的那一行信息。</li>
 * </ul>
 *
 * <p>失败响应对"签名错/过期/不是参会人/会议不存在"统一给同一句提示：区分它们等于让攻击者
 * 用错误码枚举有效令牌。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class MeetingCheckinService {

    /** 免登页对无效令牌的统一文案（不暴露无效原因） */
    private static final String INVALID_TOKEN_MESSAGE = "簽到連結無效或已過期，請在會議詳情頁重新生成";
    private static final int SECRET_BYTES = 32;

    private final MeetingBookingMapper bookingMapper;
    private final MeetingAttendeeMapper attendeeMapper;
    private final SysUserMapper userMapper;
    private final MeetingBookingService bookingService;
    private final MeetingAccessGuard guard;
    private final NotificationAppService appService;
    private final SysConfigService sysConfigService;

    /* ==================== 登录后签发 ==================== */

    /**
     * 为当前登录人签发本场会议的签到令牌。
     *
     * <p>只有参会人（含组织者本人）能领到自己的令牌；不给"看别人会议的人"签发，
     * 否则一个能看详情的人就能构造出替别人签到的链接。
     */
    public MeetingCheckinDto.TokenIssued issueOwnToken(long bookingId) {
        SysUser current = guard.currentUser();
        MeetingBooking booking = requireBooking(bookingId);
        guard.requireBookingReadable(booking, current);
        MeetingAttendee mine = findRow(bookingId, current.getId());
        if (mine == null) {
            throw new BusinessException("您不在該會議的參會名單中，無法生成簽到碼");
        }
        String token = CheckinTokenUtil.generate(bookingId, current.getId(), booking.getEndTime(), secret());
        MeetingCheckinDto.TokenIssued issued = new MeetingCheckinDto.TokenIssued();
        issued.setToken(token);
        issued.setBookingId(bookingId);
        issued.setExpireAt(DateTimeUtils.format(toLocal(
                CheckinTokenUtil.parse(token, secret()).expireAt())));
        issued.setUrl(checkinUrl(token));
        return issued;
    }

    /* ==================== 免登页 ==================== */

    /** 免登页读取：只给"我是谁、这场会是什么、现在能不能签" */
    public MeetingCheckinDto.PublicView view(String token) {
        CheckinTokenUtil.Token parsed = parseOrNull(token);
        if (parsed == null) {
            return invalid();
        }
        MeetingBooking booking = bookingMapper.selectById(parsed.bookingId());
        if (booking == null) {
            return invalid();
        }
        MeetingAttendee mine = findRow(booking.getId(), parsed.userId());
        if (mine == null) {
            // 令牌签名有效但人已不在名单里（被移出会议）：不给会议信息，只给统一失效提示
            return invalid();
        }
        SysUser user = userMapper.selectById(parsed.userId());
        MeetingBookingDto.VO state = safeState(booking, mine, user);

        MeetingCheckinDto.PublicView view = new MeetingCheckinDto.PublicView();
        view.setValid(Boolean.TRUE);
        view.setBookingId(booking.getId());
        view.setBookingNo(booking.getBookingNo());
        view.setTitle(booking.getTitle());
        view.setStartTime(DateTimeUtils.format(booking.getStartTime()));
        view.setEndTime(DateTimeUtils.format(booking.getEndTime()));
        view.setRoomName(booking.getRoomName());
        view.setRoomLocation(booking.getRoomLocation());
        view.setOrganizerName(booking.getOrganizerName());
        view.setMyName(mine.getName());
        view.setMyEmpNo(mine.getEmpNo());
        view.setMyRole(mine.getAttendeeType());
        view.setCheckedIn(mine.getCheckinAt() != null);
        view.setCheckinAt(DateTimeUtils.format(mine.getCheckinAt()));
        view.setTokenExpireAt(DateTimeUtils.format(toLocal(parsed.expireAt())));
        if (state != null) {
            view.setCheckinOpenAt(state.getCheckinOpenAt());
            view.setCheckinDeadlineAt(state.getCheckinDeadlineAt());
            view.setCanCheckin(Boolean.TRUE.equals(state.getCanCheckin()));
        } else {
            view.setCanCheckin(false);
        }
        return view;
    }

    /**
     * 免登签到：验令牌 → 查名单 → 以令牌绑定的那个人完成签到。
     *
     * <p>不在这里重复实现窗口与状态推进，直接调 {@code checkinAs}：签到语义若有两份实现，
     * 迟早出现"扫码能补签、页面不能"或反过来。
     */
    public MeetingCheckinDto.PublicView sign(String token) {
        CheckinTokenUtil.Token parsed = parseOrNull(token);
        if (parsed == null) {
            return invalid();
        }
        MeetingAttendee mine = findRow(parsed.bookingId(), parsed.userId());
        if (mine == null) {
            throw new BusinessException(INVALID_TOKEN_MESSAGE);
        }
        SysUser user = userMapper.selectById(parsed.userId());
        if (user == null || user.getStatus() == null || user.getStatus() != 1) {
            throw new BusinessException("該帳號已停用，無法簽到，請聯系組織者");
        }
        try {
            bookingService.checkinAs(parsed.bookingId(), user);
        } catch (BusinessException e) {
            // 业务性拒绝（未到签到时间/已结束/已释放）必须原样给文案：免登页拿它决定按钮状态，
            // 换成统一"链接无效"会让人反复重新扫码，而真实原因是"还没到时间"
            MeetingCheckinDto.PublicView view = view(token);
            view.setMessage(e.getMessage());
            return view;
        }
        return view(token);
    }

    /* ==================== 内部 ==================== */

    /**
     * 复用会议服务的视图口径判断"现在能不能签"。
     *
     * <p>这里故意不抛异常：免登页要能展示一场已结束的会议（只读，按钮置灰），
     * 而 {@code guard.currentUser()} 在无登录态时为 null，走常规 detail 会直接被拦。
     */
    private MeetingBookingDto.VO safeState(MeetingBooking booking, MeetingAttendee mine, SysUser user) {
        if (user == null) {
            return null;
        }
        try {
            return bookingService.stateForCheckin(booking.getId(), user);
        } catch (BusinessException e) {
            log.info("免登簽到頁讀取會議狀態失敗: bookingId={}, reason={}", booking.getId(), e.getMessage());
            return null;
        }
    }

    private CheckinTokenUtil.Token parseOrNull(String token) {
        if (!StringUtils.hasText(token)) {
            return null;
        }
        return CheckinTokenUtil.parse(token.trim(), secretOrNull());
    }

    private static MeetingCheckinDto.PublicView invalid() {
        MeetingCheckinDto.PublicView view = new MeetingCheckinDto.PublicView();
        view.setValid(Boolean.FALSE);
        view.setMessage(INVALID_TOKEN_MESSAGE);
        view.setCanCheckin(false);
        view.setCheckedIn(false);
        return view;
    }

    private MeetingAttendee findRow(long bookingId, long userId) {
        return attendeeMapper.selectOne(new LambdaQueryWrapper<MeetingAttendee>()
                .eq(MeetingAttendee::getBookingId, bookingId)
                .eq(MeetingAttendee::getUserId, userId)
                .last("LIMIT 1"));
    }

    private MeetingBooking requireBooking(long id) {
        MeetingBooking booking = bookingMapper.selectById(id);
        if (booking == null) {
            throw new BusinessException("會議記錄不存在或已刪除");
        }
        return booking;
    }

    /** 签到链接：优先用通知场景里配置的企业站点，没配就返回 null 由前端用自己的 origin 兜底 */
    private String checkinUrl(String token) {
        for (String scenario : List.of(MeetingConstants.SCENARIO_INVITE, MeetingConstants.SCENARIO_OPS)) {
            NotificationAppService.Credentials app = appService.resolve(scenario);
            if (app != null && StringUtils.hasText(app.getBaseUrl())) {
                String base = app.getBaseUrl().trim();
                while (base.endsWith("/") || base.endsWith("#")) {
                    base = base.substring(0, base.length() - 1);
                }
                return base + "/#/meeting-checkin?token=" + token;
            }
        }
        return null;
    }

    /** 当前生效密钥；读不到时抛错而不是临时生成一把内存密钥：那会让签发与校验落在不同实例上必然失败 */
    private String secret() {
        String secret = secretOrNull();
        if (!StringUtils.hasText(secret)) {
            throw new BusinessException("簽到密鑰未配置，請聯繫管理員啟用會議簽到功能");
        }
        return secret;
    }

    private String secretOrNull() {
        try {
            String secret = sysConfigValue(MeetingConstants.CFG_CHECKIN_TOKEN_SECRET);
            if (StringUtils.hasText(secret)) {
                return secret;
            }
            return createSecret();
        } catch (RuntimeException e) {
            log.warn("讀取會議簽到密鑰失敗: {}", e.getClass().getSimpleName());
            return null;
        }
    }

    /**
     * 首次使用时生成密钥。
     *
     * <p>并发下两个实例可能各生成一把、后写的赢：先写后回读，用回读到的值签发，
     * 这样同一进程内后续校验一定与已写入的一致（极端情况下早先签出的令牌失效，用户重新打开页面即可）。
     */
    private String createSecret() {
        byte[] bytes = new byte[SECRET_BYTES];
        new SecureRandom().nextBytes(bytes);
        String generated = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        saveConfig(MeetingConstants.CFG_CHECKIN_TOKEN_SECRET, generated);
        String stored = sysConfigValue(MeetingConstants.CFG_CHECKIN_TOKEN_SECRET);
        log.info("會議簽到密鑰已生成: usedStored={}", StringUtils.hasText(stored));
        return StringUtils.hasText(stored) ? stored : generated;
    }

    private static LocalDateTime toLocal(long epochMilli) {
        return LocalDateTime.ofInstant(Instant.ofEpochMilli(epochMilli), ZoneId.systemDefault());
    }

    /** sys_config 读写：{@code updateConfig} 自带 UPSERT 与并发冲突回退，不再自己拼 SQL */
    private String sysConfigValue(String key) {
        return sysConfigService.getConfigValue(key);
    }

    private void saveConfig(String key, String value) {
        sysConfigService.updateConfig(key, value);
    }
}
