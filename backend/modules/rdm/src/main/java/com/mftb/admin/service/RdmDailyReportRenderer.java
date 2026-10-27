package com.mftb.admin.service;

import com.mftb.admin.constant.RdmDailyReportTemplates;
import com.mftb.admin.dto.RdmDailyReportVO.IterationNode;
import com.mftb.admin.dto.RdmDailyReportVO.MessageFieldOptions;
import com.mftb.admin.dto.RdmDailyReportVO.ProjectNode;
import com.mftb.admin.dto.RdmDailyReportVO.RequirementNode;
import com.mftb.admin.dto.RdmDailyReportVO.Snapshot;
import com.mftb.admin.dto.RdmDailyReportVO.Summary;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 日报模板渲染器：把 {@link Snapshot} 按模板渲染成钉钉 markdown。
 *
 * <p><b>三条不可放宽的口径</b>：
 * <ol>
 *   <li><b>只做占位符字符串替换</b>，不引入模板引擎、不 eval、不拼接 SQL。「项目 → 迭代 → 需求」
 *       的层级循环由本类渲染成片段填入 {@code {{projectBlock}}}，模板只控制框架文案与字段顺序，
 *       因此模板再复杂也不产生注入面。</li>
 *   <li><b>用户可控文本必须转义</b>：项目名、需求标题、人名都来自用户输入，若原样拼进 markdown，
 *       一个 {@code [點這裡](http://evil)} 就能在日报里造出钓鱼链接。故一律经 {@link #safe(String)}
 *       把方括号换成全角并压平换行。</li>
 *   <li><b>未知占位符保留原样并回报</b>：静默替换成空串会让用户以为模板生效了（实际是拼写错误），
 *       因此原样输出 + 收集到 {@link Rendered#unknownPlaceholders()} 供页面提示。</li>
 * </ol>
 *
 * <p>本类不依赖数据库与 Spring 上下文状态，是纯函数式的，因此可脱离容器直接单测。
 */
@Slf4j
@Component
public class RdmDailyReportRenderer {

    /** 占位符形态：{{字母}}。只认字母，避免把正文里的其他花括号误判 */
    private static final Pattern PLACEHOLDER = Pattern.compile("\\{\\{([A-Za-z]+)}}");

    /**
     * 群报正文长度上限（字符）。
     * <p>钉钉自定义机器人 markdown 消息体上限约 20000 字节，中文按 UTF-8 占 3 字节，
     * 故按字符数保守取 6000（≈18000 字节）；超限截断并给出「点链接看完整日报」的出口，
     * 而不是把消息发失败或让钉钉静默截断到半句话。
     */
    static final int GROUP_CONTENT_LIMIT = 6000;

    /**
     * 个人工作通知正文长度上限（字符）。
     * <p>工作通知在手机端展示区域远小于群消息，过长会被折叠且阅读体验差；
     * 个人视角只需「我今天该推什么」，明细留给详情页链接。
     */
    static final int PERSONAL_CONTENT_LIMIT = 2000;

    /** 每个迭代下最多展开的需求条数：再多就该看详情页，而不是把群消息刷成需求清单 */
    private static final int MAX_REQUIREMENTS_PER_ITERATION = 10;
    /** 群报最多展开的项目数（风险优先模板不受此限，它只展开异常项目） */
    private static final int MAX_PROJECTS_IN_GROUP = 20;

    private static final String TRUNCATED_HINT = "\n\n> 內容過長已截斷，請點上方連結查看完整日報。";

    /**
     * 渲染结果。
     *
     * @param title               渲染后的标题
     * @param content             渲染后的正文（markdown）
     * @param unknownPlaceholders 模板里出现但渲染器不认识的占位符（已保留原样输出）
     */
    public record Rendered(String title, String content, List<String> unknownPlaceholders) {
    }

    /**
     * 个人视角数据（渲染 {@code {{myXxx}}} 占位符与 {@code {{myProjectBlock}}}）。
     *
     * @param userName          收件人姓名。<b>仅作上下文保留，不进入消息正文</b>：
     *                          个人日报一律不署名（收件人可能是追加的观察者，其收到的项目
     *                          不等于本人负责的项目），{@code {{userName}}} 恒渲染为空串
     * @param projects          该收件人负责的项目（PM 或产品负责人）
     * @param todoCount         其待办总数
     * @param overdueItemCount  其项目下逾期交付项数
     * @param todayDueItemCount 其项目下今日到期交付项数
     * @param requirementTotal  其项目下需求总数
     * @param requirementDone   其项目下已上线需求数
     * @param deliveryTotal     其项目下交付项总数
     * @param deliveryDone      其项目下已完成交付项数
     */
    public record PersonalView(String userName, List<ProjectNode> projects, int todoCount,
                               int overdueItemCount, int todayDueItemCount, int requirementTotal,
                               int requirementDone, int deliveryTotal, int deliveryDone) {
    }

    /**
     * 渲染群报。
     *
     * @param titleTpl   标题模板
     * @param contentTpl 正文模板
     * @param snapshot   日报快照
     * @param detailUrl  移动端日报页完整链接（可为空，空则链接占位符渲染为空串）
     */
    public Rendered renderGroup(String titleTpl, String contentTpl, Snapshot snapshot, String detailUrl) {
        List<ProjectNode> projects = snapshot == null || snapshot.getProjects() == null
                ? List.of() : snapshot.getProjects();
        List<ProjectNode> riskProjects = projects.stream().filter(ProjectNode::isAttention).toList();
        List<ProjectNode> normalProjects = projects.stream().filter(p -> !p.isAttention()).toList();

        Set<String> values = new LinkedHashSet<>();
        String title = replace(titleTpl, snapshot, detailUrl, null, values);
        String content = replace(contentTpl, snapshot, detailUrl, null, values);

        /*
         * 迭代视角：规则只盯某个未挂项目的迭代（紧急修复）时，快照里没有任何项目节点，
         * 仍用同一个 {{projectBlock}} 占位符渲染该迭代；否则会推一条「目前沒有在途項目」的空日报。
         */
        boolean iterationOnly = snapshot != null && snapshot.getScopeProjectId() == null
                && StringUtils.hasText(snapshot.getScopeIterationCode());
        List<IterationNode> unassigned = snapshot == null || snapshot.getUnassignedIterations() == null
                ? List.of() : snapshot.getUnassignedIterations();
        String projectSection = iterationOnly
                ? unassignedBlock(unassigned)
                : projectBlock(projects, MAX_PROJECTS_IN_GROUP, GROUP_CONTENT_LIMIT);

        // 层级片段最后填：它本身含 markdown 结构，不能被当作普通文本二次转义
        content = content
                .replace(RdmDailyReportTemplates.PH_PROJECT_BLOCK, projectSection)
                .replace(RdmDailyReportTemplates.PH_RISK_BLOCK,
                        projectBlock(riskProjects, MAX_PROJECTS_IN_GROUP, GROUP_CONTENT_LIMIT))
                .replace(RdmDailyReportTemplates.PH_NORMAL_PROJECT_COUNT, String.valueOf(normalProjects.size()));

        return new Rendered(title, limit(content, GROUP_CONTENT_LIMIT), unknownOf(titleTpl, contentTpl, values));
    }

    /**
     * 渲染个人工作通知。
     *
     * @param personal 收件人视角数据（为 null 时 {@code {{myXxx}}} 一律渲染为 0，不抛异常）
     */
    public Rendered renderPersonal(String titleTpl, String contentTpl, Snapshot snapshot,
                                   String detailUrl, PersonalView personal) {
        Set<String> values = new LinkedHashSet<>();
        String title = replace(titleTpl, snapshot, detailUrl, personal, values);
        String content = replace(contentTpl, snapshot, detailUrl, personal, values);

        List<ProjectNode> mine = personal == null || personal.projects() == null ? List.of() : personal.projects();
        content = content.replace(RdmDailyReportTemplates.PH_MY_PROJECT_BLOCK,
                projectBlock(mine, MAX_PROJECTS_IN_GROUP, PERSONAL_CONTENT_LIMIT));

        return new Rendered(title, limit(content, PERSONAL_CONTENT_LIMIT), unknownOf(titleTpl, contentTpl, values));
    }

    /* ==================== 固定框架（预置日报） ==================== */

    /** 固定框架默认字段开关（字段池见 {@link MessageFieldOptions}） */
    private static final MessageFieldOptions DEFAULT_FIELDS = new MessageFieldOptions();

    /**
     * 卡片正文长度上限（字符）。
     * <p>钉钉 action_card 的 markdown 建议 1000 字符以内，群机器人卡片同一量级；
     * 取 900 留出转义与 emoji 的余量。超限不是「截断继续塞」，而是说明还想把所有项目
     * 都放进消息——正确做法是收敛到「需关注项目」，其余交给详情页。
     */
    static final int CARD_CONTENT_LIMIT = 900;

    /** 卡片引导句：URL 在按钮里，正文不再裸出链接（群里一排长 URL 是最难看的部分） */
    private static final String CARD_FOOTER = "\n> 完整明細請看完整日報\n";
    /** 无详情链接时的兜底引导：宁可少一句指引，也不发一个点不动的空链接 */
    private static final String CARD_FOOTER_NO_LINK = "\n> 打開產研交付日報可查看完整明細\n";

    /**
     * 无异常日极简结论（降噪策略 brief）：一句话说完，不列项目。
     *
     * <p><b>为何还要保留一条而不直接静默</b>：读者需要知道「系统今天跑过了、确实没事」，
     * 而不是在“今天没收到”与“系统坏了”之间猜。正文只回答「有没有事」，明细在按钮里。
     */
    public Rendered renderGroupQuiet(Snapshot snapshot, boolean evening, String detailUrl) {
        // 用 summary 的项目数而不是 projects.size()：正文列表可能被截断/折叠，计数必须与指标同源
        int projects = summaryOf(snapshot).getProjectCount();
        String body = "✅ **今日無異常**\n在途 " + projects + " 個項目均在計劃內，無逾期，"
                + (evening ? "明日無到期。" : "今日無到期。") + "\n";
        return new Rendered(cardTitle(snapshot, evening),
                body + (StringUtils.hasText(detailUrl) ? CARD_FOOTER : CARD_FOOTER_NO_LINK), List.of());
    }

    /**
     * 个人无异常日极简结论：只回答「我负责的项目今天要不要动」。
     *
     * <p><b>为何正文不署收件人姓名</b>：个人通知的收件人不只是角色负责人，还包括推送规则里
     * 追加的收件人（部门负责人、PMO 等），后者拿到的是规则范围下的全量项目，并非「自己负责的项目」。
     * 正文一旦带上姓名，领导打开会误以为这条消息里的需求全归署名人，或怀疑系统把别人的日报发错了对象。
     * 姓名只用于「发给谁」的路由，不应出现在消息内容里。
     */
    public Rendered renderPersonalQuiet(Snapshot snapshot, boolean evening, PersonalView personal,
                                        String detailUrl) {
        int mine = personal == null || personal.projects() == null ? 0 : personal.projects().size();
        String body = "✅ **今日無異常**\n負責的 " + mine + " 個項目均在計劃內，無逾期，"
                + (evening ? "明日無到期。" : "今日無到期。") + "\n";
        return new Rendered(cardTitle(snapshot, evening),
                body + (StringUtils.hasText(detailUrl) ? CARD_FOOTER : CARD_FOOTER_NO_LINK), List.of());
    }

    /**
     * 固定框架群报（卡片版式）：标题=日期+档位，正文=项目→迭代两级进度清单。
     *
     * <p><b>版式口径（产品定义，晨報/晚報/个人三档共用）</b>：
     * <ol>
     *   <li>标题：{@code MM-dd 需求交付晨報/晚報}，不再拼接异常计数；</li>
     *   <li>正文：每个在途项目一行「<b>项目名</b>：迭代版本 N 個；」，其下逐迭代一行
     *       「迭代名：進度 x%；」；未挂项目的迭代以同名分组追加在最后；</li>
     *   <li>「查看完整日報」按钮由卡片渠道附加，正文不裸出链接。</li>
     * </ol>
     *
     * <p><b>无异常日不再收敛成一句话</b>：进度清单本身就是日报内容，「没事」不等于「没进度」；
     * 降噪由 quietPolicy 的 brief/skip 档在推送主流程负责，渲染器不再自行吞内容。
     */
    public Rendered renderGroupFixed(Snapshot snapshot, String detailUrl, boolean evening,
                                     MessageFieldOptions fields) {
        MessageFieldOptions f = fields == null ? DEFAULT_FIELDS : fields;
        List<ProjectNode> projects = snapshot == null || snapshot.getProjects() == null
                ? List.of() : snapshot.getProjects();
        List<IterationNode> unassigned = snapshot == null || snapshot.getUnassignedIterations() == null
                ? List.of() : snapshot.getUnassignedIterations();
        boolean iterationOnly = snapshot != null && snapshot.getScopeProjectId() == null
                && StringUtils.hasText(snapshot.getScopeIterationCode());

        StringBuilder sb = new StringBuilder();
        if (iterationOnly) {
            // 迭代视角只有这一个迭代：无异常也要列出，否则消息里看不到任何内容
            appendIterationGroup(sb, "未掛項目迭代", unassigned, f);
        } else {
            appendProjectGroups(sb, projects, unassigned, f);
        }
        return new Rendered(cardTitle(snapshot, evening),
                limit(sb.toString().stripTrailing(), CARD_CONTENT_LIMIT), List.of());
    }

    /**
     * 固定框架个人工作通知（卡片版式）：与群报同款两级进度清单，项目集合收敛到收件人负责的项目。
     *
     * <p>不复用群报项目集合是因为把全公司项目推给个人是噪声；
     * 正文同样不署收件人姓名，理由见 {@link #renderPersonalQuiet}：追加收件人拿到的项目
     * 不等于其本人负责的项目，署名会把「规则范围」误读成「某个人的工作汇报」。
     */
    public Rendered renderPersonalFixed(Snapshot snapshot, String detailUrl, boolean evening,
                                        PersonalView personal, MessageFieldOptions fields) {
        MessageFieldOptions f = fields == null ? DEFAULT_FIELDS : fields;
        List<ProjectNode> mine = personal == null || personal.projects() == null ? List.of() : personal.projects();
        StringBuilder sb = new StringBuilder();
        appendProjectGroups(sb, mine, List.of(), f);
        return new Rendered(cardTitle(snapshot, evening),
                limit(sb.toString().stripTrailing(), CARD_CONTENT_LIMIT), List.of());
    }

    /**
     * 两级进度清单：项目行「<b>项目名</b>：迭代版本 N 個；」+ 迭代行「- 迭代名：進度 x%；」。
     *
     * <p>项目数上限与字符预算沿用群报口径：超限折叠成一行计数，明细交给详情页按钮；
     * 未挂项目的迭代没有项目可挂，以「未掛項目迭代」分组追加，保证逾期迭代不会静默消失。
     */
    private void appendProjectGroups(StringBuilder sb, List<ProjectNode> projects,
                                     List<IterationNode> unassigned, MessageFieldOptions f) {
        int shown = 0;
        for (ProjectNode p : projects) {
            if (p == null) {
                continue;
            }
            if (shown >= MAX_PROJECTS_IN_GROUP || sb.length() > CARD_CONTENT_LIMIT) {
                break;
            }
            StringBuilder group = new StringBuilder();
            List<IterationNode> its = p.getIterations() == null ? List.of() : p.getIterations();
            group.append("**").append(safe(nullToDash(p.getProjectName()))).append("**：迭代版本：")
                    .append(its.size()).append(" 個；\n");
            for (IterationNode it : its) {
                appendIterationProgressLine(group, it, f);
            }
            // 钉钉 markdown 把无空行分隔的相邻行归并成同一段（真机实测：项目行粘行、
            // 迭代行与下一个项目行粘成一行），组间必须留空行保证每个项目独立成行
            sb.append(group).append('\n');
            shown++;
        }
        int rest = projects.size() - shown;
        if (rest > 0) {
            sb.append("另有 ").append(rest).append(" 個項目未展開，請看完整日報\n\n");
        }
        if (unassigned != null && !unassigned.isEmpty()) {
            appendIterationGroup(sb, "未掛項目迭代", unassigned, f);
        }
        if (sb.length() == 0) {
            sb.append("🟢 **目前沒有在途項目**\n");
        }
    }

    /** 迭代分组行：与项目行同形（分组名 + 迭代数），下挂迭代进度行；组尾留空行防钉钉并段 */
    private void appendIterationGroup(StringBuilder sb, String label, List<IterationNode> its,
                                      MessageFieldOptions f) {
        sb.append("**").append(label).append("**：迭代版本：").append(its.size()).append(" 個；\n");
        for (IterationNode it : its) {
            appendIterationProgressLine(sb, it, f);
        }
        sb.append('\n');
    }

    /**
     * 迭代进度行：「- 迭代名：**進度 x%**」。迭代名原样输出（叫什么显示什么，
     * 不拼编码/负责人等任何附加字）；进度是本版式的重点，加粗凸显；
     * 不画进度条（真机反馈：方格条占行且噪，直接展示百分比更干净）；
     * 进度字段被开关关闭或快照无进度时只输出迭代名。
     */
    private void appendIterationProgressLine(StringBuilder sb, IterationNode it, MessageFieldOptions f) {
        if (it == null) {
            return;
        }
        String label = StringUtils.hasText(it.getName()) ? it.getName() : nullToDash(it.getCode());
        StringBuilder line = new StringBuilder("- ").append(safe(label));
        if (on(f.getIterationProgress()) && it.getProgressPercent() != null) {
            int pct = Math.max(0, Math.min(100, it.getProgressPercent()));
            line.append("：**進度 ").append(pct).append("%**");
        }
        line.append('\n');
        sb.append(line);
    }

    /**
     * 卡片标题（群报与个人共用）：日期 + 档位，即「MM-dd 需求交付晨報/晚報」。
     * <p>标题不再拼接异常计数：版式口径改为正文承载项目→迭代进度清单，
     * 标题只回答「这是哪一天哪一档的日报」。
     */
    private String cardTitle(Snapshot snapshot, boolean evening) {
        return shortDate(snapshot) + " 需求交付" + (evening ? "晚報" : "晨報");
    }

    /** 标题里的短日期（MM-dd）：卡片标题空间有限，年份对日报是冗余信息 */
    private static String shortDate(Snapshot snapshot) {
        String date = reportDateOf(snapshot);
        return date.length() >= 10 ? date.substring(5) : date;
    }

    private static boolean on(Boolean flag) {
        return !Boolean.FALSE.equals(flag);
    }

    private static String reportDateOf(Snapshot snapshot) {
        return snapshot == null || !StringUtils.hasText(snapshot.getReportDate()) ? "—" : snapshot.getReportDate();
    }

    /* ==================== 占位符替换 ==================== */

    /**
     * 逐个替换已知占位符，并把「模板里实际出现过的占位符」收集到 {@code seen} 供未知判定。
     * <p>数字占位符统一渲染成十进制整数；日期/文案类为空时渲染成「—」而不是空串，
     * 避免管理者看到「下次交付 」这种断句。
     */
    private String replace(String tpl, Snapshot snapshot, String detailUrl, PersonalView personal, Set<String> seen) {
        if (!StringUtils.hasText(tpl)) {
            return "";
        }
        collectPlaceholders(tpl, seen);
        Summary s = summaryOf(snapshot);
        String date = snapshot == null || !StringUtils.hasText(snapshot.getReportDate()) ? "—" : snapshot.getReportDate();
        String typeLabel = snapshot == null || !StringUtils.hasText(snapshot.getReportTypeLabel()) ? "—" : snapshot.getReportTypeLabel();

        String out = tpl;
        out = out.replace(RdmDailyReportTemplates.PH_REPORT_DATE, date);
        out = out.replace(RdmDailyReportTemplates.PH_REPORT_TYPE_LABEL, typeLabel);
        out = out.replace(RdmDailyReportTemplates.PH_PROJECT_COUNT, String.valueOf(s.getProjectCount()));
        out = out.replace(RdmDailyReportTemplates.PH_TODAY_DUE_COUNT, String.valueOf(s.getTodayDueItemCount()));
        out = out.replace(RdmDailyReportTemplates.PH_OVERDUE_COUNT, String.valueOf(s.getOverdueItemCount()));
        out = out.replace(RdmDailyReportTemplates.PH_RISK_COUNT, String.valueOf(s.getRiskProjectCount()));
        out = out.replace(RdmDailyReportTemplates.PH_TODAY_DONE_COUNT, String.valueOf(s.getTodayDoneItemCount()));
        out = out.replace(RdmDailyReportTemplates.PH_TODAY_RELEASED_COUNT, String.valueOf(s.getTodayReleasedCount()));
        out = out.replace(RdmDailyReportTemplates.PH_TODAY_CHANGED_COUNT, String.valueOf(s.getTodayChangedCount()));
        out = out.replace(RdmDailyReportTemplates.PH_TOMORROW_DUE_COUNT, String.valueOf(s.getTomorrowDueItemCount()));
        out = out.replace(RdmDailyReportTemplates.PH_DETAIL_URL, detailUrl == null ? "" : detailUrl);

        // 个人视角占位符：personal 为 null（群报渲染路径）时也要替换掉，否则群里会露出 {{userName}} 原文
        PersonalView p = personal == null ? new PersonalView("—", List.of(), 0, 0, 0, 0, 0, 0, 0) : personal;
        /*
         * {{userName}} 恒渲染为空串：个人日报一律不署收件人姓名。
         * 为什么不在渲染层保留能力、只改预置模板——模板行是用户可自由编辑的（v3.23 起预置已转自定义），
         * 只要渲染器还给姓名，任何人把占位符写回模板就会重新出现归属误读；
         * 而追加收件人（部门负责人/PMO）收到的项目集合并不等于其本人负责的项目，
         * 「正文署名 + 全量项目」正是让领导误以为所有需求都归署名人、或以为消息发错人的根因。
         * 占位符仍留在白名单内：既不会被当成未知占位符原样露出，历史模板也不必强制改写。
         */
        out = out.replace(RdmDailyReportTemplates.PH_USER_NAME, "");
        out = out.replace(RdmDailyReportTemplates.PH_MY_PROJECT_COUNT, String.valueOf(sizeOf(p.projects())));
        out = out.replace(RdmDailyReportTemplates.PH_MY_TODO_COUNT, String.valueOf(p.todoCount()));
        out = out.replace(RdmDailyReportTemplates.PH_MY_OVERDUE_COUNT, String.valueOf(p.overdueItemCount()));
        out = out.replace(RdmDailyReportTemplates.PH_MY_TODAY_DUE_COUNT, String.valueOf(p.todayDueItemCount()));
        out = out.replace(RdmDailyReportTemplates.PH_MY_REQUIREMENT_COUNT, String.valueOf(p.requirementTotal()));
        out = out.replace(RdmDailyReportTemplates.PH_MY_REQUIREMENT_DONE_COUNT, String.valueOf(p.requirementDone()));
        out = out.replace(RdmDailyReportTemplates.PH_MY_DELIVERY_COUNT, String.valueOf(p.deliveryTotal()));
        out = out.replace(RdmDailyReportTemplates.PH_MY_DELIVERY_DONE_COUNT, String.valueOf(p.deliveryDone()));
        out = out.replace(RdmDailyReportTemplates.PH_MY_REMAINING_COUNT,
                String.valueOf(Math.max(0, p.deliveryTotal() - p.deliveryDone())));
        return out;
    }

    private void collectPlaceholders(String tpl, Set<String> seen) {
        Matcher m = PLACEHOLDER.matcher(tpl);
        while (m.find()) {
            seen.add(m.group(0));
        }
    }

    /** 模板里出现、但不在渲染器白名单内的占位符（保留原样输出，仅回报给页面提示） */
    private List<String> unknownOf(String titleTpl, String contentTpl, Set<String> seen) {
        List<String> unknown = new ArrayList<>();
        for (String ph : seen) {
            if (!RdmDailyReportTemplates.KNOWN_PLACEHOLDERS.contains(ph)) {
                unknown.add(ph);
            }
        }
        if (!unknown.isEmpty()) {
            // 不静默：拼写错误的占位符会原样出现在钉钉消息里，必须在页面与日志同时可见
            log.warn("日报模板含未知占位符（已原样输出，请检查拼写）: title={}, content={}, unknown={}",
                    StringUtils.hasText(titleTpl), StringUtils.hasText(contentTpl), unknown);
        }
        return unknown;
    }

    /* ==================== 层级片段渲染 ==================== */

    /**
     * 渲染「项目 → 迭代 → 需求」markdown 片段。
     *
     * <p>项目多时只展开前 {@code maxProjects} 个（风险项目已在调用侧排到前面），其余折叠为一行计数——
     * 日报的目的是让管理者一眼看到异常，不是把全部需求刷进群里。
     */
    private String projectBlock(List<ProjectNode> projects, int maxProjects, int budget) {
        if (projects == null || projects.isEmpty()) {
            return "_目前沒有在途項目。_";
        }
        StringBuilder sb = new StringBuilder();
        int shown = 0;
        for (ProjectNode p : projects) {
            if (p == null) {
                continue;
            }
            if (shown >= maxProjects || sb.length() > budget) {
                break;
            }
            appendProject(sb, p);
            shown++;
        }
        int rest = projects.size() - shown;
        if (rest > 0) {
            sb.append("\n> 另有 ").append(rest).append(" 個項目未展開，請點連結查看完整日報。\n");
        }
        return sb.toString().stripTrailing();
    }

    private void appendProject(StringBuilder sb, ProjectNode p) {
        sb.append("\n### ").append(safe(projectLabel(p)));
        List<String> marks = new ArrayList<>();
        if (isTrue(p.getRiskFlag())) {
            marks.add("⚠️風險");
        }
        if (isTrue(p.getOverdueFlag())) {
            marks.add("⏰逾期");
        }
        if (isTrue(p.getPausedFlag())) {
            marks.add("⏸暫停");
        }
        if (!marks.isEmpty()) {
            sb.append(' ').append(String.join(" ", marks));
        }
        sb.append('\n');
        appendOwnerLine(sb, p);

        // 交付项进度：总数为 0 时必须短路，否则 0/0 会被读成「全部完成」
        if (p.getDeliveryItemTotal() > 0) {
            sb.append("- 交付項 ").append(p.getDeliveryItemCompleted()).append('/').append(p.getDeliveryItemTotal())
                    .append(" 完成，剩餘 ").append(Math.max(0, p.getRemainingCount())).append(" 項");
            if (p.getDeliveryItemOverdue() > 0) {
                sb.append("（逾期 ").append(p.getDeliveryItemOverdue()).append("）");
            }
            if (p.getDeliveryItemBlocked() > 0) {
                sb.append("（阻塞 ").append(p.getDeliveryItemBlocked()).append("）");
            }
            sb.append('\n');
        } else {
            sb.append("- 交付項：尚未排定\n");
        }
        if (StringUtils.hasText(p.getNextDeliveryDate())) {
            sb.append("- 下次交付：").append(p.getNextDeliveryDate()).append('\n');
        }

        List<IterationNode> iterations = p.getIterations() == null ? List.of() : p.getIterations();
        for (IterationNode it : iterations) {
            appendIteration(sb, it);
        }
        List<RequirementNode> unscheduled = p.getUnscheduledRequirements() == null
                ? List.of() : p.getUnscheduledRequirements();
        if (!unscheduled.isEmpty()) {
            sb.append("- 未排迭代（").append(unscheduled.size()).append(" 個需求）\n");
            appendRequirements(sb, unscheduled, "  ");
        }
    }

    /**
     * 未挂项目迭代片段。
     * <p>只用于「规则只盯某个未挂项目迭代」的快照：这类快照没有任何项目节点，
     * 若仍走 {@link #projectBlock} 会推出一条「目前沒有在途項目」的空日报。
     */
    private String unassignedBlock(List<IterationNode> iterations) {
        if (iterations == null || iterations.isEmpty()) {
            return "_該迭代下暫無需求明細。_";
        }
        StringBuilder sb = new StringBuilder("\n### 未掛項目迭代\n");
        for (IterationNode it : iterations) {
            appendIteration(sb, it);
        }
        return sb.toString().stripTrailing();
    }

    private void appendOwnerLine(StringBuilder sb, ProjectNode p) {
        List<String> owners = new ArrayList<>();
        if (StringUtils.hasText(p.getPmUserName())) {
            owners.add("PM " + safe(p.getPmUserName()));
        }
        if (StringUtils.hasText(p.getProductOwnerUserName())) {
            owners.add("產品 " + safe(p.getProductOwnerUserName()));
        }
        if (!owners.isEmpty()) {
            sb.append("- ").append(String.join("｜", owners)).append('\n');
        }
    }

    private void appendIteration(StringBuilder sb, IterationNode it) {
        if (it == null) {
            return;
        }
        sb.append("- 迭代 ").append(safe(nullToDash(it.getCode())));
        if (StringUtils.hasText(it.getName()) && !it.getName().equals(it.getCode())) {
            sb.append(' ').append(safe(it.getName()));
        }
        List<String> meta = new ArrayList<>();
        if (StringUtils.hasText(it.getStartDate()) && StringUtils.hasText(it.getEndDate())) {
            meta.add(it.getStartDate() + "~" + it.getEndDate());
        }
        if (StringUtils.hasText(it.getStatus())) {
            meta.add(iterationStatusLabel(it.getStatus()));
        }
        if (!meta.isEmpty()) {
            sb.append("（").append(String.join(" · ", meta)).append("）");
        }
        sb.append('\n');
        appendRequirements(sb, it.getRequirements(), "  ");
    }

    private void appendRequirements(StringBuilder sb, List<RequirementNode> reqs, String indent) {
        if (reqs == null || reqs.isEmpty()) {
            return;
        }
        int shown = 0;
        for (RequirementNode r : reqs) {
            if (r == null || shown >= MAX_REQUIREMENTS_PER_ITERATION) {
                break;
            }
            sb.append(indent).append("- ");
            if (StringUtils.hasText(r.getReqNo())) {
                sb.append(safe(r.getReqNo())).append(' ');
            }
            sb.append(safe(nullToDash(r.getTitle())));
            if (StringUtils.hasText(r.getStatusLabel())) {
                sb.append(" [").append(safe(r.getStatusLabel())).append(']');
            }
            if (StringUtils.hasText(r.getPriority())) {
                sb.append(' ').append(safe(r.getPriority()));
            }
            if (isTrue(r.getOverdueFlag())) {
                sb.append(" ⏰");
            }
            if (isTrue(r.getBlockedFlag())) {
                sb.append(" ⛔");
            }
            sb.append('\n');
            shown++;
        }
        int rest = reqs.size() - shown;
        if (rest > 0) {
            sb.append(indent).append("- …等另有 ").append(rest).append(" 個需求\n");
        }
    }

    /* ==================== 文本安全与工具 ==================== */

    /**
     * 用户可控文本转义。
     * <p>把半角方括号换成全角、换行压成空格：这样 {@code [點這裡](http://evil)} 无法构成 markdown 链接，
     * 多行文本也无法伪造出新的标题/列表结构。<b>不用反斜杠转义</b>——钉钉 markdown 对
     * {@code \[} 的支持不一致，转义符可能原样显示，全角替换则在任何渲染器下都安全且视觉近似。
     */
    static String safe(String value) {
        if (value == null) {
            return "";
        }
        return value.replace("[", "［").replace("]", "］")
                .replace("\r", " ").replace("\n", " ")
                .strip();
    }

    private static String nullToDash(String value) {
        return StringUtils.hasText(value) ? value : "—";
    }

    private static String projectLabel(ProjectNode p) {
        String no = StringUtils.hasText(p.getProjectNo()) ? p.getProjectNo() + " " : "";
        return no + nullToEmpty(p.getProjectName());
    }

    private static String nullToEmpty(String value) {
        return value == null ? "" : value;
    }

    private static boolean isTrue(Integer flag) {
        return flag != null && flag == 1;
    }

    private static int sizeOf(List<?> list) {
        return list == null ? 0 : list.size();
    }

    private static Summary summaryOf(Snapshot snapshot) {
        if (snapshot != null && snapshot.getSummary() != null) {
            return snapshot.getSummary();
        }
        return new Summary();
    }

    /** 迭代状态中文标签（planning/active/closed 是 rdm_iteration.status 的全部取值） */
    static String iterationStatusLabel(String status) {
        if (status == null) {
            return "—";
        }
        return switch (status) {
            case "planning" -> "規劃中";
            case "active" -> "進行中";
            case "closed" -> "已關閉";
            default -> status;
        };
    }

    /** 超长截断：宁可截断并给出口，也不要让钉钉静默砍到半句话或整条发送失败 */
    private static String limit(String content, int max) {
        if (content == null) {
            return "";
        }
        return content.length() <= max ? content : content.substring(0, max) + TRUNCATED_HINT;
    }
}
