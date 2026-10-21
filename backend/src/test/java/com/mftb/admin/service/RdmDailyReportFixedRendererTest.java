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

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 固定框架消息渲染单测。
 *
 * <p>钉住三件事：
 * <ol>
 *   <li><b>层级固定</b>：汇总行 → 项目 → 迭代 → 未挂项目迭代 → 引导链接；需求明细不进群消息；</li>
 *   <li><b>字段开关只调内容</b>：关掉产品负责人/交付进度后对应对应文字消失，但项目与迭代仍存在；</li>
 *   <li><b>链接只给一句话</b>：正文不裸展 URL，只输出 Markdown 链接文字。</li>
 * </ol>
 */
class RdmDailyReportFixedRendererTest {

    private final RdmDailyReportRenderer renderer = new RdmDailyReportRenderer();

    private Snapshot snapshot() {
        Snapshot s = new Snapshot();
        s.setReportDate("2026-10-20");
        s.setReportType("morning");
        s.setReportTypeLabel("晨報");
        Summary sum = new Summary();
        sum.setProjectCount(1);
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
        it.setOverdueReqCount(2);
        it.setTodayDueReqCount(1);
        it.setRequirements(new ArrayList<>(List.of(req)));

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
        p.setIterations(new ArrayList<>(List.of(it)));
        s.setProjects(new ArrayList<>(List.of(p)));

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
    @DisplayName("群报固定框架：汇总→项目→迭代→未挂迭代→链接，需求明细不进消息")
    void groupFixedHierarchy() {
        Rendered r = renderer.renderGroupFixed(snapshot(), "https://example.com/#/rdm-daily-view?token=x",
                false, new MessageFieldOptions());

        String content = r.content();
        assertTrue(content.contains("在途項目 1"));
        assertTrue(content.contains("迭代 2"));
        assertTrue(content.contains("### 門戶改版"));
        assertTrue(content.contains("產品 李四"));
        assertTrue(content.contains("交付 3/8（38%）"));
        assertTrue(content.contains("迭代 SP202610001 十月迭代（進行中｜李四）"));
        assertTrue(content.contains("### 未掛項目的迭代（1 個）"));
        assertTrue(content.contains("迭代 HF202610001 緊急修復（規劃中｜王五）"));
        assertTrue(content.contains("[查看完整日報](https://example.com/#/rdm-daily-view?token=x)"));
        // 需求明细属于看板，不进群消息
        assertFalse(content.contains("登錄改版"));
        assertFalse(content.contains("XQ202610001"));
    }

    @Test
    @DisplayName("字段开关：项目周期/迭代需求数默认关，勾选后才出现")
    void fieldTogglesOnlyChangeContent() {
        MessageFieldOptions defaults = new MessageFieldOptions();
        String off = renderer.renderGroupFixed(snapshot(), "u", false, defaults).content();
        assertFalse(off.contains("週期 2026-09-01~2026-12-31"));
        assertFalse(off.contains("需求 3"));

        MessageFieldOptions on = new MessageFieldOptions();
        on.setProjectPeriod(true);
        on.setIterationReqTotal(true);
        on.setIterationReqTodayDue(true);
        on.setIterationReqOverdue(true);
        String enabled = renderer.renderGroupFixed(snapshot(), "u", false, on).content();
        assertTrue(enabled.contains("週期 2026-09-01~2026-12-31"));
        assertTrue(enabled.contains("需求 3"));
        assertTrue(enabled.contains("今日到期 1"));
        assertTrue(enabled.contains("逾期 2"));
        // 框架本身不变
        assertTrue(enabled.contains("### 門戶改版"));
        assertTrue(enabled.contains("迭代 SP202610001"));
    }

    @Test
    @DisplayName("迭代进度/产能开关：开启后带百分比，关闭后消失；未设产能不输出占位符")
    void iterationProgressToggle() {
        Snapshot s = snapshot();
        IterationNode it = s.getProjects().get(0).getIterations().get(0);
        it.setProgressPercent(56);
        it.setCapacityHours(80);
        it.setCapacityUsagePercent(30);

        String on = renderer.renderGroupFixed(s, "u", false, new MessageFieldOptions()).content();
        assertTrue(on.contains("進度 56%"));
        assertTrue(on.contains("產能 30%"));

        MessageFieldOptions off = new MessageFieldOptions();
        off.setIterationProgress(false);
        String disabled = renderer.renderGroupFixed(s, "u", false, off).content();
        assertFalse(disabled.contains("進度 56%"));
        assertFalse(disabled.contains("產能 30%"));
        assertTrue(disabled.contains("迭代 SP202610001"), "关字段不能影响迭代行本身");
    }

    @Test
    @DisplayName("关闭产品负责人/交付进度后，项目与迭代仍保留，只是字段消失")
    void hidesOptionalFieldsButKeepsHierarchy() {
        MessageFieldOptions f = new MessageFieldOptions();
        f.setProjectProductOwner(false);
        f.setProjectDeliveryProgress(false);
        f.setProjectIterationCount(false);

        String content = renderer.renderGroupFixed(snapshot(), "u", false, f).content();
        assertFalse(content.contains("產品 李四"));
        assertFalse(content.contains("交付 3/8"));
        assertTrue(content.contains("### 門戶改版"));
        assertTrue(content.contains("迭代 SP202610001"));
    }

    @Test
    @DisplayName("个人通知：只渲染收件人负责的项目，标题点名收件人")
    void personalFixedOnlyMine() {
        Snapshot snapshot = snapshot();
        ProjectNode other = new ProjectNode();
        other.setProjectId(2L);
        other.setProjectName("另一個項目");
        snapshot.getProjects().add(other);

        PersonalView personal = new PersonalView("張三", List.of(snapshot.getProjects().get(0)),
                0, 0, 0, 0, 0, 0, 0);
        Rendered r = renderer.renderPersonalFixed(snapshot, "u", false, personal, new MessageFieldOptions());

        assertTrue(r.content().contains("張三｜在途項目 1"));
        assertTrue(r.content().contains("門戶改版"));
        assertFalse(r.content().contains("另一個項目"));
    }

    @Test
    @DisplayName("无链接时只保留引导句，不输出空的 Markdown 链接")
    void noLinkWhenUrlBlank() {
        Rendered r = renderer.renderGroupFixed(snapshot(), "", false, new MessageFieldOptions());
        assertTrue(r.content().contains("請看完整日報"));
        assertFalse(r.content().contains("[查看完整日報]("));
    }
}
