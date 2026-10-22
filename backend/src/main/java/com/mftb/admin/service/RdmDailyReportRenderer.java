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
     * @param userName          收件人姓名
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

    /** 卡片最多展开的关注项目数：再多读者也读不完，剩下的折叠成一行计数 */
    private static final int MAX_ATTENTION_IN_CARD = 5;

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
        return new Rendered(cardGroupTitle(snapshot, evening),
                body + (StringUtils.hasText(detailUrl) ? CARD_FOOTER : CARD_FOOTER_NO_LINK), List.of());
    }

    /** 个人无异常日极简结论：只回答「我负责的项目今天要不要动」 */
    public Rendered renderPersonalQuiet(Snapshot snapshot, boolean evening, PersonalView personal,
                                        String detailUrl) {
        String name = personal == null ? "—" : safe(personal.userName());
        int mine = personal == null || personal.projects() == null ? 0 : personal.projects().size();
        String body = "✅ **" + name + "，今日無異常**\n負責的 " + mine + " 個項目均在計劃內，無逾期，"
                + (evening ? "明日無到期。" : "今日無到期。") + "\n";
        return new Rendered(cardPersonalTitle(snapshot, evening, personal),
                body + (StringUtils.hasText(detailUrl) ? CARD_FOOTER : CARD_FOOTER_NO_LINK), List.of());
    }

    /**
     * 固定框架群报（卡片版式）：结论标题 → 指标行 → 需关注项目 → 正常项目折叠。
     *
     * <p><b>与旧版（多级标题 + 嵌套列表）的根本区别</b>：钉钉 markdown <b>不支持嵌套列表</b>，
     * 旧的「项目 {@code ###} → 迭代 {@code -} → 需求 {@code "  -"}」在客户端会被压成同一层的
     * 一排横线，项目一多读者就分不清谁属于谁——这正是「看着很乱、层级不醒目」的根因。
     * 卡片版式因此只用<b>单层列表</b>，归属由「项目名加粗 + 同行分隔符」表达；
     * 需求明细不再进消息（那是看板的职责），只保留计数。
     *
     * <p><b>标题就是结论</b>：钉钉会话列表只露 title，所以「逾期 2、风险 1」必须写进标题，
     * 不点开也能判断今天要不要紧张；正文只负责回答「哪几个项目」。
     */
    public Rendered renderGroupFixed(Snapshot snapshot, String detailUrl, boolean evening,
                                     MessageFieldOptions fields) {
        MessageFieldOptions f = fields == null ? DEFAULT_FIELDS : fields;
        List<ProjectNode> projects = snapshot == null || snapshot.getProjects() == null
                ? List.of() : snapshot.getProjects();
        List<ProjectNode> attention = projects.stream()
                .filter(p -> p != null && p.isAttention()).toList();
        List<IterationNode> unassigned = snapshot == null || snapshot.getUnassignedIterations() == null
                ? List.of() : snapshot.getUnassignedIterations();
        boolean iterationOnly = snapshot != null && snapshot.getScopeProjectId() == null
                && StringUtils.hasText(snapshot.getScopeIterationCode());

        StringBuilder sb = new StringBuilder();
        // 指标行与下方项目块之间必须留空行：钉钉 markdown 把连续单换行归并成一段，
        // 不加空行时「在途 6｜…」会和「需關注 N 個項目」粘成一行
        sb.append(cardMetrics(snapshot, evening)).append("\n\n");
        if (iterationOnly) {
            sb.append(cardUnassigned(unassigned, f));
        } else {
            // 无关注项目时只给一句肯定句：先输出空占位再跟一行「其餘 N 個正常」会重复两次绿色结论
            if (attention.isEmpty()) {
                sb.append("🟢 **全部 ").append(projects.size()).append(" 個在途項目進展正常**\n");
            } else {
                sb.append(cardAttentionProjects(attention, snapshot, f));
                int normal = projects.size() - attention.size();
                if (normal > 0) {
                    sb.append("\n🟢 其餘 ").append(normal).append(" 個項目進展正常\n");
                }
            }
            sb.append(cardUnassigned(unassigned, f));
        }
        sb.append(StringUtils.hasText(detailUrl) ? CARD_FOOTER : CARD_FOOTER_NO_LINK);
        return new Rendered(cardGroupTitle(snapshot, evening),
                limit(sb.toString().stripTrailing(), CARD_CONTENT_LIMIT), List.of());
    }

    /**
     * 固定框架个人工作通知（卡片版式）：同一套层级，只是项目集合收敛到收件人负责的项目。
     *
     * <p>不复用群报文案是因为个人视角要的是「我的项目」，把全公司项目推给个人是噪声；
     * 更重要的是逾期/今日到期必须用<b>收件人自己的口径</b>——用全局数字会让每个人
     * 以为全公司的逾期都压在自己身上。
     */
    public Rendered renderPersonalFixed(Snapshot snapshot, String detailUrl, boolean evening,
                                        PersonalView personal, MessageFieldOptions fields) {
        MessageFieldOptions f = fields == null ? DEFAULT_FIELDS : fields;
        List<ProjectNode> mine = personal == null || personal.projects() == null ? List.of() : personal.projects();
        int overdue = personal == null ? 0 : personal.overdueItemCount();
        int todayDue = personal == null ? 0 : personal.todayDueItemCount();
        int urgent = overdue + todayDue;
        String name = personal == null ? "—" : safe(personal.userName());

        StringBuilder sb = new StringBuilder();
        sb.append("**").append(name).append("，")
                .append(urgent > 0 ? "今天有 " + urgent + " 項交付要處理" : "今天沒有到期或逾期的交付項")
                .append("**\n\n");
        sb.append(cardPersonalMetrics(mine.size(), overdue, todayDue)).append("\n\n");

        // 个人视角的关注集合 = 项目级风险/逾期 + 今日有交付的项目（后者的口径与上方指标同源）
        List<ProjectNode> attention = mine.stream()
                .filter(p -> p != null && (p.isAttention() || isDueOn(p, snapshot)))
                .toList();
        if (attention.isEmpty()) {
            sb.append(cardAllNormal(mine));
        } else {
            sb.append(cardAttentionProjects(attention, snapshot, f));
            int normal = mine.size() - attention.size();
            if (normal > 0) {
                sb.append("\n🟢 其餘 ").append(normal).append(" 個項目進展正常\n");
            }
        }
        sb.append(StringUtils.hasText(detailUrl) ? CARD_FOOTER : CARD_FOOTER_NO_LINK);
        return new Rendered(cardPersonalTitle(snapshot, evening, personal),
                limit(sb.toString().stripTrailing(), CARD_CONTENT_LIMIT), List.of());
    }

    /**
     * 个人卡片指标行。
     * <p>与群报不同，这里不必展示「風險項目數」——个人只关心「今天要动几件事」；
     * 全为 0 时给一个 ✅ 肯定句，而不是三行「0」。
     */
    private String cardPersonalMetrics(int projectCount, int overdue, int todayDue) {
        List<String> parts = new ArrayList<>();
        parts.add("📦 在途 " + projectCount);
        if (todayDue > 0) {
            parts.add("🟡 今日到期 " + todayDue + " 項");
        }
        if (overdue > 0) {
            parts.add("🔴 逾期 " + overdue + " 項");
        }
        if (todayDue == 0 && overdue == 0) {
            parts.add("✅ 今日無異常");
        }
        return "**" + String.join("｜", parts) + "**";
    }

    /** 群报卡片标题：日期 + 档位 + 结论（逾期/风险计数），无异常时直说无异常 */
    private String cardGroupTitle(Snapshot snapshot, boolean evening) {
        String head = "產研交付日報 " + shortDate(snapshot) + (evening ? " 晚報" : " 晨報");
        Summary s = summaryOf(snapshot);
        int overdue = s.getOverdueItemCount();
        int risk = s.getRiskProjectCount();
        if (overdue <= 0 && risk <= 0) {
            return head + "｜今日無異常";
        }
        List<String> parts = new ArrayList<>();
        if (overdue > 0) {
            parts.add("逾期 " + overdue);
        }
        if (risk > 0) {
            parts.add("風險 " + risk);
        }
        return head + "｜" + String.join(" · ", parts);
    }

    /** 个人卡片标题：同样结论化——不点开就知道今天有没有事 */
    private String cardPersonalTitle(Snapshot snapshot, boolean evening, PersonalView personal) {
        String head = "產研交付日報 " + shortDate(snapshot) + (evening ? " 晚報" : " 晨報");
        int urgent = personal == null ? 0 : personal.overdueItemCount() + personal.todayDueItemCount();
        return head + "｜" + (urgent > 0 ? "你有 " + urgent + " 項要處理" : "今日無異常");
    }

    /** 标题里的短日期（MM-dd）：卡片标题空间有限，年份对日报是冗余信息 */
    private static String shortDate(Snapshot snapshot) {
        String date = reportDateOf(snapshot);
        return date.length() >= 10 ? date.substring(5) : date;
    }

    /** 群报指标行：限定单位避免「2」到底是项目还是交付项 —— 逾期/到期是项，风险是项目 */
    private String cardMetrics(Snapshot snapshot, boolean evening) {
        Summary s = summaryOf(snapshot);
        List<String> parts = new ArrayList<>();
        parts.add("在途 " + s.getProjectCount());
        if (evening) {
            parts.add("今日完成 " + s.getTodayDoneItemCount() + " 項");
            parts.add("今日上線 " + s.getTodayReleasedCount() + " 個");
        } else {
            parts.add("今日到期 " + s.getTodayDueItemCount() + " 項");
        }
        parts.add(zeroAware("逾期 ", s.getOverdueItemCount(), " 項"));
        parts.add(zeroAware("風險 ", s.getRiskProjectCount(), " 個"));
        return "**" + String.join("｜", parts) + "**";
    }

    private static String zeroAware(String label, int value, String unit) {
        return value > 0 ? label + value + unit : "✅ " + label + "0" + unit;
    }

    /**
     * 个人视角「全部正常」块。
     *
     * <p>为何个人列出项目名、群报不列：个人的在途项目通常就 1~3 个，列出名字能直接回答
     * 「我负责的这几个都在推进」；群报动辄十几个项目，逐个列就是刷屏，一句计数就够。
     */
    private String cardAllNormal(List<ProjectNode> mine) {
        if (mine.isEmpty()) {
            return "🟢 **目前沒有在途項目**\n";
        }
        StringBuilder sb = new StringBuilder("🟢 **全部 ").append(mine.size()).append(" 個項目進展正常**\n");
        if (mine.size() <= MAX_ATTENTION_IN_CARD) {
            for (ProjectNode p : mine) {
                if (p != null) {
                    sb.append("- ▸ ").append(safe(nullToDash(p.getProjectName()))).append('\n');
                }
            }
        }
        return sb.toString();
    }

    /**
     * 需关注项目块：一个项目一行（状态灯 + 加粗项目名 + 字段池拼接），不再逐迭代铺开。
     *
     * <p>为何不再逐迭代列出：卡片正文只有 900 字符，一个项目三五个迭代就能把它填满，
     * 而读者真正要判断的是「哪个项目出事了」。迭代明细属于详情页。
     */
    private String cardAttentionProjects(List<ProjectNode> attention, Snapshot snapshot, MessageFieldOptions f) {
        if (attention == null || attention.isEmpty()) {
            return "🟢 **暫無需關注項目**\n";
        }
        StringBuilder sb = new StringBuilder("🔴 **需關注 ").append(attention.size()).append(" 個項目**\n");
        int shown = 0;
        for (ProjectNode p : attention) {
            if (p == null || shown >= MAX_ATTENTION_IN_CARD || sb.length() > CARD_CONTENT_LIMIT) {
                break;
            }
            sb.append("- ").append(cardFlag(p, snapshot)).append(' ')
                    .append("**").append(safe(nullToDash(p.getProjectName()))).append("**");
            String detail = fixedProjectDetail(p, f);
            if (StringUtils.hasText(detail)) {
                sb.append(' ').append(detail);
            }
            sb.append('\n');
            shown++;
        }
        int rest = attention.size() - shown;
        if (rest > 0) {
            sb.append("- 另有 ").append(rest).append(" 個需關注項目，請看完整日報\n");
        }
        return sb.toString();
    }

    /**
     * 项目状态灯：逾期 > 风险/阻塞 > 今日有交付 > 普通。
     * <p>用 emoji 而不是颜色标记：钉钉各端对 {@code <font color>} 支持不一致，
     * emoji 在任何客户端都能渲染，且在纯文本预览里也不会退化成一堆标签。
     */
    private static String cardFlag(ProjectNode p, Snapshot snapshot) {
        if (isTrue(p.getOverdueFlag()) || p.getDeliveryItemOverdue() > 0) {
            return "🔴";
        }
        if (isTrue(p.getRiskFlag()) || p.getDeliveryItemBlocked() > 0) {
            return "🟠";
        }
        if (isDueOn(p, snapshot)) {
            return "🟡";
        }
        return "▸";
    }

    /** 今日是否由该项目交付：口径取快照 reportDate 而不是系统当前时间，保证历史快照重发时仍自洽 */
    private static boolean isDueOn(ProjectNode p, Snapshot snapshot) {
        return p != null && snapshot != null && StringUtils.hasText(snapshot.getReportDate())
                // 已完成的项目残留 nextDeliveryDate 时不得再标「今日到期」（零承诺同理）
                && p.getRemainingCount() > 0
                && snapshot.getReportDate().equals(p.getNextDeliveryDate());
    }

    /** 项目行字段（可配部分拼成一行）：项目名与异常角标在标题行，不属字段池 */
    private String fixedProjectDetail(ProjectNode p, MessageFieldOptions f) {
        List<String> parts = new ArrayList<>();
        if (on(f.getProjectProductOwner()) && StringUtils.hasText(p.getProductOwnerUserName())) {
            parts.add("產品 " + safe(p.getProductOwnerUserName()));
        }
        if (on(f.getProjectDeliveryProgress())) {
            if (p.getDeliveryItemTotal() > 0) {
                int pct = Math.max(0, Math.min(100, Math.round(
                        p.getDeliveryItemCompleted() * 100f / p.getDeliveryItemTotal())));
                parts.add("交付 " + p.getDeliveryItemCompleted() + "/" + p.getDeliveryItemTotal() + "（" + pct + "%）");
            } else {
                // 零承诺短路：尚未排交付项 ≠ 全部完成，必须显式说明
                parts.add("交付 尚未排定");
            }
        }
        if (on(f.getProjectIterationCount())) {
            parts.add("迭代 " + p.getIterationActiveCount() + " 個");
        }
        if (on(f.getProjectPeriod()) && StringUtils.hasText(p.getPlanStartDate())
                && StringUtils.hasText(p.getPlanEndDate())) {
            parts.add("週期 " + p.getPlanStartDate() + "~" + p.getPlanEndDate());
        }
        if (on(f.getProjectNextDelivery()) && StringUtils.hasText(p.getNextDeliveryDate())) {
            parts.add("下次交付 " + p.getNextDeliveryDate());
        }
        if (on(f.getProjectAbnormal()) && (p.getDeliveryItemOverdue() > 0 || p.getDeliveryItemBlocked() > 0)) {
            parts.add("逾期 " + p.getDeliveryItemOverdue() + "｜阻塞 " + p.getDeliveryItemBlocked());
        }
        return String.join("｜", parts);
    }

    /** 迭代行：code + 名称必显（框架），其余字段按开关拼接 */
    private String fixedIterationLine(IterationNode it, MessageFieldOptions f, String bullet) {
        if (it == null) {
            return "";
        }
        StringBuilder sb = new StringBuilder(bullet).append("迭代 ")
                .append(safe(nullToDash(it.getCode())));
        if (StringUtils.hasText(it.getName()) && !it.getName().equals(it.getCode())) {
            sb.append(' ').append(safe(it.getName()));
        }
        List<String> meta = new ArrayList<>();
        if (on(f.getIterationStatus()) && StringUtils.hasText(it.getStatus())) {
            meta.add(iterationStatusLabel(it.getStatus()));
        }
        if (on(f.getIterationOwner()) && StringUtils.hasText(it.getOwnerName())) {
            meta.add(safe(it.getOwnerName()));
        }
        if (on(f.getIterationProgress())) {
            // 进度 = 任务进度按计划工时加权；产能 = 已排计划工时 / 迭代产能。
            // 无任务/未设产能时不输出占位符，避免每行都拖一个「—｜未設定」
            if (it.getProgressPercent() != null) {
                meta.add("進度 " + it.getProgressPercent() + "%");
            }
            if (it.getCapacityHours() > 0) {
                meta.add("產能 " + (it.getCapacityUsagePercent() == null ? 0 : it.getCapacityUsagePercent()) + "%");
            }
        }
        if (on(f.getIterationReqTotal())) {
            meta.add("需求 " + it.getRequirementCount());
        }
        if (on(f.getIterationReqTodayDue()) && it.getTodayDueReqCount() > 0) {
            meta.add("今日到期 " + it.getTodayDueReqCount());
        }
        if (on(f.getIterationReqOverdue()) && it.getOverdueReqCount() > 0) {
            meta.add("逾期 " + it.getOverdueReqCount());
        }
        if (on(f.getIterationPeriod()) && StringUtils.hasText(it.getStartDate())
                && StringUtils.hasText(it.getEndDate())) {
            meta.add(it.getStartDate() + "~" + it.getEndDate());
        }
        if (!meta.isEmpty()) {
            sb.append('（').append(String.join("｜", meta)).append('）');
        }
        sb.append('\n');
        return sb.toString();
    }

    /** 未挂项目迭代块：卡片里只列迭代行，标题用加粗而不是三级标题（卡片正文不靠字号分层） */
    private String cardUnassigned(List<IterationNode> unassigned, MessageFieldOptions f) {
        if (unassigned == null || unassigned.isEmpty()) {
            return "";
        }
        StringBuilder sb = new StringBuilder("\n🧩 **未掛項目的迭代 ")
                .append(unassigned.size()).append(" 個**\n");
        for (IterationNode it : unassigned) {
            sb.append(fixedIterationLine(it, f, "- "));
        }
        return sb.toString();
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
        out = out.replace(RdmDailyReportTemplates.PH_USER_NAME, safe(p.userName()));
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
