/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.service.cpm;

import com.mftb.admin.constant.CpmConstants;
import com.mftb.admin.entity.CpmItem;
import com.mftb.admin.entity.CpmItemUpdate;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 台账工作端口径与备注净化的口径单测。
 *
 * <p>这三段逻辑决定了汇报里的每一个数字和导出/推送里出现的每一段富文本，
 * 所以钉的是口径而不是装配：跨周末/节假日不计工时、補班例外计入、区间只算交集、
 * 期初/期末只引用已发生的流水、危险 HTML 在入库前就被剥掉。
 */
class CpmWorklogLedgerTest {

    private static final LocalDate MON = LocalDate.of(2026, 11, 16);

    private static CpmWorkdays.Ledger ledger(Map<LocalDate, String> types) {
        return new CpmWorkdays.Ledger(types);
    }

    @Test
    @DisplayName("整周只数 5 个工作日，周末自动剔除")
    void weekCountsFiveWorkdays() {
        CpmWorkdays.Ledger calendar = ledger(Map.of());
        assertThat(calendar.workdays(MON, MON.plusDays(6))).isEqualTo(5);
        assertThat(calendar.hours(MON, MON.plusDays(6))).isEqualTo(5 * CpmConstants.WORKLOG_HOURS_PER_DAY);
    }

    @Test
    @DisplayName("节假日/调休/请假都扣工时，补班把周末算进来")
    void dayTypesDriveHours() {
        assertThat(ledger(Map.of(MON.plusDays(2), CpmConstants.DAY_TYPE_HOLIDAY))
                .workdays(MON, MON.plusDays(6))).isEqualTo(4);
        assertThat(ledger(Map.of(
                MON.plusDays(1), CpmConstants.DAY_TYPE_COMP_OFF,
                MON.plusDays(2), CpmConstants.DAY_TYPE_LEAVE))
                .workdays(MON, MON.plusDays(6))).isEqualTo(3);
        assertThat(ledger(Map.of(MON.plusDays(6), CpmConstants.DAY_TYPE_MAKEUP))
                .workdays(MON, MON.plusDays(6))).isEqualTo(6);
    }

    @Test
    @DisplayName("起止倒挂与空区间给 0 而不是负数")
    void invalidRangeGivesZero() {
        CpmWorkdays.Ledger calendar = ledger(Map.of());
        assertThat(calendar.workdays(MON.plusDays(3), MON)).isZero();
        assertThat(calendar.workdays(null, MON)).isZero();
        assertThat(calendar.hours(null, null)).isZero();
    }

    @Test
    @DisplayName("区间工时只算交集工作日：跨月任务不把整段记进本期")
    void periodHoursUsesIntersection() {
        LocalDate taskStart = LocalDate.of(2026, 11, 20);
        LocalDate taskEnd = LocalDate.of(2026, 12, 5);
        CpmWorkdays.Ledger calendar = ledger(Map.of(LocalDate.of(2026, 12, 1), CpmConstants.DAY_TYPE_HOLIDAY));
        // 交集 11/23~11/27 = 5 个工作日；整段 11/20、11/23~27、11/30、12/02~04 = 10 个工作日
        assertThat(calendar.hoursInPeriod(taskStart, taskEnd, LocalDate.of(2026, 11, 23), LocalDate.of(2026, 11, 29)))
                .isEqualTo(5 * CpmConstants.WORKLOG_HOURS_PER_DAY);
        assertThat(calendar.hours(taskStart, taskEnd))
                .isEqualTo(10 * CpmConstants.WORKLOG_HOURS_PER_DAY);
    }

    @Test
    @DisplayName("期初/期末取流水最后一笔，不跟着当前值漂移")
    void progressUsesTrailSnapshot() {
        CpmItem item = new CpmItem();
        item.setProgress(80);
        item.setPlanStart(MON);
        item.setPlanEnd(MON.plusDays(4));
        List<CpmItemUpdate> trail = List.of(trail(MON, 0), trail(MON.plusDays(2), 40));
        assertThat(CpmWorklogReportService.progressAt(trail, item, MON)).isZero();
        assertThat(CpmWorklogReportService.progressAt(trail, item, MON.plusDays(2))).isEqualTo(40);
        // 当前值 80 没有对应流水就不进历史某天，否则汇报的「本期推进」是编出来的
        assertThat(CpmWorklogReportService.progressAt(trail, item, MON.plusDays(6))).isEqualTo(40);
    }

    @Test
    @DisplayName("无流水的存量条目：开始前 0，之后取当前值，不编造期初")
    void legacyItemFallsBack() {
        CpmItem item = new CpmItem();
        item.setProgress(60);
        item.setPlanStart(MON);
        item.setPlanEnd(MON.plusDays(4));
        assertThat(CpmWorklogReportService.progressAt(List.of(), item, MON.minusDays(1))).isZero();
        assertThat(CpmWorklogReportService.progressAt(List.of(), item, MON.plusDays(1))).isEqualTo(60);
    }

    @Test
    @DisplayName("完成时点取流水首次 ≥100；没流水如实取计划止日")
    void doneAtPrefersTrail() {
        CpmItem done = new CpmItem();
        done.setProgress(100);
        done.setPlanStart(MON);
        done.setPlanEnd(MON.plusDays(4));
        assertThat(CpmWorklogReportService.doneAt(List.of(trail(MON, 0), trail(MON.plusDays(2), 100)), done))
                .isEqualTo(MON.plusDays(2).toString());
        assertThat(CpmWorklogReportService.doneAt(List.of(), done)).isEqualTo(MON.plusDays(4).toString());
        done.setProgress(99);
        assertThat(CpmWorklogReportService.doneAt(List.of(), done)).isNull();
    }

    @Test
    @DisplayName("备注净化：排版标签留下，script/style/事件属性连内容一起丢弃")
    void noteSanitizerKeepsOnlyLayoutTags() {
        assertThat(CpmNoteHtml.sanitize("<b>粗</b><i>斜</i>")).isEqualTo("<b>粗</b><i>斜</i>");
        assertThat(CpmNoteHtml.sanitize("<h1>標題</h1>")).isEqualTo("標題");
        assertThat(CpmNoteHtml.sanitize("<script>alert(1)</script>安全")).isEqualTo("安全");
        assertThat(CpmNoteHtml.sanitize("<iframe src=\"https://evil\"></iframe>正文")).isEqualTo("正文");
        assertThat(CpmNoteHtml.sanitize("<span onclick=\"alert(1)\">文字</span>")).isEqualTo("<span>文字</span>");
        assertThat(CpmNoteHtml.sanitize("<span style=\"color:red;position:absolute\">文字</span>"))
                .isEqualTo("<span style=\"color:red\">文字</span>");
        assertThat(CpmNoteHtml.sanitize("<span style=\"background:url(javascript:1)\">文字</span>"))
                .isEqualTo("<span>文字</span>");
        assertThat(CpmNoteHtml.sanitize("<font color=\"#00f\">藍</font>")).isEqualTo("<span style=\"color:#00f\">藍</span>");
        assertThat(CpmNoteHtml.sanitize("<img src=\"x\" onerror=\"alert(1)\">")).isEmpty();
    }

    @Test
    @DisplayName("纯文本降级：搜索/导出/推送拿到的是页面读到的那句话")
    void plainTextFallbackMatchesWhatUserReads() {
        assertThat(CpmNoteHtml.toPlainText("1，需求已上線。\n2，等待驗收。")).isEqualTo("1，需求已上線。\n2，等待驗收。");
        assertThat(CpmNoteHtml.toPlainText("<div>第一段</div><div>第二段</div>")).isEqualTo("第一段\n第二段");
        assertThat(CpmNoteHtml.toPlainText("第一行<br>第二行")).isEqualTo("第一行\n第二行");
        assertThat(CpmNoteHtml.toPlainText("<b>加粗</b>與<span style=\"color:red\">紅色</span>")).isEqualTo("加粗與紅色");
        assertThat(CpmNoteHtml.toPlainText("<script>alert(1)</script>安全")).isEqualTo("安全");
    }

    private static CpmItemUpdate trail(LocalDate date, int progress) {
        CpmItemUpdate row = new CpmItemUpdate();
        row.setUpdateDate(date);
        row.setProgress(progress);
        return row;
    }
}
