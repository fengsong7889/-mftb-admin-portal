package com.mftb.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.MeetingConstants;
import com.mftb.admin.dto.MeetingConfigDto;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.MeetingBlacklist;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.MeetingBlacklistMapper;
import com.mftb.admin.mapper.MeetingBookingMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.util.DateTimeUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * 预约黑名单（爽约治理）与预约准入守卫。
 *
 * <p>三件容易写错、这里钉死的事：
 * <ol>
 *   <li><b>判定与展示同一个 SQL 口径</b>：是否生效一律看 {@code status='active' AND end_date>=今天}，
 *       不由每日 Job 把行翻成 expired。Job 漏跑一次就让人永久被误锁，而"到期自动解除"
 *       本来就是日期语义，不需要再复制一份状态；</li>
 *   <li><b>只有未签到被释放算爽约</b>：主动取消与提前结束都不是，混算会把常改安排的人误锁；</li>
 *   <li><b>手动释放不触发自动拉黑</b>：行政帮人腾房间不该变成对该人的处分。</li>
 * </ol>
 *
 * <p>阈值 {@code meeting_no_show_threshold=0} 时完全不做自动拉黑（只保留人工通道），
 * 这是"公司是否要自动处分人"的开关，不该由代码替行政决定。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class MeetingBlacklistService {

    /** 自动拉黑阈值兜底：sys_config 缺键时按"不自动拉黑"处理，宁可漏管也不误锁真人 */
    private static final int DEFAULT_THRESHOLD_OFF = 0;
    private static final int DEFAULT_BLACKLIST_DAYS = 7;

    private final MeetingBlacklistMapper blacklistMapper;
    private final MeetingBookingMapper bookingMapper;
    private final SysUserMapper userMapper;
    private final SysConfigService sysConfigService;
    private final MeetingAccessGuard guard;

    /* ==================== 预约准入守卫 ==================== */

    /**
     * 预约写入前的准入检查：命中生效中的限制直接拒绝，并明确告知解除时间。
     *
     * <p>fail-closed：判定只看数据库，绝不因为"配置读不到"而放行。
     */
    public void assertNotBlacklisted(SysUser user) {
        if (user == null) {
            return;
        }
        assertNotBlacklisted(user.getId(), "您");
    }

    /**
     * 按用户 id 判定，并允许指定提示里的主体称谓。
     *
     * <p>代订场景必须有这一层：行政替一位被限制的人订会时，如果仍说"您已被暫停預約"，
     * 操作人会觉得莫名其妙（他自己没被限制），而被限制的人照样被拦住了——文案指错人
     * 会让人以为系统出错，进而去找行政手工放行，等于把守卫自己削弱掉。
     */
    public void assertNotBlacklisted(Long userId, String subjectLabel) {
        if (userId == null) {
            return;
        }
        MeetingBlacklist active = findEffective(userId);
        if (active == null) {
            return;
        }
        String who = subjectLabel == null || subjectLabel.isBlank() ? "您" : subjectLabel;
        throw new BusinessException(who + "已被暫停預約：「" + active.getReason() + "」，解除日期 "
                + DateTimeUtils.format(active.getEndDate()));
    }

    /** 当前生效的限制记录（无则 null）；列表页与预约页共用同一判定，不各写一套日期比较 */
    public MeetingBlacklist findEffective(long userId) {
        return blacklistMapper.findActiveByUser(userId);
    }

    /* ==================== 自动拉黑 ==================== */

    /**
     * 爽约达阈值时自动登记限制。
     *
     * @return true 表示本次新增了限制
     */
    @Transactional(rollbackFor = Exception.class)
    public boolean evaluateAutoBlacklist(Long organizerId) {
        if (organizerId == null) {
            return false;
        }
        int threshold = configInt(MeetingConstants.CFG_NO_SHOW_THRESHOLD, DEFAULT_THRESHOLD_OFF);
        if (threshold <= 0) {
            return false;
        }
        LocalDateTime since = LocalDateTime.now().minusDays(MeetingConstants.NO_SHOW_WINDOW_DAYS);
        int noShows = bookingMapper.countNoShowSince(organizerId, since);
        if (noShows < threshold) {
            return false;
        }
        if (findEffective(organizerId) != null) {
            // 已在限制期内就不叠加天数：同一行为重复处罚会让"3 次"变成"永远"
            return false;
        }
        SysUser user = userMapper.selectById(organizerId);
        if (user == null) {
            log.warn("爽約自動拉黑跳過：帳號不存在 userId={}", organizerId);
            return false;
        }
        int days = configInt(MeetingConstants.CFG_BLACKLIST_DAYS, DEFAULT_BLACKLIST_DAYS);
        LocalDate today = LocalDate.now();
        MeetingBlacklist row = new MeetingBlacklist();
        row.setUserId(organizerId);
        row.setEmpNo(Objects.toString(user.getEmpId(), ""));
        row.setName(StringUtils.hasText(user.getName()) ? user.getName() : user.getUsername());
        row.setDepartmentName(Objects.toString(user.getDepartment(), ""));
        row.setReason("近 " + MeetingConstants.NO_SHOW_WINDOW_DAYS + " 天未簽到釋放 " + noShows
                + " 次，系統自動暫停預約權限 " + days + " 天");
        row.setSource(MeetingConstants.BLACKLIST_SOURCE_AUTO);
        row.setNoShowCount(noShows);
        row.setStartDate(today);
        row.setEndDate(today.plusDays(Math.max(1, days)));
        row.setStatus(MeetingConstants.BLACKLIST_ACTIVE);
        row.setCreatedBy(MeetingConstants.OPERATOR_SYSTEM);
        row.setUpdatedBy(MeetingConstants.OPERATOR_SYSTEM);
        row.setVersion(0);
        try {
            blacklistMapper.insert(row);
        } catch (org.springframework.dao.DuplicateKeyException e) {
            // 并发下两个释放 Job 分片同时判定同一个人：唯一键兜住，第二次什么都不做
            log.info("爽約自動拉黑已存在生效記錄，跳过重復登记: userId={}", organizerId);
            return false;
        }
        log.warn("用戶因爽約被自動暫停預約: userId={}, noShow={}, days={}", organizerId, noShows, days);
        return true;
    }

    /* ==================== 清单与维护 ==================== */

    /** 清单 + 同口径统计卡 */
    public MeetingConfigDto.BlacklistPage list(MeetingConfigDto.BlacklistQuery query) {
        guard.requireRecordManager(guard.currentUser());
        MeetingConfigDto.BlacklistPage result = new MeetingConfigDto.BlacklistPage();
        Page<MeetingBlacklist> page = new Page<>(
                PageResult.normalizePage(query.getPage() == null ? 1 : query.getPage()),
                PageResult.normalizeSize(query.getSize() == null ? 20 : query.getSize()));
        Page<MeetingBlacklist> paged = blacklistMapper.selectPage(page, buildWrapper(query));
        List<MeetingConfigDto.BlacklistVO> records = paged.getRecords().stream().map(this::toVO).toList();
        result.setPage(new PageResult<>(records, paged.getTotal()));
        result.setStats(buildStats(query));
        return result;
    }

    /** 手动加入限制 */
    @Transactional(rollbackFor = Exception.class)
    public long add(MeetingConfigDto.BlacklistForm form) {
        SysUser operator = guard.currentUser();
        guard.requireRecordManager(operator);
        if (form.getUserId() == null || form.getUserId() <= 0) {
            throw new BusinessException("請選擇被限制人員");
        }
        SysUser target = userMapper.selectById(form.getUserId());
        if (target == null) {
            throw new BusinessException("該人員不存在");
        }
        if (blacklistMapper.countActiveByUser(form.getUserId()) > 0) {
            throw new BusinessException(target.getName() + " 目前已在限制期內，請先撤銷原有記錄");
        }
        int days = form.getDays() == null || form.getDays() <= 0 ? DEFAULT_BLACKLIST_DAYS : form.getDays();
        LocalDate today = LocalDate.now();
        MeetingBlacklist row = new MeetingBlacklist();
        row.setUserId(target.getId());
        row.setEmpNo(Objects.toString(target.getEmpId(), ""));
        row.setName(StringUtils.hasText(target.getName()) ? target.getName() : target.getUsername());
        row.setDepartmentName(Objects.toString(target.getDepartment(), ""));
        row.setReason(form.getReason().trim());
        row.setSource(MeetingConstants.BLACKLIST_SOURCE_ADMIN);
        row.setNoShowCount(0);
        row.setStartDate(today);
        row.setEndDate(today.plusDays(days));
        row.setStatus(MeetingConstants.BLACKLIST_ACTIVE);
        row.setCreatedBy(operator.getName());
        row.setUpdatedBy(operator.getName());
        row.setVersion(0);
        try {
            blacklistMapper.insert(row);
        } catch (org.springframework.dao.DuplicateKeyException e) {
            throw new BusinessException("該人員已被限制，請刷新後重試");
        }
        return row.getId();
    }

    /** 撤销限制：留行不留状态，删行等于毁掉处置记录 */
    @Transactional(rollbackFor = Exception.class)
    public void revoke(long id, MeetingConfigDto.RevokeForm form) {
        SysUser operator = guard.currentUser();
        guard.requireRecordManager(operator);
        MeetingBlacklist row = blacklistMapper.selectById(id);
        if (row == null) {
            throw new BusinessException("限制記錄不存在");
        }
        if (!MeetingConstants.BLACKLIST_ACTIVE.equals(row.getStatus())) {
            throw new BusinessException("該記錄已撤銷，無需重複操作");
        }
        if (blacklistMapper.update(null, new LambdaUpdateWrapper<MeetingBlacklist>()
                .eq(MeetingBlacklist::getId, id)
                .eq(MeetingBlacklist::getVersion, requireVersion(form.getVersion()))
                .eq(MeetingBlacklist::getStatus, MeetingConstants.BLACKLIST_ACTIVE)
                .set(MeetingBlacklist::getStatus, MeetingConstants.BLACKLIST_REVOKED)
                .set(MeetingBlacklist::getRevokedBy, operator.getId())
                .set(MeetingBlacklist::getRevokedAt, LocalDateTime.now())
                .set(MeetingBlacklist::getRevokeReason, form.getReason().trim())
                .set(MeetingBlacklist::getUpdatedBy, operator.getName())
                .setSql("version = version + 1")) == 0) {
            throw new BusinessException("該記錄已被他人修改，請刷新後重試");
        }
    }

    /* ==================== 内部 ==================== */

    private LambdaQueryWrapper<MeetingBlacklist> buildWrapper(MeetingConfigDto.BlacklistQuery query) {
        LambdaQueryWrapper<MeetingBlacklist> wrapper = new LambdaQueryWrapper<>();
        if (StringUtils.hasText(query.getKeyword())) {
            String kw = query.getKeyword().trim();
            wrapper.and(w -> w.like(MeetingBlacklist::getName, kw).or().like(MeetingBlacklist::getEmpNo, kw));
        }
        if (query.getUserId() != null) {
            wrapper.eq(MeetingBlacklist::getUserId, query.getUserId());
        }
        if (StringUtils.hasText(query.getSource())) {
            wrapper.eq(MeetingBlacklist::getSource, query.getSource().trim());
        }
        if (StringUtils.hasText(query.getStatus())) {
            String status = query.getStatus().trim();
            if (MeetingConstants.BLACKLIST_ACTIVE.equals(status)) {
                // 生效中必须同时看日期：只按 status 过滤会把已过期的行也算成"生效中"，
                // 于是清单显示一堆在限制的人，预约接口却照样放行
                wrapper.eq(MeetingBlacklist::getStatus, status).ge(MeetingBlacklist::getEndDate, LocalDate.now());
            } else if ("expired".equals(status)) {
                wrapper.eq(MeetingBlacklist::getStatus, MeetingConstants.BLACKLIST_ACTIVE)
                        .lt(MeetingBlacklist::getEndDate, LocalDate.now());
            } else {
                wrapper.eq(MeetingBlacklist::getStatus, status);
            }
        }
        wrapper.orderByDesc(MeetingBlacklist::getStartDate).orderByDesc(MeetingBlacklist::getId);
        return wrapper;
    }

    private MeetingConfigDto.BlacklistStats buildStats(MeetingConfigDto.BlacklistQuery query) {
        String keyword = StringUtils.hasText(query.getKeyword())
                ? "%" + query.getKeyword().trim() + "%" : null;
        Map<String, Object> row = blacklistMapper.countByState(keyword, query.getUserId(),
                StringUtils.hasText(query.getSource()) ? query.getSource().trim() : null);
        MeetingConfigDto.BlacklistStats stats = new MeetingConfigDto.BlacklistStats();
        stats.setTotal(asLong(row, "total"));
        stats.setEffective(asLong(row, "effective"));
        stats.setExpired(asLong(row, "expired"));
        stats.setRevoked(asLong(row, "revoked"));
        return stats;
    }

    private MeetingConfigDto.BlacklistVO toVO(MeetingBlacklist row) {
        MeetingConfigDto.BlacklistVO vo = new MeetingConfigDto.BlacklistVO();
        vo.setId(row.getId());
        vo.setUserId(row.getUserId());
        vo.setEmpNo(row.getEmpNo());
        vo.setName(row.getName());
        vo.setDepartmentName(row.getDepartmentName());
        vo.setReason(row.getReason());
        vo.setSource(row.getSource());
        vo.setNoShowCount(row.getNoShowCount());
        vo.setStartDate(DateTimeUtils.format(row.getStartDate()));
        vo.setEndDate(DateTimeUtils.format(row.getEndDate()));
        vo.setStatus(row.getStatus());
        vo.setRevokeReason(row.getRevokeReason());
        vo.setRevokedAt(DateTimeUtils.format(row.getRevokedAt()));
        vo.setVersion(row.getVersion());
        vo.setCreatedBy(row.getCreatedBy());
        vo.setCreatedAt(DateTimeUtils.format(row.getCreatedAt()));
        LocalDate today = LocalDate.now();
        boolean active = MeetingConstants.BLACKLIST_ACTIVE.equals(row.getStatus());
        if (active && row.getEndDate() != null && row.getEndDate().isBefore(today)) {
            vo.setDisplayState("expired");
        } else if (active) {
            vo.setDisplayState("effective");
            vo.setRemainingDays((int) (row.getEndDate().toEpochDay() - today.toEpochDay()) + 1);
        } else {
            vo.setDisplayState("revoked");
        }
        if (row.getRevokedBy() != null) {
            SysUser revoker = userMapper.selectById(row.getRevokedBy());
            vo.setRevokedByName(revoker == null ? "-" : StringUtils.hasText(revoker.getName())
                    ? revoker.getName() : revoker.getUsername());
        }
        return vo;
    }

    private int configInt(String key, int fallback) {
        String raw = sysConfigService.getConfigValue(key);
        if (!StringUtils.hasText(raw)) {
            return fallback;
        }
        try {
            return Math.max(0, Integer.parseInt(raw.trim()));
        } catch (NumberFormatException e) {
            log.warn("会議配置 {} 值非數字「{}」，按兜底值 {} 处理", key, raw, fallback);
            return fallback;
        }
    }

    private static int requireVersion(Integer version) {
        if (version == null) {
            throw new BusinessException("缺少版本號，請刷新後重試");
        }
        return version;
    }

    private static long asLong(Map<String, Object> row, String key) {
        Object value = row == null ? null : row.get(key);
        return value instanceof Number number ? number.longValue() : 0L;
    }
}
