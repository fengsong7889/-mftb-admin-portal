package com.mftb.admin.service;

import com.mftb.admin.constant.RdmDailyReportTemplates;
import com.mftb.admin.dto.RdmDailyReportVO.IterationNode;
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
 * 日报模板渲染器单测。
 *
 * <p>钉住四条不能被后续重构悄悄改掉的口径：
 * <ol>
 *   <li><b>防注入</b>：用户可控文本（项目名/需求标题/人名）里的方括号必须失效，
 *       否则一条需求标题就能在推给全公司的日报里造出钓鱼链接；</li>
 *   <li><b>零承诺不谎报</b>：交付项总数为 0 的项目必须显示「尚未排定」，
 *       不能因为 0-0=0 就被读成「全部完成」；</li>
 *   <li><b>未知占位符不静默</b>：保留原样并回报，让拼写错误在预览阶段就暴露；</li>
 *   <li><b>超长截断留出口</b>：宁可截断并给「点链接看完整日报」，也不让钉钉静默砍到半句话。</li>
 * </ol>
 */
class RdmDailyReportRendererTest {

    private final RdmDailyReportRenderer renderer = new RdmDailyReportRenderer();

    /* ==================== 测试数据 ==================== */

    private Snapshot snapshot(List<ProjectNode> projects) {
        Snapshot s = new Snapshot();
        s.setReportDate("2026-10-19");
        s.setReportType("morning");
        s.setReportTypeLabel("晨報");
        Summary sum = new Summary();
        sum.setProjectCount(projects.size());
        sum.setTodayDueItemCount(2);
        sum.setOverdueItemCount(1);
        sum.setRiskProjectCount((int) projects.stream().filter(ProjectNode::isAttention).count());
        sum.setNormalProjectCount(projects.size() - sum.getRiskProjectCount());
        s.setSummary(sum);
        s.setProjects(projects);
        return s;
    }

    private ProjectNode project(long id, String no, String name, int itemTotal, int itemDone) {
        ProjectNode p = new ProjectNode();
        p.setProjectId(id);
        p.setProjectNo(no);
        p.setProjectName(name);
        p.setPmUserName("張三");
        p.setProductOwnerUserName("李四");
        p.setDeliveryItemTotal(itemTotal);
        p.setDeliveryItemCompleted(itemDone);
        p.setRemainingCount(Math.max(0, itemTotal - itemDone));
        p.setNextDeliveryDate("2026-10-22");
        p.setDetailUrl("/rdm-project-detail?id=" + id + "&mode=view");
        return p;
    }

    private RequirementNode req(String no, String title, String label, String priority) {
        RequirementNode r = new RequirementNode();
        r.setReqNo(no);
        r.setTitle(title);
        r.setStatusLabel(label);
        r.setPriority(priority);
        return r;
    }

    private IterationNode iteration(String code, List<RequirementNode> reqs) {
        IterationNode it = new IterationNode();
        it.setCode(code);
        it.setName("十月迭代");
        it.setStatus("active");
        it.setStartDate("2026-10-08");
        it.setEndDate("2026-10-22");
        it.setRequirements(new ArrayList<>(reqs));
        it.setRequirementCount(reqs.size());
        return it;
    }

    /* ==================== 占位符替换 ==================== */

    @Test
    @DisplayName("群报：汇总占位符全部替换，不残留 {{}}")
    void rendersSummaryPlaceholders() {
        RdmDailyReportTemplates.Preset preset =
                RdmDailyReportTemplates.findPreset(RdmDailyReportTemplates.KEY_GROUP_MORNING_OVERVIEW);
        Snapshot s = snapshot(List.of(project(1L, "PROJ2026101901", "項目A", 5, 2)));

        Rendered r = renderer.renderGroup(preset.titleTpl(), preset.contentTpl(), s, "https://x/#/rdm-daily");

        assertTrue(r.content().contains("在途項目 1 個"), "应含在途项目数: " + r.content());
        assertTrue(r.content().contains("今日到期 2"), "应含今日到期数");
        assertTrue(r.content().contains("已逾期 1"), "应含逾期数");
        assertFalse(r.content().contains("{{projectCount}}"), "占位符不应残留");
        assertFalse(r.content().contains("{{projectBlock}}"), "层级片段占位符不应残留");
        assertTrue(r.content().contains("[查看完整日報](https://x/#/rdm-daily)"), "应含详情链接");
        assertTrue(r.title().contains("2026-10-19"), "标题应含日期: " + r.title());
        assertTrue(r.unknownPlaceholders().isEmpty(), "预置模板不应有未知占位符");
    }

    @Test
    @DisplayName("群报：未知占位符保留原样并回报（拼写错误必须在预览暴露）")
    void keepsUnknownPlaceholderAndReports() {
        Snapshot s = snapshot(List.of(project(1L, "PROJ2026101901", "項目A", 1, 0)));

        Rendered r = renderer.renderGroup("日報 {{reportDate}}",
                "在途 {{projectCount}} 個，逾期 {{overdueCnt}} 個", s, "");

        assertTrue(r.content().contains("在途 1 個"), "已知占位符应被替换");
        assertTrue(r.content().contains("{{overdueCnt}}"), "未知占位符必须原样保留，不能替成空串");
        assertEquals(List.of("{{overdueCnt}}"), r.unknownPlaceholders(), "应回报未知占位符清单");
    }

    /* ==================== 防注入 ==================== */

    @Test
    @DisplayName("安全：项目名与需求标题里的方括号失效，无法伪造 markdown 链接")
    void escapesUserControlledText() {
        ProjectNode p = project(1L, "PROJ2026101901", "惡意項目[點這裡](http://evil.example)", 1, 0);
        p.setIterations(List.of(iteration("SP202610001",
                List.of(req("XQ001", "需求[立即領取](http://evil2.example)", "開發中", "P1")))));
        Snapshot s = snapshot(List.of(p));

        Rendered r = renderer.renderGroup("日報", "{{projectBlock}}", s, "");

        assertFalse(r.content().contains("[點這裡](http://evil.example)"), "项目名不得构成可点链接");
        assertFalse(r.content().contains("[立即領取](http://evil2.example)"), "需求标题不得构成可点链接");
        assertTrue(r.content().contains("［點這裡］"), "方括号应转为全角，内容仍可读");
    }

    @Test
    @DisplayName("安全：换行被压平，多行文本无法伪造新的标题或列表结构")
    void flattensNewlinesInUserText() {
        ProjectNode p = project(1L, "PROJ2026101901", "正常名稱\n## 偽造標題\n- 偽造條目", 1, 0);
        Snapshot s = snapshot(List.of(p));

        Rendered r = renderer.renderGroup("日報", "{{projectBlock}}", s, "");

        assertFalse(r.content().contains("\n## 偽造標題"), "用户文本内的换行必须被压平");
        assertTrue(r.content().contains("正常名稱 ## 偽造標題 - 偽造條目"), "压平后仍作为一行文本保留");
    }

    /* ==================== 零承诺不谎报 ==================== */

    @Test
    @DisplayName("口径：交付项总数为 0 显示「尚未排定」，不能被读成全部完成")
    void showsNotScheduledWhenNoDeliveryItem() {
        Snapshot s = snapshot(List.of(project(1L, "PROJ2026101901", "新項目", 0, 0)));

        Rendered r = renderer.renderGroup("日報", "{{projectBlock}}", s, "");

        assertTrue(r.content().contains("交付項：尚未排定"), "零交付项必须显式说明: " + r.content());
        assertFalse(r.content().contains("剩餘 0 項"), "不得给出「剩余 0 项」这种像已完成的表述");
    }

    @Test
    @DisplayName("口径：有交付项时给出 已完成/总数 与剩余，逾期与阻塞单独标注")
    void showsDeliveryProgress() {
        ProjectNode p = project(1L, "PROJ2026101901", "項目A", 5, 2);
        p.setDeliveryItemOverdue(1);
        p.setDeliveryItemBlocked(1);
        Snapshot s = snapshot(List.of(p));

        Rendered r = renderer.renderGroup("日報", "{{projectBlock}}", s, "");

        assertTrue(r.content().contains("交付項 2/5 完成，剩餘 3 項"), "应含进度与剩余: " + r.content());
        assertTrue(r.content().contains("逾期 1"), "应标注逾期数");
        assertTrue(r.content().contains("阻塞 1"), "应标注阻塞数");
        assertTrue(r.content().contains("下次交付：2026-10-22"), "应含下次交付日");
    }

    /* ==================== 层级结构 ==================== */

    @Test
    @DisplayName("层级：项目 → 迭代 → 需求 三层缩进，需求带状态标签与优先级")
    void rendersThreeLevelHierarchy() {
        ProjectNode p = project(1L, "PROJ2026101901", "項目A", 3, 1);
        p.setIterations(List.of(iteration("SP202610001", List.of(
                req("XQ20261008001", "需求一", "測試中", "P1"),
                req("XQ20261008002", "需求二", "開發中", "P2")))));
        p.setUnscheduledRequirements(List.of(req("XQ20261008003", "未排期需求", "待受理", "P3")));
        Snapshot s = snapshot(List.of(p));

        Rendered r = renderer.renderGroup("日報", "{{projectBlock}}", s, "");
        String c = r.content();

        assertTrue(c.contains("### PROJ2026101901 項目A"), "项目应为三级标题: " + c);
        assertTrue(c.contains("PM 張三"), "应含 PM");
        assertTrue(c.contains("產品 李四"), "应含产品负责人");
        assertTrue(c.contains("- 迭代 SP202610001 十月迭代（2026-10-08~2026-10-22 · 進行中）"),
                "迭代应含编码、名称、起止与中文状态: " + c);
        assertTrue(c.contains("  - XQ20261008001 需求一 [測試中] P1"), "需求应缩进在迭代下并带状态与优先级");
        assertTrue(c.contains("- 未排迭代（1 個需求）"), "未排迭代需求应单独成组");
    }

    @Test
    @DisplayName("层级：单迭代需求超过 10 条时折叠为计数，不把群消息刷成需求清单")
    void truncatesLongRequirementList() {
        List<RequirementNode> many = new ArrayList<>();
        for (int i = 1; i <= 15; i++) {
            many.add(req("XQ" + i, "需求" + i, "開發中", "P2"));
        }
        ProjectNode p = project(1L, "PROJ2026101901", "項目A", 15, 0);
        p.setIterations(List.of(iteration("SP202610001", many)));
        Snapshot s = snapshot(List.of(p));

        Rendered r = renderer.renderGroup("日報", "{{projectBlock}}", s, "");

        assertTrue(r.content().contains("XQ10 需求10"), "前 10 条应展开");
        assertFalse(r.content().contains("XQ11 需求11"), "第 11 条起应折叠");
        assertTrue(r.content().contains("…等另有 5 個需求"), "应给出折叠计数: " + r.content());
    }

    /* ==================== 风险优先模板 ==================== */

    @Test
    @DisplayName("风险优先模板：只展开需关注项目，正常项目折叠为计数")
    void riskTemplateShowsOnlyAttentionProjects() {
        ProjectNode risk = project(1L, "PROJ2026101901", "風險項目", 3, 0);
        risk.setAttention(true);
        risk.setRiskFlag(1);
        ProjectNode normal = project(2L, "PROJ2026101902", "正常項目", 3, 1);
        Snapshot s = snapshot(List.of(risk, normal));

        RdmDailyReportTemplates.Preset preset =
                RdmDailyReportTemplates.findPreset(RdmDailyReportTemplates.KEY_GROUP_MORNING_RISK);
        Rendered r = renderer.renderGroup(preset.titleTpl(), preset.contentTpl(), s, "https://x/#/rdm-daily");

        assertTrue(r.content().contains("風險項目"), "需关注项目应展开");
        assertTrue(r.content().contains("⚠️風險"), "应带风险标记");
        assertFalse(r.content().contains("### PROJ2026101902 正常項目"), "正常项目不应展开明细");
        assertTrue(r.content().contains("其餘 1 個項目進展正常"), "正常项目应折叠为计数: " + r.content());
        assertFalse(r.content().contains("{{riskBlock}}"), "风险片段占位符不应残留");
        assertFalse(r.content().contains("{{normalProjectCount}}"), "计数占位符不应残留");
    }

    @Test
    @DisplayName("排序：需关注项目排在前面，管理者先看到异常")
    void attentionProjectsComeFirst() {
        ProjectNode normal = project(1L, "PROJ2026101901", "正常項目", 3, 1);
        ProjectNode risk = project(2L, "PROJ2026101902", "風險項目", 3, 0);
        risk.setAttention(true);
        // 快照构建侧已按 attention 优先排序，这里直接按该顺序传入验证渲染不再打乱
        Snapshot s = snapshot(List.of(risk, normal));

        Rendered r = renderer.renderGroup("日報", "{{projectBlock}}", s, "");

        assertTrue(r.content().indexOf("風險項目") < r.content().indexOf("正常項目"),
                "需关注项目应先出现: " + r.content());
    }

    /* ==================== 个人视角 ==================== */

    @Test
    @DisplayName("个人通知：渲染收件人姓名与其负责项目，链接可带 projectId")
    void rendersPersonalView() {
        ProjectNode mine = project(7L, "PROJ2026101901", "我的項目", 4, 1);
        Snapshot s = snapshot(List.of(mine));
        PersonalView view = new PersonalView("張三", List.of(mine), 3, 1, 2, 6, 2, 4, 1);

        RdmDailyReportTemplates.Preset preset =
                RdmDailyReportTemplates.findPreset(RdmDailyReportTemplates.KEY_PERSONAL_TODO);
        Rendered r = renderer.renderPersonal(preset.titleTpl(), preset.contentTpl(), s,
                "https://x/#/rdm-daily?projectId=7", view);

        assertTrue(r.content().contains("張三，您的產研交付日報"), "应含收件人姓名: " + r.content());
        assertTrue(r.content().contains("負責項目：**1 個**"), "应含其负责项目数");
        assertTrue(r.content().contains("待處理：**3 項**（逾期 1）"), "应含待办与逾期");
        assertTrue(r.content().contains("今日到期：**2 項**"), "应含今日到期");
        assertTrue(r.content().contains("我的項目"), "应展开其负责项目明细");
        assertTrue(r.content().contains("https://x/#/rdm-daily?projectId=7"), "应含带 projectId 的链接");
        assertFalse(r.content().contains("{{myProjectBlock}}"), "个人片段占位符不应残留");
    }

    @Test
    @DisplayName("个人总览模板：剩余工作按 总数-已完成 计算且不为负")
    void personalOverviewComputesRemaining() {
        Snapshot s = snapshot(List.of());
        // 参数顺序：(userName, projects, todoCount, overdueItemCount, todayDueItemCount,
        //             requirementTotal, requirementDone, deliveryTotal, deliveryDone)
        // 故意让 deliveryDone(5) > deliveryTotal(3)，验证剩余工作被夹到 0 而不是出现负数
        PersonalView view = new PersonalView("李四", List.of(), 0, 0, 0, 5, 2, 3, 5);

        RdmDailyReportTemplates.Preset preset =
                RdmDailyReportTemplates.findPreset(RdmDailyReportTemplates.KEY_PERSONAL_OVERVIEW);
        Rendered r = renderer.renderPersonal(preset.titleTpl(), preset.contentTpl(), s, "", view);

        assertTrue(r.content().contains("交付項：**3 項**（已完成 5，剩餘 0）"),
                "完成数超过总数时剩余应夹到 0: " + r.content());
        assertTrue(r.content().contains("需求：**5 個**（已完成 2）"), "需求口径应如实呈现");
    }

    @Test
    @DisplayName("健壮：个人视角为 null 时占位符仍被替换，不在群里露出 {{userName}} 原文")
    void personalPlaceholdersNeverLeakWhenNull() {
        Snapshot s = snapshot(List.of(project(1L, "PROJ2026101901", "項目A", 1, 0)));

        Rendered r = renderer.renderGroup("日報", "{{userName}} {{myTodoCount}} {{myProjectCount}}", s, "");

        assertFalse(r.content().contains("{{"), "任何个人占位符都不应残留: " + r.content());
        assertTrue(r.content().contains("— 0 0"), "空视角应渲染为占位符值而非空白");
    }

    /* ==================== 截断与空态 ==================== */

    @Test
    @DisplayName("截断：超长正文按上限截断并给出「点链接看完整日报」的出口")
    void truncatesOverlongContent() {
        // 直接用超长模板驱动截断分支：项目片段自带 budget 折叠（另有专门用例覆盖），
        // 这里要验的是「任何原因造成的超长」都会被 limit 兜住，而不是依赖特定数据形状
        String overlongTpl = "需".repeat(RdmDailyReportRenderer.GROUP_CONTENT_LIMIT + 500);
        Snapshot s = snapshot(List.of(project(1L, "PROJ2026101901", "項目A", 1, 0)));

        Rendered r = renderer.renderGroup("日報", overlongTpl, s, "https://x/#/rdm-daily");

        assertTrue(r.content().length() <= RdmDailyReportRenderer.GROUP_CONTENT_LIMIT + 60,
                "正文应受上限约束，实际长度 " + r.content().length());
        assertTrue(r.content().contains("內容過長已截斷"), "截断必须给出明确提示");
        assertTrue(r.content().contains("請點上方連結查看完整日報"), "截断提示应给出可操作出口");
    }

    @Test
    @DisplayName("截断：个人通知上限更严（手机端展示区域小），超长同样被截")
    void truncatesOverlongPersonalContent() {
        String overlongTpl = "需".repeat(RdmDailyReportRenderer.PERSONAL_CONTENT_LIMIT + 300);
        Snapshot s = snapshot(List.of());

        Rendered r = renderer.renderPersonal("日報", overlongTpl, s, "",
                new PersonalView("張三", List.of(), 0, 0, 0, 0, 0, 0, 0));

        assertTrue(r.content().length() <= RdmDailyReportRenderer.PERSONAL_CONTENT_LIMIT + 60,
                "个人通知正文应受更严上限约束，实际 " + r.content().length());
        assertTrue(r.content().contains("內容過長已截斷"), "截断必须给出明确提示");
    }

    @Test
    @DisplayName("折叠：项目片段自身超预算时提前停止展开，不依赖事后截断")
    void projectBlockStopsAtBudget() {
        List<ProjectNode> many = new ArrayList<>();
        for (int i = 1; i <= 200; i++) {
            ProjectNode p = project(i, "PROJ20261019" + String.format("%02d", i % 100),
                    "項目名稱很長用於撐開正文長度" + i, 10, 3);
            p.setIterations(List.of(iteration("SP" + i, List.of(
                    req("XQ" + i, "需求標題也很長用於撐開長度" + i, "開發中", "P1")))));
            many.add(p);
        }
        Snapshot s = snapshot(many);

        Rendered r = renderer.renderGroup("日報", "{{projectBlock}}", s, "https://x/#/rdm-daily");

        assertTrue(r.content().length() <= RdmDailyReportRenderer.GROUP_CONTENT_LIMIT + 200,
                "片段渲染阶段就应受预算约束，实际 " + r.content().length());
        assertTrue(r.content().contains("個項目未展開"), "未展开项目应折叠为计数: 尾部="
                + r.content().substring(Math.max(0, r.content().length() - 80)));
    }

    @Test
    @DisplayName("截断：项目数超过群报展开上限时折叠为计数")
    void foldsProjectsBeyondGroupLimit() {
        List<ProjectNode> many = new ArrayList<>();
        for (int i = 1; i <= 25; i++) {
            many.add(project(i, "PROJ" + i, "項目" + i, 2, 1));
        }
        Snapshot s = snapshot(many);

        Rendered r = renderer.renderGroup("日報", "{{projectBlock}}", s, "");

        assertTrue(r.content().contains("另有 5 個項目未展開"), "超出上限的项目应折叠为计数: " + r.content());
    }

    @Test
    @DisplayName("空态：无在途项目时给出明确空态文案，不发空白消息")
    void rendersEmptyState() {
        Snapshot s = snapshot(List.of());

        Rendered r = renderer.renderGroup("日報", "{{projectBlock}}", s, "");

        assertTrue(r.content().contains("目前沒有在途項目"), "应有空态文案: " + r.content());
    }

    @Test
    @DisplayName("空态：模板为空时返回空串而非抛异常（服务层据此判定不发送）")
    void handlesBlankTemplate() {
        Rendered r = renderer.renderGroup(null, "", snapshot(List.of()), "");

        assertEquals("", r.title());
        assertEquals("", r.content());
    }

    /* ==================== 静态工具 ==================== */

    @Test
    @DisplayName("迭代状态标签：三种取值都有繁中标签，未知值原样返回不吞掉")
    void mapsIterationStatusLabel() {
        assertEquals("規劃中", RdmDailyReportRenderer.iterationStatusLabel("planning"));
        assertEquals("進行中", RdmDailyReportRenderer.iterationStatusLabel("active"));
        assertEquals("已關閉", RdmDailyReportRenderer.iterationStatusLabel("closed"));
        assertEquals("weird", RdmDailyReportRenderer.iterationStatusLabel("weird"));
        assertEquals("—", RdmDailyReportRenderer.iterationStatusLabel(null));
    }

    @Test
    @DisplayName("转义：null 安全且不误伤正常中英文与数字")
    void safeHandlesNullAndPlainText() {
        assertEquals("", RdmDailyReportRenderer.safe(null));
        assertEquals("PROJ2026101901 項目A", RdmDailyReportRenderer.safe("PROJ2026101901 項目A"));
        assertEquals("［a］", RdmDailyReportRenderer.safe("[a]"));
    }
}
