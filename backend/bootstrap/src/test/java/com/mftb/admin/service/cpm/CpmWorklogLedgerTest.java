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
import com.mftb.admin.constant.MeetingConstants;
import com.mftb.admin.dto.CpmWorklogDto;
import com.mftb.admin.entity.CpmItem;
import com.mftb.admin.entity.CpmItemUpdate;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.CpmItemMapper;
import com.mftb.admin.mapper.CpmItemUpdateMapper;
import com.mftb.admin.mapper.CpmWorkCalendarMapper;
import com.mftb.admin.mapper.CpmWorklogGroupMapper;
import com.mftb.admin.service.MeetingActionSource;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

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
        // 列表/标题/引用/分割线与前端 noteRich.ts 白名单同形；hr 自闭合不带闭标签
        assertThat(CpmNoteHtml.sanitize("<ol><li>一</li><li>二</li></ol>")).isEqualTo("<ol><li>一</li><li>二</li></ol>");
        assertThat(CpmNoteHtml.sanitize("<ul><li>甲</li></ul>")).isEqualTo("<ul><li>甲</li></ul>");
        assertThat(CpmNoteHtml.sanitize("<h2>標題</h2><h3>小標</h3>")).isEqualTo("<h2>標題</h2><h3>小標</h3>");
        assertThat(CpmNoteHtml.sanitize("<blockquote>引文</blockquote>")).isEqualTo("<blockquote>引文</blockquote>");
        assertThat(CpmNoteHtml.sanitize("上<hr>下")).isEqualTo("上<hr>下");
        assertThat(CpmNoteHtml.sanitize("<h1>大標</h1>")).isEqualTo("大標");
        // fontName 产出的带引号 font-family（含 &quot; 实体形态）剥引号后回写，不截断 style 属性
        assertThat(CpmNoteHtml.sanitize("<span style=\"font-family:&quot;Microsoft YaHei&quot;\">字</span>"))
                .isEqualTo("<span style=\"font-family:Microsoft YaHei\">字</span>");
    }

    @Test
    @DisplayName("纯文本降级：搜索/导出/推送拿到的是页面读到的那句话")
    void plainTextFallbackMatchesWhatUserReads() {
        assertThat(CpmNoteHtml.toPlainText("1，需求已上線。\n2，等待驗收。")).isEqualTo("1，需求已上線。\n2，等待驗收。");
        assertThat(CpmNoteHtml.toPlainText("<div>第一段</div><div>第二段</div>")).isEqualTo("第一段\n第二段");
        assertThat(CpmNoteHtml.toPlainText("第一行<br>第二行")).isEqualTo("第一行\n第二行");
        assertThat(CpmNoteHtml.toPlainText("<b>加粗</b>與<span style=\"color:red\">紅色</span>")).isEqualTo("加粗與紅色");
        assertThat(CpmNoteHtml.toPlainText("<script>alert(1)</script>安全")).isEqualTo("安全");
        assertThat(CpmNoteHtml.toPlainText("<ol><li>一</li><li>二</li></ol>")).isEqualTo("一\n二");
        assertThat(CpmNoteHtml.toPlainText("<h2>標題</h2><p>正文</p>")).isEqualTo("標題\n正文");
        assertThat(CpmNoteHtml.toPlainText("上<hr>下")).isEqualTo("上\n下");
    }

    @Test
    @DisplayName("耗时口径：只有 source=manual 的正数才算手改覆盖，段合计不抢计划工时")
    void manualHoursOverrideOnlyForManualSource() {
        CpmItem auto = new CpmItem();
        auto.setWorkHours(null);
        assertThat(CpmWorklogService.manualHoursOf(auto)).isNull();

        CpmItem manual = new CpmItem();
        manual.setWorkHours(new java.math.BigDecimal("3.0"));
        manual.setWorkHoursSource(CpmConstants.WORKLOG_HOURS_SOURCE_MANUAL);
        assertThat(CpmWorklogService.manualHoursOf(manual)).isEqualByComparingTo("3.0");

        // 记时时段回算写的是同一列但标 source=segment：它是「实际量了多少」，
        // 不能拿来当台账计划工时的覆盖值，否则一补时间就把计划口径顶掉
        CpmItem segment = new CpmItem();
        segment.setWorkHours(new java.math.BigDecimal("1.5"));
        segment.setWorkHoursSource(CpmConstants.WORKLOG_HOURS_SOURCE_SEGMENT);
        assertThat(CpmWorklogService.manualHoursOf(segment)).isNull();

        // 0 不是「估了零小时」而是「没估」，留着它会让汇报算出 0h 的本期投入
        CpmItem zero = new CpmItem();
        zero.setWorkHours(java.math.BigDecimal.ZERO);
        zero.setWorkHoursSource(CpmConstants.WORKLOG_HOURS_SOURCE_MANUAL);
        assertThat(CpmWorklogService.manualHoursOf(zero)).isNull();
    }

    @Test
    @DisplayName("已取消只认 cancelled/released：开完的会仍然可以导入与汇报")
    void nonDeliverableStatuses() {
        assertThat(MeetingConstants.isNonDeliverable(MeetingConstants.STATUS_CANCELLED)).isTrue();
        assertThat(MeetingConstants.isNonDeliverable(MeetingConstants.STATUS_RELEASED)).isTrue();
        assertThat(MeetingConstants.isNonDeliverable(MeetingConstants.STATUS_BOOKED)).isFalse();
        assertThat(MeetingConstants.isNonDeliverable(MeetingConstants.STATUS_CHECKED_IN)).isFalse();
        assertThat(MeetingConstants.isNonDeliverable(MeetingConstants.STATUS_FINISHED)).isFalse();
    }

    @Test
    @DisplayName("导入会议是新来源：没进 CHECK 白名单就会界面导得出、写库报错")
    void meetingIsARegisteredSource() {
        assertThat(CpmConstants.SOURCE_TYPES).contains(CpmConstants.SOURCE_MEETING);
        // 会议本体与行动项必须是两个取值：同一个值会让唯一键把两种导入判成一件事
        assertThat(CpmConstants.SOURCE_MEETING).isNotEqualTo(CpmConstants.SOURCE_MEETING_ACTION);
    }

    @Test
    @DisplayName("周期快照 R1–R5：期内取最后一笔、期前沿用、从未更新给 0、存量取当前、未来截断")
    void periodSnapshotRules() {
        LocalDate today = MON.plusDays(20);
        CpmItem item = new CpmItem();
        item.setProgress(80);
        item.setPlanStart(MON);
        item.setPlanEnd(MON.plusDays(18));
        List<CpmProgressSnapshots.Point> points = List.of(
                new CpmProgressSnapshots.Point(MON, 25),
                new CpmProgressSnapshots.Point(MON.plusDays(8), 50),
                new CpmProgressSnapshots.Point(MON.plusDays(15), 80)
        );

        assertThat(CpmProgressSnapshots.snapshot(points, item, MON, MON.plusDays(6), today))
                .isEqualTo(new CpmProgressSnapshots.Snapshot(25, CpmProgressSnapshots.PERIOD, MON.plusDays(15)));
        assertThat(CpmProgressSnapshots.snapshot(points, item, MON.plusDays(7), MON.plusDays(13), today))
                .isEqualTo(new CpmProgressSnapshots.Snapshot(50, CpmProgressSnapshots.PERIOD, MON.plusDays(15)));
        assertThat(CpmProgressSnapshots.snapshot(points, item, MON.plusDays(14), MON.plusDays(20), today))
                .isEqualTo(new CpmProgressSnapshots.Snapshot(80, CpmProgressSnapshots.PERIOD, MON.plusDays(15)));
        // 本期一次都没更新：沿用期前最后一笔，不编 0%
        assertThat(CpmProgressSnapshots.snapshot(points, item, MON.plusDays(9), MON.plusDays(14), today))
                .isEqualTo(new CpmProgressSnapshots.Snapshot(50, CpmProgressSnapshots.STALE, MON.plusDays(15)));
        // 期末早于首笔流水：该期尚未开始
        assertThat(CpmProgressSnapshots.snapshot(points, item, MON.minusDays(6), MON.minusDays(1), today))
                .isEqualTo(new CpmProgressSnapshots.Snapshot(0, CpmProgressSnapshots.NOT_STARTED, MON.plusDays(15)));
        // 存量无流水：取当前真实值，不把「没记录」谎报成「没开始」
        assertThat(CpmProgressSnapshots.snapshot(List.of(), item, MON, MON.plusDays(6), today))
                .isEqualTo(new CpmProgressSnapshots.Snapshot(80, CpmProgressSnapshots.LEGACY, null));
        assertThat(CpmProgressSnapshots.snapshot(points, item, null, null, today))
                .isEqualTo(new CpmProgressSnapshots.Snapshot(80, CpmProgressSnapshots.LIVE, MON.plusDays(15)));
        // 未来档：不能算出一个尚未发生的期末值
        assertThat(CpmProgressSnapshots.snapshot(points, item, MON.plusDays(21), MON.plusDays(27), today))
                .isEqualTo(new CpmProgressSnapshots.Snapshot(80, CpmProgressSnapshots.FUTURE, MON.plusDays(15)));
    }

    @Test
    @DisplayName("工时上限与加班拆分：工作日 × 24h、列宽 999 截断、加班由合计减正常额度派生")
    void hoursCapAndOvertimeSplit() {
        assertThat(CpmWorkdays.hoursCap(2)).isEqualTo(48);
        assertThat(CpmWorkdays.hoursCap(0)).isEqualTo(24);
        assertThat(CpmWorkdays.hoursCap(100)).isEqualTo(CpmConstants.WORKLOG_HOURS_MAX);
        assertThat(CpmWorkdays.normalHoursOf(20, 2)).isEqualTo(16);
        assertThat(CpmWorkdays.overtimeHoursOf(20, 2)).isEqualTo(4);
        assertThat(CpmWorkdays.overtimeHoursOf(3, 2)).isZero();
        assertThat(CpmWorkdays.overtimeHoursOf(0, 0)).isZero();
    }

    @Test
    @DisplayName("手工工时超上限由服务端拒写：前端校验不是安全边界")
    void manualHoursOverCapRejected() {
        CpmWorklogService service = newLedgerService();

        CpmWorklogDto.TaskForm form = new CpmWorklogDto.TaskForm();
        form.setTitle("加班超限");
        form.setStart(MON.toString());
        // 11-16 周一到 11-18 周三共 3 个工作日，上限 72h；73 必须被服务端拒绝
        form.setEnd(MON.plusDays(2).toString());
        form.setHours(new BigDecimal("73"));

        assertThatThrownBy(() -> service.createTask(form))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("耗時超出上限");
    }

    /**
     * 未分组虚拟容器（id=0）的写入口径：改名/删除/恢复一律报「只读容器」，
     * 而不是汇进「工作項不存在或不属于本人」——生产上用户对着界面渲染出来的
     * 虚拟分组行点删除，只能看到一句无法自解释的「不存在」。
     */
    @Test
    @DisplayName("虚拟分组 id=0 不可改名/删除/恢复，报错说清只读容器")
    void virtualGroupIsReadOnly() {
        CpmWorklogService service = newLedgerService();
        CpmWorklogDto.GroupForm form = new CpmWorklogDto.GroupForm();
        form.setTitle("给未分组改名");

        assertThatThrownBy(() -> service.updateGroup(CpmWorklogService.UNGROUPED_ID, form))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("只讀容器");
        assertThatThrownBy(() -> service.deleteGroup(CpmWorklogService.UNGROUPED_ID))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("只讀容器");
        assertThatThrownBy(() -> service.restoreGroup(CpmWorklogService.UNGROUPED_ID))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("只讀容器");
    }

    /** 全套 mock 装配：归属取登录人，日历/周期给固定值，只验服务层口径 */
    private static CpmWorklogService newLedgerService() {
        CpmWorklogGroupMapper groupMapper = mock(CpmWorklogGroupMapper.class);
        CpmItemMapper itemMapper = mock(CpmItemMapper.class);
        CpmItemUpdateMapper updateMapper = mock(CpmItemUpdateMapper.class);
        CpmWorkCalendarMapper calendarMapper = mock(CpmWorkCalendarMapper.class);
        CpmWorkdays workdays = mock(CpmWorkdays.class);
        CpmAccessGuard guard = mock(CpmAccessGuard.class);
        CpmPeriods periods = mock(CpmPeriods.class);
        MeetingActionSource meetingActions = mock(MeetingActionSource.class);
        SysUser current = new SysUser();
        current.setId(7L);
        current.setUsername("tester");
        current.setName("測試者");
        when(guard.currentUser()).thenReturn(current);
        when(periods.today()).thenReturn(MON);
        when(workdays.load(anyLong(), any(), any())).thenReturn(new CpmWorkdays.Ledger(Map.of()));
        return new CpmWorklogService(
                groupMapper, itemMapper, updateMapper, calendarMapper, workdays, guard, periods, meetingActions);
    }

    private static CpmItemUpdate trail(LocalDate date, int progress) {
        CpmItemUpdate row = new CpmItemUpdate();
        row.setUpdateDate(date);
        row.setProgress(progress);
        return row;
    }
}
