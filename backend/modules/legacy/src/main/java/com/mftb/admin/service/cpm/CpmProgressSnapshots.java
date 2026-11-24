/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.service.cpm;

import com.mftb.admin.dto.CpmWorklogDto;
import com.mftb.admin.entity.CpmItem;
import com.mftb.admin.entity.CpmItemUpdate;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * 进度流水快照的唯一计算入口：台账列、进度弹层与汇报聚合共用。
 *
 * <p>进度列显示「查询周期期末的落定值」，编辑永远改当前真实值。期末取
 * {@code min(rangeEnd, today)}，避免本周/未来周期算出一个尚未发生的数字。
 *
 * <p>回退规则按序命中：期内最后一笔；期内零更新则沿用期前最后一笔；
 * 期末前从未更新则为 0；完全无流水的存量条目取当前值；无区间取当前值。
 * 快照种类同时回传前端，Tooltip 与「往期快照」是否出现不必在前端重算一遍。
 */
public final class CpmProgressSnapshots {

    public static final String LIVE = "live";
    public static final String PERIOD = "period";
    public static final String STALE = "stale";
    public static final String NOT_STARTED = "notStarted";
    public static final String LEGACY = "legacy";
    public static final String FUTURE = "future";

    private CpmProgressSnapshots() {
    }

    public record Point(LocalDate at, int progress) {
    }

    public record Snapshot(int value, String kind, LocalDate latestAt) {
    }

    public static List<Point> ofHistory(List<CpmWorklogDto.HistoryVO> history) {
        List<Point> points = new ArrayList<>();
        if (history == null) {
            return points;
        }
        for (CpmWorklogDto.HistoryVO row : history) {
            if (row.getAt() != null && !row.getAt().isBlank()) {
                points.add(new Point(LocalDate.parse(row.getAt()), value(row.getProgress())));
            }
        }
        return points;
    }

    public static List<Point> ofUpdates(List<CpmItemUpdate> trail) {
        List<Point> points = new ArrayList<>();
        if (trail == null) {
            return points;
        }
        for (CpmItemUpdate row : trail) {
            if (row.getUpdateDate() != null) {
                points.add(new Point(row.getUpdateDate(), value(row.getProgress())));
            }
        }
        return points;
    }

    /** 某日时点进度：取不晚于该日的最后一笔；无流水存量按计划开始日兜底。 */
    public static int at(List<Point> points, CpmItem item, LocalDate date) {
        Point hit = latestAtOrBefore(points, date);
        if (hit != null) {
            return hit.progress();
        }
        if (!points.isEmpty()) {
            return 0;
        }
        if (item.getPlanStart() != null && date.isBefore(item.getPlanStart())) {
            return 0;
        }
        return value(item.getProgress());
    }

    /**
     * 查询周期快照。latestAt 是全部流水的最新日期，供前端判断「往期快照」是否冗余：
     * 最新一笔就在被查看周期内时不再重复展示快照卡。
     */
    public static Snapshot snapshot(List<Point> points, CpmItem item,
                                    LocalDate from, LocalDate to, LocalDate today) {
        LocalDate latestAt = points.stream().map(Point::at).max(LocalDate::compareTo).orElse(null);
        if (to == null) {
            return new Snapshot(value(item.getProgress()), LIVE, latestAt);
        }
        if (to.isAfter(today)) {
            return new Snapshot(value(item.getProgress()), FUTURE, latestAt);
        }
        if (points.isEmpty()) {
            return new Snapshot(value(item.getProgress()), LEGACY, latestAt);
        }
        Point hit = latestAtOrBefore(points, to);
        if (hit == null) {
            return new Snapshot(0, NOT_STARTED, latestAt);
        }
        String kind = from != null && hit.at().isBefore(from) ? STALE : PERIOD;
        return new Snapshot(hit.progress(), kind, latestAt);
    }

    private static Point latestAtOrBefore(List<Point> points, LocalDate date) {
        Point hit = null;
        for (Point point : points) {
            if (!point.at().isAfter(date) && (hit == null || !point.at().isBefore(hit.at()))) {
                hit = point;
            }
        }
        return hit;
    }

    private static int value(Integer value) {
        return value == null ? 0 : value;
    }
}
