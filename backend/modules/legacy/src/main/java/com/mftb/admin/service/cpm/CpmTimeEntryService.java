/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.service.cpm;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.CpmConstants;
import com.mftb.admin.dto.CpmDto;
import com.mftb.admin.entity.CpmItem;
import com.mftb.admin.entity.CpmTimeEntry;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.CpmItemMapper;
import com.mftb.admin.mapper.CpmTimeEntryMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;

/**
 * 投入时段服务（阶段三）。
 *
 * <p>三条硬口径：
 * 1. 归属一律取登录人，表单没有身份字段位置；改/删都走「id + user_id」同一条 WHERE，
 *    与条目主表同一个 IDOR 防线——时段挂在条目上，只校验条目属主而让时段本体裸奔，
 *    等于留了一条「拿到别人 segment id 就能改别人工时」的后门。
 * 2. {@code durationMinutes} 由服务端算出后<b>固化落库</b>，允许显式覆盖但不允许查询时二次计算；
 *    否则同一行在不同查询里给出不同工时，统计就变成了随读法变化的东西。
 * 3. 任何一次写入后都回算条目缓存（work_hours / work_hours_source / first_start_at / last_end_at），
 *    缓存与明细不一致的报表比没有报表更糟——界面会把「同一个事实」给出两个数字。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CpmTimeEntryService {

    /** 手工工时换算小时：DECIMAL(4,1) 口径，与时段合计取同一精度，避免两套小数位 */
    private static final int HOUR_SCALE = 1;

    private final CpmTimeEntryMapper timeMapper;
    private final CpmItemMapper itemMapper;
    private final CpmAccessGuard guard;
    private final CpmPeriods periods;

    /* ==================== 读 ==================== */

    /** 某条目全部时段（条目详情/编辑页用；仍限本人，与更新同一条守卫）。 */
    public List<CpmDto.TimeEntryVO> listByItem(long itemId) {
        SysUser current = guard.currentUser();
        CpmItem item = guard.requireOwnedItem(itemId, current);
        return toVOList(timeMapper.listByItem(item.getId()));
    }

    /** 某人某天全部时段（日视图随条目一次性带回，避免逐条目 N+1）。 */
    public List<CpmTimeEntry> listOnDate(long userId, LocalDate date) {
        return timeMapper.listByUserAndRange(userId, date, date);
    }

    /* ==================== 写 ==================== */

    @Transactional(rollbackFor = Exception.class)
    public CpmDto.TimeEntryVO create(long itemId, CpmDto.TimeEntryForm form) {
        SysUser current = guard.currentUser();
        // 先锁父行再写子行：顺序固定成「父 → 子」才不会与并发写同一父行的事务互咬（见 mapper 注释）
        CpmItem item = guard.requireOwnedItemForUpdate(itemId, current);
        LocalDate workDate = resolveWorkDate(form.getWorkDate());
        int minutes = resolveMinutes(form);
        LocalTime start = parseClock(form.getStartTime(), "開始時間");
        LocalTime end = parseClock(form.getEndTime(), "結束時間");
        boolean crosses = Boolean.TRUE.equals(form.getCrossesMidnight());
        validateRange(start, end, crosses, minutes);

        if (timeMapper.countOnItemDate(item.getId(), workDate) >= CpmConstants.TIME_ENTRIES_PER_ITEM_DAY_MAX) {
            // 上限防的是「一秒一段」把工时刷成噪音；正常一天不会超过 20 段
            throw new BusinessException("單日單條記錄最多 " + CpmConstants.TIME_ENTRIES_PER_ITEM_DAY_MAX + " 段投入時間");
        }

        CpmTimeEntry row = new CpmTimeEntry();
        row.setItemId(item.getId());
        row.setUserId(current.getId());
        row.setWorkDate(workDate);
        row.setStartTime(start);
        row.setEndTime(end);
        row.setCrossesMidnight(crosses ? 1 : 0);
        row.setDurationMinutes(minutes);
        row.setNote(trimOrNull(form.getNote(), CpmConstants.TIME_NOTE_MAX));
        row.setVersion(0);
        row.setDeleted(0);
        // 审计列显式落值：全局 MetaObjectHandler 只填时间，留 NULL 会撞 created_by NOT NULL
        row.setCreatedBy(current.getName());
        row.setUpdatedBy(current.getName());
        timeMapper.insert(row);
        recomputeItemCache(item, current.getName());
        return toVO(row);
    }

    @Transactional(rollbackFor = Exception.class)
    public CpmDto.TimeEntryVO update(long id, CpmDto.TimeEntryForm form) {
        SysUser current = guard.currentUser();
        CpmTimeEntry existing = requireOwnedSegment(id, current);
        // 读子行只取快照（不加锁），拿到 itemId 后立刻锁父行：
        // 若等到 UPDATE 子行之后再锁父行，就与 create 的「父 → 子」顺序相反，两者并发照样死锁。
        CpmItem item = guard.requireOwnedItemForUpdate(existing.getItemId(), current);
        LocalDate workDate = resolveWorkDate(form.getWorkDate());
        int minutes = resolveMinutes(form);
        LocalTime start = parseClock(form.getStartTime(), "開始時間");
        LocalTime end = parseClock(form.getEndTime(), "結束時間");
        boolean crosses = Boolean.TRUE.equals(form.getCrossesMidnight());
        validateRange(start, end, crosses, minutes);

        int version = form.getVersion() == null ? existing.getVersion() : form.getVersion();
        int affected = timeMapper.updateOwned(id, current.getId(), version, workDate, start, end,
                crosses ? 1 : 0, minutes, trimOrNull(form.getNote(), CpmConstants.TIME_NOTE_MAX), current.getName());
        if (affected == 0) {
            throw new BusinessException("該時段已被更新，請刷新後重試");
        }
        recomputeItemCache(item, current.getName());
        return toVO(timeMapper.selectById(id));
    }

    @Transactional(rollbackFor = Exception.class)
    public void delete(long id) {
        SysUser current = guard.currentUser();
        CpmTimeEntry existing = requireOwnedSegment(id, current);
        CpmItem item = guard.requireOwnedItemForUpdate(existing.getItemId(), current);
        if (timeMapper.softDeleteOwned(id, current.getId(), current.getName()) == 0) {
            throw new BusinessException("該時段已被更新，請刷新後重試");
        }
        recomputeItemCache(item, current.getName());
    }

    /* ==================== 缓存回算 ==================== */

    /**
     * 条目工时缓存回算：时段合计优先，无时段才退回手工值并标 manual。
     *
     * <p>为什么保留「无时段即沿用手工工时」而不是强制迁移：阶段二的行内工时 chips 已经产生了一批
     * 只有小时数的存量记录，把它们当成 0 会让历史汇报的总投入突然缩水；
     * 但两者必须靠 {@code work_hours_source} 区分开，否则统计口径就是把估算说成精确。
     */
    void recomputeItemCache(CpmItem item, String operator) {
        List<CpmTimeEntry> segments = timeMapper.listByItem(item.getId());
        int totalMinutes = segments.stream().mapToInt(CpmTimeEntry::getDurationMinutes).sum();
        LocalDateTime firstStart = segments.isEmpty() ? null : timeMapper.firstStartOf(item.getId());
        LocalDateTime lastEnd = segments.isEmpty() ? null : timeMapper.lastEndOf(item.getId());
        if (totalMinutes > 0) {
            BigDecimal hours = BigDecimal.valueOf(totalMinutes)
                    .divide(BigDecimal.valueOf(60), HOUR_SCALE, RoundingMode.HALF_UP);
            itemMapper.syncTimeCache(item.getId(), item.getUserId(), hours, "segment", firstStart, lastEnd, operator);
            return;
        }
        // 时段清空：手工列仍保留原值（那是用户自己填的，不能被系统抹掉），只是来源退回 manual
        itemMapper.syncTimeCache(item.getId(), item.getUserId(), item.getWorkHours(), "manual", null, null, operator);
    }

    /* ==================== 校验与换算 ==================== */

    /** 时段本体的资源属主校验：segment 的 user_id 必须就是登录人（冗余列正是为此而存在）。 */
    private CpmTimeEntry requireOwnedSegment(long id, SysUser current) {
        CpmTimeEntry row = timeMapper.selectById(id);
        if (row == null || Integer.valueOf(1).equals(row.getDeleted())) {
            throw new BusinessException("投入時段不存在或已被刪除");
        }
        if (!Long.valueOf(current.getId()).equals(row.getUserId())) {
            throw new BusinessException("只能操作自己的投入時段");
        }
        return row;
    }

    private LocalDate resolveWorkDate(String dateStr) {
        LocalDate today = periods.today();
        if (!StringUtils.hasText(dateStr)) {
            return today;
        }
        LocalDate date;
        try {
            date = LocalDate.parse(dateStr.trim());
        } catch (java.time.format.DateTimeParseException e) {
            throw new BusinessException("日期格式應為 yyyy-MM-dd");
        }
        // 投入是已经发生的事实：给未来记一段工时，等于允许预先领工时
        if (date.isAfter(today)) {
            throw new BusinessException("投入日期不能晚於今天");
        }
        return date;
    }

    /** 'HH:mm' / 'HH:mm:ss' 都收，秒一律截掉：列是 TIME，但界面的输入框不该逼用户填秒。 */
    private LocalTime parseClock(String value, String label) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        String text = value.trim();
        String[] parts = text.split(":");
        if (parts.length < 2) {
            throw new BusinessException(label + "格式應為 HH:mm");
        }
        try {
            return LocalTime.of(Integer.parseInt(parts[0].trim()), Integer.parseInt(parts[1].trim()));
        } catch (RuntimeException e) {
            throw new BusinessException(label + "格式應為 HH:mm");
        }
    }

    /**
     * 耗时取值：显式覆盖优先，否则由起止算。
     *
     * <p>跨夜必须显式声明而不是「end &lt; start 就 +24h」自动推断——「09:00 → 09:00」既可能是
     * 0 分钟也可能是 24 小时，猜错就是凭空多记一整天。
     */
    private int resolveMinutes(CpmDto.TimeEntryForm form) {
        Integer manual = form.getDurationMinutes();
        if (manual != null) {
            if (manual <= 0 || manual > CpmConstants.MAX_DURATION_MINUTES) {
                throw new BusinessException("耗時需在 1 ~ " + CpmConstants.MAX_DURATION_MINUTES + " 分鐘之間");
            }
            return manual;
        }
        LocalTime start = parseClock(form.getStartTime(), "開始時間");
        LocalTime end = parseClock(form.getEndTime(), "結束時間");
        if (start == null || end == null) {
            throw new BusinessException("請填寫起止時間或耗時分鐘數");
        }
        int delta = end.getMinute() - start.getMinute() + (end.getHour() - start.getHour()) * 60;
        if (delta < 0) {
            delta += Boolean.TRUE.equals(form.getCrossesMidnight()) ? CpmConstants.MAX_DURATION_MINUTES : 0;
        }
        if (delta <= 0) {
            throw new BusinessException("結束時間必須晚於開始時間（跨夜請勾選「跨夜」）");
        }
        if (delta > CpmConstants.MAX_DURATION_MINUTES) {
            throw new BusinessException("單段投入不能超過 " + CpmConstants.MAX_DURATION_MINUTES + " 分鐘");
        }
        return delta;
    }

    private void validateRange(LocalTime start, LocalTime end, boolean crosses, int minutes) {
        if ((start == null) != (end == null)) {
            // 与 ck_cpm_time_range 同一条约束在前端先拦住：省一次无谓的 500，但防线仍在 DDL
            throw new BusinessException("開始與結束時間需同時填寫或同時留空");
        }
        if (start == null && crosses) {
            throw new BusinessException("未填起止時間時無需標記跨夜");
        }
        if (start != null && end != null && !end.isBefore(start) && crosses) {
            // 顺序正常的区间标了跨夜 = 时长会比区间本身长出一整天，宁可拒绝也不写一个说不清的事实
            throw new BusinessException("結束時間晚於開始時間時不應標記跨夜");
        }
        if (minutes <= 0) {
            throw new BusinessException("耗時必須大於 0 分鐘");
        }
    }

    /* ==================== 映射 ==================== */

    List<CpmDto.TimeEntryVO> toVOList(List<CpmTimeEntry> rows) {
        List<CpmDto.TimeEntryVO> list = new ArrayList<>(rows.size());
        rows.forEach(row -> list.add(toVO(row)));
        return list;
    }

    CpmDto.TimeEntryVO toVO(CpmTimeEntry row) {
        CpmDto.TimeEntryVO vo = new CpmDto.TimeEntryVO();
        vo.setId(row.getId());
        vo.setItemId(row.getItemId());
        vo.setWorkDate(row.getWorkDate() == null ? null : row.getWorkDate().toString());
        vo.setStartTime(clock(row.getStartTime()));
        vo.setEndTime(clock(row.getEndTime()));
        vo.setCrossesMidnight(Integer.valueOf(1).equals(row.getCrossesMidnight()));
        vo.setDurationMinutes(row.getDurationMinutes());
        vo.setNote(row.getNote());
        vo.setVersion(row.getVersion());
        return vo;
    }

    /** 界面只要 HH:mm：秒是本域的展示噪音，列宽虽是 TIME，输出统一截到分钟。 */
    private static String clock(LocalTime time) {
        return time == null ? null : String.format("%02d:%02d", time.getHour(), time.getMinute());
    }

    private static String trimOrNull(String value, int max) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        if (trimmed.isEmpty()) {
            return null;
        }
        if (trimmed.length() > max) {
            throw new BusinessException("內容超過長度上限 " + max);
        }
        return trimmed;
    }
}
