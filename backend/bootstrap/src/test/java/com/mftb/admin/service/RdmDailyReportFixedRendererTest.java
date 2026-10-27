package com.mftb.admin.service;

import com.mftb.admin.dto.RdmDailyReportVO.IterationNode;
import com.mftb.admin.dto.RdmDailyReportVO.MessageFieldOptions;
import com.mftb.admin.dto.RdmDailyReportVO.ProjectNode;
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
 * 固定框架卡片版式渲染单测（项目→迭代两级进度清单版式）。
 *
 * <p>钉钉住几件事，任何一条放宽都会让真机版式重新坏掉：
 * <ol>
 *   <li><b>标题=日期+档位</b>：{@code MM-dd 需求交付晨報/晚報}，不再把异常计数塞进标题；</li>
 *   <li><b>正文两级清单</b>：项目行「name：迭代版本 N 個；」+ 迭代行「- 迭代名：**進度 x%**」；
 *       迭代名原样直出（不拼编码/负责人/进度条方格）；</li>
 *   <li><b>组间空行强制分行</b>：钉钉 markdown 把无空行分隔的相邻行归并成同一段
 *       （真机实测项目行粘行、迭代行吞掉下一个项目行），组间必须留空行；</li>
 *   <li><b>链接交给按钮</b>：正文不裸出 Markdown 链接，也不再拼引导引用行。</li>
 * </ol>
 */
class RdmDailyReportFixedRendererTest {

    private final RdmDailyReportRenderer renderer = new RdmDailyReportRenderer();

    private ProjectNode projectWithIteration() {
        ProjectNode p = new ProjectNode();
        p.setProjectId(1L);
        p.setProjectName("門戶改版");
        p.setProductOwnerUserName("李四");
        p.setIterationActiveCount(1);

        IterationNode it = new IterationNode();
        it.setIterationId(5L);
        it.setCode("SP202610001");
        it.setName("十月迭代");
        it.setStatus("active");
        it.setOwnerName("李四");
        it.setProgressPercent(50);
        p.setIterations(new ArrayList<>(List.of(it)));
        return p;
    }

    private ProjectNode emptyProject() {
        ProjectNode p = new ProjectNode();
        p.setProjectId(2L);
        p.setProjectName("內部工具");
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
        s.setProjects(new ArrayList<>(List.of(projectWithIteration(), emptyProject())));

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
    @DisplayName("标题=日期+档位：不塞异常计数，晚报换档位后缀")
    void titleIsDateAndSlotOnly() {
        Rendered morning = renderer.renderGroupFixed(snapshot(), "https://example.com/u", false,
                new MessageFieldOptions());
        Rendered evening = renderer.renderGroupFixed(snapshot(), "https://example.com/u", true,
                new MessageFieldOptions());

        assertEquals("10-20 需求交付晨報", morning.title());
        assertEquals("10-20 需求交付晚報", evening.title());
        assertFalse(morning.title().contains("逾期"), "标题不再拼异常计数，实际: " + morning.title());
        assertFalse(morning.title().contains("風險"), "标题不再拼异常计数，实际: " + morning.title());
    }

    @Test
    @DisplayName("正文两级清单：项目行+迭代进度行，未挂项目迭代以同形分组追加")
    void bodyIsProjectIterationTwoLevelList() {
        String content = renderer.renderGroupFixed(snapshot(), "https://example.com/u", false,
                new MessageFieldOptions()).content();

        assertTrue(content.contains("**門戶改版**：迭代版本：1 個；"), content);
        assertTrue(content.contains("- 十月迭代：**進度 50%**"), content);
        assertTrue(content.contains("**內部工具**：迭代版本：0 個；"), content);
        assertTrue(content.contains("**未掛項目迭代**：迭代版本：1 個；"), content);
        assertTrue(content.contains("- 緊急修復"), content);
        assertFalse(content.contains("## "), "卡片正文不重复标题，实际: " + content);
    }

    @Test
    @DisplayName("组间空行强制分行：钉钉会把无空行的相邻行归并成同一段（真机实测粘行）")
    void groupsSeparatedByBlankLine() {
        String content = renderer.renderGroupFixed(snapshot(), "https://example.com/u", false,
                new MessageFieldOptions()).content();

        assertTrue(content.contains("- 十月迭代：**進度 50%**\n\n**內部工具**"),
                "项目组之间必须空行，实际: " + content);
        assertTrue(content.contains("**內部工具**：迭代版本：0 個；\n\n**未掛項目迭代**"),
                "未挂迭代分组前必须空行，实际: " + content);
    }

    @Test
    @DisplayName("迭代名原样直出：不拼编码/负责人/进度条方格，也不得出现嵌套列表与需求明细")
    void iterationNameVerbatimWithoutNoise() {
        String content = renderer.renderGroupFixed(snapshot(), "https://example.com/u", false,
                new MessageFieldOptions()).content();

        assertFalse(content.contains("SP202610001"), "有名称时不回退编码，实际: " + content);
        assertFalse(content.contains("HF202610001"), "有名称时不回退编码，实际: " + content);
        assertFalse(content.contains("李四"), "负责人不进消息，实际: " + content);
        assertFalse(content.contains("王五"), "负责人不进消息，实际: " + content);
        assertFalse(content.contains("■"), "进度条方格已按真机反馈移除，实际: " + content);
        assertFalse(content.contains("□"), "进度条方格已按真机反馈移除，实际: " + content);
        assertFalse(content.contains("###"), "不得使用标题层级，实际: " + content);
        assertFalse(content.contains("\n  - "), "不得出现缩进子项（钉钉压平），实际: " + content);
    }

    @Test
    @DisplayName("快照无进度时只输出迭代名，不输出「進度 null%」断句")
    void progressMissingShowsNameOnly() {
        Snapshot s = snapshot();
        s.getProjects().get(0).getIterations().get(0).setProgressPercent(null);

        String content = renderer.renderGroupFixed(s, "u", false, new MessageFieldOptions()).content();

        assertTrue(content.contains("- 十月迭代\n"), content);
        assertFalse(content.contains("進度"), "无进度不得硬凑百分比，实际: " + content);
    }

    @Test
    @DisplayName("个人卡片：只含自己负责的项目，标题同群报口径，不署收件人姓名")
    void personalCardOnlyMine() {
        Snapshot snapshot = snapshot();
        PersonalView personal = new PersonalView("張三",
                List.of(snapshot.getProjects().get(1)), 0, 0, 0, 0, 0, 0, 0);

        Rendered r = renderer.renderPersonalFixed(snapshot, "https://example.com/u", false, personal,
                new MessageFieldOptions());

        assertEquals("10-20 需求交付晨報", r.title());
        assertTrue(r.content().contains("**內部工具**：迭代版本：0 個；"), r.content());
        assertFalse(r.content().contains("門戶改版"), "不得混入他人项目，实际: " + r.content());
        assertFalse(r.content().contains("張三"),
                "个人卡片不得出现收件人署名（追加收件人会误以为项目全归此人）: " + r.content());
    }

    @Test
    @DisplayName("降噪 brief 个人消息：不署姓名，只给「今日無異常 + 負責的 N 個項目」")
    void personalQuietBriefHasNoName() {
        Snapshot snapshot = snapshot();
        PersonalView quiet = new PersonalView("張三",
                List.of(snapshot.getProjects().get(1)), 0, 0, 0, 0, 0, 0, 0);

        Rendered r = renderer.renderPersonalQuiet(snapshot, false, quiet, "u");

        assertFalse(r.content().contains("張三"),
                "brief 消息同样不署姓名（领导收到会误以为项目全归此人）: " + r.content());
        assertTrue(r.content().startsWith("✅ **今日無異常**"), r.content());
        assertTrue(r.content().contains("負責的 1 個項目均在計劃內"), r.content());
        assertEquals("10-20 需求交付晨報", r.title());
    }

    @Test
    @DisplayName("降噪 brief 群报：一句话结论保留，标题同新口径")
    void groupQuietBriefKeepsSingleLine() {
        Rendered r = renderer.renderGroupQuiet(snapshot(), false, "https://example.com/u");

        assertTrue(r.content().startsWith("✅ **今日無異常**"), r.content());
        assertTrue(r.content().contains("完整明細請看完整日報"), r.content());
        assertEquals("10-20 需求交付晨報", r.title());
    }

    @Test
    @DisplayName("固定版式正文不裸出 Markdown 链接，也不拼引导引用行（有无链接正文一致）")
    void linkIsCarriedByButtonOnly() {
        String withUrl = renderer.renderGroupFixed(snapshot(), "https://example.com/u", false,
                new MessageFieldOptions()).content();
        String noUrl = renderer.renderGroupFixed(snapshot(), "", false, new MessageFieldOptions()).content();

        assertFalse(withUrl.contains("[查看完整日報]("), "链接交给卡片按钮，正文不再放 Markdown 链接");
        assertEquals(withUrl, noUrl, "固定版式正文不再拼引导引用行，有无链接应一致");
    }

    @Test
    @DisplayName("空快照兜底：一句「目前沒有在途項目」，不输出空清单")
    void emptySnapshotFallsBackToSingleLine() {
        Snapshot s = new Snapshot();
        s.setReportDate("2026-10-20");

        Rendered r = renderer.renderGroupFixed(s, "u", false, new MessageFieldOptions());

        assertTrue(r.content().contains("目前沒有在途項目"), r.content());
    }

    @Test
    @DisplayName("迭代视角：只盯未挂项目迭代时直接展开该分组，不推空日报")
    void iterationOnlyScopeExpandsUnassignedGroup() {
        Snapshot s = snapshot();
        s.setProjects(new ArrayList<>());
        s.setScopeIterationCode("HF202610001");

        String content = renderer.renderGroupFixed(s, "u", false, new MessageFieldOptions()).content();

        assertTrue(content.startsWith("**未掛項目迭代**：迭代版本：1 個；"), content);
        assertTrue(content.contains("- 緊急修復"), content);
    }

    @Test
    @DisplayName("正文长度受控：远小于 action_card 建议的 1000 字符，且无尾部空白行")
    void contentStaysWithinCardLimit() {
        String content = renderer.renderGroupFixed(snapshot(), "https://example.com/u", false,
                new MessageFieldOptions()).content();

        assertTrue(content.length() <= RdmDailyReportRenderer.CARD_CONTENT_LIMIT,
                "实际长度 " + content.length());
        assertEquals(content, content.stripTrailing());
    }
}
