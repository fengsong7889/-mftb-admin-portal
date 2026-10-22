package com.mftb.admin.service;

import com.mftb.admin.dto.RdmDailyReportVO.IterationNode;
import com.mftb.admin.dto.RdmDailyReportVO.MessageFieldOptions;
import com.mftb.admin.dto.RdmDailyReportVO.ProjectNode;
import com.mftb.admin.dto.RdmDailyReportVO.RequirementNode;
import com.mftb.admin.dto.RdmDailyReportVO.Snapshot;
import com.mftb.admin.dto.RdmDailyReportVO.Summary;
import com.mftb.admin.service.RdmDailyReportRenderer.PersonalView;
import com.mftb.admin.service.RdmDailyReportRenderer.Rendered;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 固定框架卡片版式渲染单测。
 *
 * <p>钉住四件事，任何一条放宽都会让消息重新变回「一坨字」：
 * <ol>
 *   <li><b>标题即结论</b>：逾期/风险计数进标题（钉钉会话列表只露 title）；</li>
 *   <li><b>只用单层列表</b>：不得出现 {@code ###}、不得出现缩进子项、不得出现需求编号——
 *       钉钉 markdown 不支持嵌套列表，缩进会被压平；</li>
 *   <li><b>做减法</b>：正常项目折叠成一行计数，0 值不占行；</li>
 *   <li><b>链接交给按钮</b>：正文不再裸出 Markdown 链接。</li>
 * </ol>
 */
class RdmDailyReportFixedRendererTest {

    private final RdmDailyReportRenderer renderer = new RdmDailyReportRenderer();

    private ProjectNode attentionProject() {
        ProjectNode p = new ProjectNode();
        p.setProjectId(1L);
        p.setProjectName("門戶改版");
        p.setProductOwnerUserName("李四");
        p.setDeliveryItemTotal(8);
        p.setDeliveryItemCompleted(3);
        p.setRemainingCount(5);
        p.setIterationActiveCount(1);
        p.setPlanStartDate("2026-09-01");
        p.setPlanEndDate("2026-12-31");
        p.setNextDeliveryDate("2026-10-22");
        p.setRiskFlag(1);
        p.setDeliveryItemOverdue(2);
        // isAttention 是聚合层写入的字段，不是按 flag 现算；测试必须显式设置
        p.setAttention(true);
        return p;
    }

    private ProjectNode normalProject() {
        ProjectNode p = new ProjectNode();
        p.setProjectId(2L);
        p.setProjectName("內部工具");
        p.setDeliveryItemTotal(4);
        p.setDeliveryItemCompleted(4);
        p.setAttention(false);
        return p;
    }

    private Snapshot snapshot() {
        Snapshot s = new Snapshot();
        s.setReportDate("2026-10-20");
        s.setReportType("morning");
        s.setReportTypeLabel("晨報");
        Summary sum = new Summary();
        sum.setProjectCount(2);
        sum.setIterationActiveCount(2);
        sum.setTodayDueItemCount(1);
        sum.setOverdueItemCount(2);
        sum.setRiskProjectCount(1);
        s.setSummary(sum);

        RequirementNode req = new RequirementNode();
        req.setReqNo("XQ202610001");
        req.setTitle("登錄改版");
        req.setStatusLabel("開發中");

        IterationNode it = new IterationNode();
        it.setIterationId(5L);
        it.setCode("SP202610001");
        it.setName("十月迭代");
        it.setStatus("active");
        it.setOwnerName("李四");
        it.setStartDate("2026-10-01");
        it.setEndDate("2026-10-31");
        it.setRequirementCount(3);
        it.setRequirements(new ArrayList<>(List.of(req)));

        ProjectNode p = attentionProject();
        p.setIterations(new ArrayList<>(List.of(it)));
        s.setProjects(new ArrayList<>(List.of(p, normalProject())));

        IterationNode unassigned = new IterationNode();
        unassigned.setIterationId(9L);
        unassigned.setCode("HF202610001");
        unassigned.setName("緊急修復");
        unassigned.setStatus("planning");
        unassigned.setOwnerName("王五");
        s.setUnassignedIterations(new ArrayList<>(List.of(unassigned)));
        return s;
    }

    @Test
    @DisplayName("标题即结论：日期 + 档位 + 逾期/风险计数，正文不重复标题")
    void titleCarriesConclusion() {
        Rendered r = renderer.renderGroupFixed(snapshot(), "https://example.com/#/rdm-daily-view?token=x",
                false, new MessageFieldOptions());

        assertTrue(r.title().contains("產研交付日報 10-20 晨報"), r.title());
        assertTrue(r.title().contains("逾期 2"), r.title());
        assertTrue(r.title().contains("風險 1"), r.title());
        assertFalse(r.content().contains("## "), "卡片正文不再重复标题，实际: " + r.content());
    }

    @Test
    @DisplayName("无逾期无风险时标题直说今日无异常，不堆 0")
    void titleSaysNoAbnormalWhenClean() {
        Snapshot s = snapshot();
        s.getSummary().setOverdueItemCount(0);
        s.getSummary().setRiskProjectCount(0);

        Rendered r = renderer.renderGroupFixed(s, "https://example.com/u", false, new MessageFieldOptions());

        assertTrue(r.title().contains("今日無異常"), r.title());
        assertFalse(r.title().contains("逾期 0"), "标题不该出现 0 值计数，实际: " + r.title());
    }

    @Test
    @DisplayName("需关注项目一行一个：不出现三级标题、缩进子项与需求编号（钉钉不支持嵌套列表）")
    void attentionProjectIsSingleLine() {
        String content = renderer.renderGroupFixed(snapshot(), "https://example.com/u", false,
                new MessageFieldOptions()).content();

        assertTrue(content.contains("- 🔴 **門戶改版**"), content);
        // 指标行与项目块之间必须有空行，否则钉钉会把两段归并成一段
        assertTrue(content.contains("**\n\n🔴 **需關注"), content);
        assertFalse(content.contains("###"), "不得使用三级标题，实际: " + content);
        assertFalse(content.contains("\n  - "), "不得出现缩进子项，实际: " + content);
        // 需求明细属于看板，不进消息
        assertFalse(content.contains("登錄改版"), content);
        assertFalse(content.contains("XQ202610001"), content);
        // 已删除的噪声：项目编号、负责人并列行
        assertFalse(content.contains("PROJ"), content);
    }

    @Test
    @DisplayName("正常项目折叠成一行计数，不逐个展开")
    void normalProjectsCollapsed() {
        String content = renderer.renderGroupFixed(snapshot(), "https://example.com/u", false,
                new MessageFieldOptions()).content();

        assertTrue(content.contains("🟢 其餘 1 個項目進展正常"), content);
        assertFalse(content.contains("內部工具"), "正常项目不应展开，实际: " + content);
    }

    @Test
    @DisplayName("指标行：逾期/风险为 0 时带 ✅，让「没有」也是信息")
    void metricsMarksZero() {
        Snapshot clean = snapshot();
        clean.getSummary().setOverdueItemCount(0);
        clean.getSummary().setRiskProjectCount(0);
        String content = renderer.renderGroupFixed(clean, "u", false, new MessageFieldOptions()).content();
        assertTrue(content.contains("✅ 逾期 0"), content);
        assertTrue(content.contains("✅ 風險 0"), content);
    }

    @Test
    @DisplayName("字段开关：只影响行内字段，不影响项目行本身与状态灯")
    void fieldTogglesOnlyChangeContent() {
        String off = renderer.renderGroupFixed(snapshot(), "u", false, new MessageFieldOptions()).content();
        assertFalse(off.contains("週期 2026-09-01~2026-12-31"), off);

        MessageFieldOptions on = new MessageFieldOptions();
        on.setProjectPeriod(true);
        on.setProjectNextDelivery(true);
        String enabled = renderer.renderGroupFixed(snapshot(), "u", false, on).content();
        assertTrue(enabled.contains("週期 2026-09-01~2026-12-31"), enabled);
        assertTrue(enabled.contains("下次交付 2026-10-22"), enabled);
        assertTrue(enabled.contains("- 🔴 **門戶改版**"), "开关不得影响项目行与状态灯，实际: " + enabled);

        MessageFieldOptions noOwner = new MessageFieldOptions();
        noOwner.setProjectProductOwner(false);
        assertFalse(renderer.renderGroupFixed(snapshot(), "u", false, noOwner).content().contains("產品 李四"));
    }

    @Test
    @DisplayName("个人卡片：只含自己负责的项目，标题点明要处理几件事")
    void personalCardOnlyMine() {
        Snapshot snapshot = snapshot();
        PersonalView personal = new PersonalView("張三",
                List.of(snapshot.getProjects().get(1)), 0, 0, 0, 0, 0, 0, 0);

        Rendered r = renderer.renderPersonalFixed(snapshot, "https://example.com/u", false, personal,
                new MessageFieldOptions());

        assertTrue(r.title().contains("今日無異常"), r.title());
        assertTrue(r.content().contains("內部工具"), r.content());
        assertFalse(r.content().contains("門戶改版"), "不得混入他人项目，实际: " + r.content());

        PersonalView urgent = new PersonalView("張三",
                List.of(snapshot.getProjects().get(0)), 0, 2, 1, 0, 0, 0, 0);
        Rendered busy = renderer.renderPersonalFixed(snapshot, "https://example.com/u", false, urgent,
                new MessageFieldOptions());
        assertTrue(busy.title().contains("你有 3 項要處理"), busy.title());
        assertTrue(busy.content().contains("今天有 3 項交付要處理"), busy.content());
    }

    @Test
    @DisplayName("无逾期无到期：给肯定结论，不输出三行 0")
    void personalQuietDayIsAffirmative() {
        Snapshot snapshot = snapshot();
        PersonalView quiet = new PersonalView("張三",
                List.of(snapshot.getProjects().get(1)), 0, 0, 0, 0, 0, 0, 0);

        String content = renderer.renderPersonalFixed(snapshot, "u", false, quiet,
                new MessageFieldOptions()).content();

        assertTrue(content.contains("今天沒有到期或逾期的交付項"), content);
        assertTrue(content.contains("✅ 今日無異常"), content);
        assertFalse(content.contains("逾期 0"), content);
        assertFalse(content.contains("今日到期 0"), content);
    }

    @Test
    @DisplayName("未挂项目迭代：加粗一行计数 + 迭代行，不用三级标题")
    void unassignedIterationsKept() {
        String content = renderer.renderGroupFixed(snapshot(), "u", false, new MessageFieldOptions()).content();

        assertTrue(content.contains("🧩 **未掛項目的迭代 1 個**"), content);
        assertTrue(content.contains("迭代 HF202610001 緊急修復"), content);
    }

    @Test
    @DisplayName("正文不再裸出 Markdown 链接；无链接时改兜底引导句")
    void linkIsCarriedByButton() {
        String withUrl = renderer.renderGroupFixed(snapshot(), "https://example.com/u", false,
                new MessageFieldOptions()).content();
        assertFalse(withUrl.contains("[查看完整日報]("), "链接交给卡片按钮，正文不再放 Markdown 链接");

        String noUrl = renderer.renderGroupFixed(snapshot(), "", false, new MessageFieldOptions()).content();
        assertTrue(noUrl.contains("打開產研交付日報可查看完整明細"), noUrl);
    }

    @Test
    @DisplayName("正文长度受控：远小于 action_card 建议的 1000 字符")
    void contentStaysWithinCardLimit() {
        String content = renderer.renderGroupFixed(snapshot(), "https://example.com/u", false,
                new MessageFieldOptions()).content();
        assertTrue(content.length() <= RdmDailyReportRenderer.CARD_CONTENT_LIMIT,
                "实际长度 " + content.length());
        assertEquals(content, content.stripTrailing());
    }
}
