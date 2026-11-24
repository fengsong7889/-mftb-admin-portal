/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.service.cpm;

import com.mftb.admin.constant.CpmConstants;
import com.mftb.admin.entity.CpmWorkCalendar;
import com.mftb.admin.mapper.CpmWorkCalendarMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.DayOfWeek;
import java.time.LocalDate;

/**
 * 工作日判定与工时折算（台账/汇报/导出的唯一口径）。
 *
 * <p>规则只有一条，但必须只有一个地方写：周末默认休，{@code makeup}（周末上班）例外计入；
 * {@code holiday}/{@code comp_off}/{@code leave} 一律扣减。耗时 = 区间内工作日数 × 8h。
 * 用户明确要求「跨周末、节假日不算时间」，所以这不是可配置项而是口径本身。
 *
 * <p>日历一次读回、按天判定：一次台账读取要算几十条任务的工时，
 * 每条任务再查一次库就是 N+1 请求风暴（首页请求风暴同教训）。
 */
@Service
@RequiredArgsConstructor
public class CpmWorkdays {

    private final CpmWorkCalendarMapper calendarMapper;

    /**
     * 一次读取的日历快照：一天只对应一个生效类型。
     *
     * <p>用 Map 而不是四个 Set：同一日期既可能在全局法定名单里（节假日），又可能
     * 被本人标成补班上班；四个独立集合会同时回答「算」和「不算」，而生效类型只能有一个。
     */
    public record Ledger(java.util.Map<LocalDate, String> types) {

        public String typeOf(LocalDate date) {
            return date == null ? null : types.get(date);
        }

        public boolean isRestDay(LocalDate date) {
            String type = typeOf(date);
            if (type != null) {
                // 四类里只有補班计入；未知类型（历史脏数据）退回周历判定，不拿它扣人工时
                return CpmConstants.DAY_TYPES.contains(type) && !CpmConstants.dayTypeCountsAsWork(type);
            }
            return date.getDayOfWeek() == DayOfWeek.SATURDAY || date.getDayOfWeek() == DayOfWeek.SUNDAY;
        }

        /** 闭区间内工作日数；起止倒挂返回 0 而不是负数（负工时会在报表里长出一个不可能的数字） */
        public int workdays(LocalDate start, LocalDate end) {
            if (start == null || end == null || end.isBefore(start)) {
                return 0;
            }
            int count = 0;
            for (LocalDate cur = start; !cur.isAfter(end); cur = cur.plusDays(1)) {
                if (!isRestDay(cur)) {
                    count++;
                }
            }
            return count;
        }

        /** 整段任务的总工时（小时） */
        public int hours(LocalDate start, LocalDate end) {
            return workdays(start, end) * CpmConstants.WORKLOG_HOURS_PER_DAY;
        }

        /**
         * 区间内投入工时 = 交集工作日 × 8h。
         *
         * <p>跨周/跨月任务在「本周」这一档只能算落在本周的那几天——
         * 把整段总工时记进本期会让周报虚高，也让同一任务在周/月两档给出同一个数字，
         * 用户就无法从汇报里看出「这周实际投了多少」。
         */
        public int hoursInPeriod(LocalDate taskStart, LocalDate taskEnd, LocalDate periodStart, LocalDate periodEnd) {
            if (taskStart == null || taskEnd == null) {
                return 0;
            }
            LocalDate from = taskStart.isAfter(periodStart) ? taskStart : periodStart;
            LocalDate to = taskEnd.isBefore(periodEnd) ? taskEnd : periodEnd;
            return hours(from, to);
        }

        /** 按类型拆出的名单（给前端日历渲染；同一个日期只会落在其中一个里） */
        public java.util.List<String> datesOfType(String dayType, LocalDate start, LocalDate end) {
            return types.entrySet().stream()
                    .filter(e -> dayType.equals(e.getValue()))
                    .filter(e -> !e.getKey().isBefore(start) && !e.getKey().isAfter(end))
                    .map(e -> e.getKey().toString())
                    .sorted()
                    .toList();
        }
    }

    /**
     * 读取某人在给定区间生效的日历快照：全局法定名单先入，本人名单同日覆盖。
     *
     * <p>只取本人那张会漏掉法定假日，只取全局那张会让个人调休/请假失效——都是半个真源。
     * 区间上限由 WORKLOG_RANGE_MAX_DAYS 兜住：这张表小，但一次读全表会把行数直接压进内存。
     */
    public Ledger load(long userId, LocalDate start, LocalDate end) {
        java.util.Map<LocalDate, String> types = new java.util.LinkedHashMap<>();
        if (start == null || end == null || end.isBefore(start)) {
            return new Ledger(types);
        }
        LocalDate to = start.plusDays(CpmConstants.WORKLOG_RANGE_MAX_DAYS).isBefore(end)
                ? start.plusDays(CpmConstants.WORKLOG_RANGE_MAX_DAYS) : end;
        java.util.Map<LocalDate, String> global = new java.util.HashMap<>();
        java.util.Map<LocalDate, String> personal = new java.util.HashMap<>();
        // 一次查库分桶再合并：为了「本人覆盖全局」而查两次，就是在台账读取里多埋一次往返
        for (CpmWorkCalendar row : calendarMapper.listRange(userId, start, to)) {
            String type = row.getDayType() == null ? "" : row.getDayType();
            if (!CpmConstants.DAY_TYPES.contains(type) || row.getWorkDate() == null) {
                continue;
            }
            if (row.getUserId() != null && row.getUserId() == CpmWorkCalendar.GLOBAL_USER) {
                global.put(row.getWorkDate(), type);
            } else {
                personal.put(row.getWorkDate(), type);
            }
        }
        types.putAll(global);
        types.putAll(personal);
        return new Ledger(types);
    }
}
