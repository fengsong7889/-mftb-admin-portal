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
     *
     * <p><b>无异常日直接收敛成一句话</b>：与降噪 brief 复用同一段文案，不再输出
     * 「全部 N 個項目進展正常」再逐条铺开迭代明细——群里每天刷屏几十行，真正出事那天
     * 反而没人看。正常的迭代明细属于看板，消息里只保留计数。
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

        // 无异常日：项目与未挂迭代都没有要处理的事，一句话收口，不列任何明细
        if (!iterationOnly && attention.isEmpty()
                && unassigned.stream().noneMatch(RdmDailyReportRenderer::iterationHasIssue)) {
            return renderGroupQuiet(snapshot, evening, detailUrl);
        }

        StringBuilder sb = new StringBuilder();
        // 指标行与下方项目块之间必须留空行：钉钉 markdown 把连续单换行归并成一段，
        // 不加空行时「在途 6｜…」会和「需關注 N 個項目」粘成一行
        sb.append(cardMetrics(snapshot, evening)).append("\n\n");
        if (iterationOnly) {
            // 迭代视角只有这一个迭代：无异常也要列出，否则消息里看不到任何内容
            sb.append(cardUnassigned(unassigned, f, true));
        } else {
            // 无关注项目时只给一句肯定句：先输出空占位再跟一行「其餘 N 個正常」会重复两次绿色结论
            if (attention.isEmpty()) {
                sb.append("🟢 **在途 ").append(projects.size()).append(" 個項目進展正常**\n");
            } else {
                sb.append(cardAttentionProjects(attention, snapshot, f));
                int normal = projects.size() - attention.size();
                if (normal > 0) {
                    sb.append("\n🟢 其餘 ").append(normal).append(" 個項目進展正常\n");
                }
            }
            sb.append(cardUnassigned(unassigned, f, false));
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
     *
     * <p>正文同样不署收件人姓名，理由见 {@link #renderPersonalQuiet}：追加收件人拿到的项目
     * 不等于其本人负责的项目，署名会把「规则范围」误读成「某个人的工作汇报」。
     */
    public Rendered renderPersonalFixed(Snapshot snapshot, String detailUrl, boolean evening,
                                        PersonalView personal, MessageFieldOptions fields) {
        MessageFieldOptions f = fields == null ? DEFAULT_FIELDS : fields;
        List<ProjectNode> mine = personal == null || personal.projects() == null ? List.of() : personal.projects();
        int overdue = personal == null ? 0 : personal.overdueItemCount();
        int todayDue = personal == null ? 0 : personal.todayDueItemCount();
        int urgent = overdue + todayDue;

        StringBuilder sb = new StringBuilder();
        sb.append("**")
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

    /**
     * 群报卡片标题：日期 + 档位 + 结论（到期/逾期/风险计数），无异常时直说无异常。
     *
     * <p><b>口径必须覆盖正文</b>：标题只算 {@code summary} 会出现「标题说今日無異常、正文却列着
     * 红灯」的分裂——未挂项目迭代的逾期/今日到期需求记在迭代节点上，不在 summary 的交付项口径里；
     * 晨报的今日到期同样不进 summary 的逾期口径。三处相加才与正文一致。
     */
    private String cardGroupTitle(Snapshot snapshot, boolean evening) {
        String head = "產研交付日報 " + shortDate(snapshot) + (evening ? " 晚報" : " 晨報");
        Summary s = summaryOf(snapshot);
        List<IterationNode> unassigned = snapshot == null || snapshot.getUnassignedIterations() == null
                ? List.of() : snapshot.getUnassignedIterations();
        int unassignedOverdue = unassigned.stream().filter(it -> it != null)
                .mapToInt(IterationNode::getOverdueReqCount).sum();
        int unassignedTodayDue = unassigned.stream().filter(it -> it != null)
                .mapToInt(IterationNode::getTodayDueReqCount).sum();
        int overdue = s.getOverdueItemCount() + unassignedOverdue;
        int risk = s.getRiskProjectCount();
        // 晚报看的是明日到期，迭代节点没有明日口径，只并晨报的今日到期
        int due = evening ? s.getTomorrowDueItemCount() : s.getTodayDueItemCount() + unassignedTodayDue;
        if (overdue <= 0 && risk <= 0 && due <= 0) {
            return head + "｜今日無異常";
        }
        List<String> parts = new ArrayList<>();
        if (due > 0) {
            parts.add((evening ? "明日到期 " : "今日到期 ") + due);
        }
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

    /** 正文里的短日期（MM-dd）：同一理由，且「2026-10-17~2026-10-31」这种整段会吃掉半行 */
    private static String shortDay(String date) {
        if (!StringUtils.hasText(date)) {
            return "";
        }
        return date.length() >= 10 ? date.substring(5) : date;
    }

    /**
     * 群报指标行：限定单位避免「2」到底是项目还是交付项 —— 逾期/到期是项，风险是项目。
     *
     * <p><b>只显示有值的指标</b>：一行「在途 8｜今日到期 0 項｜✅ 逾期 0 項｜✅ 風險 0 個」
     * 四个指标全铺开时，读者要逐个读完才知道「今天没事」；0 值在这里没有信息量，
     * 反而把真正非零的那一项埋掉了。异常计数为空时整行只剩在途数。
     */
    private String cardMetrics(Snapshot snapshot, boolean evening) {
        Summary s = summaryOf(snapshot);
        List<String> parts = new ArrayList<>();
        parts.add("在途 " + s.getProjectCount());
        if (evening) {
            if (s.getTodayDoneItemCount() > 0) {
                parts.add("今日完成 " + s.getTodayDoneItemCount() + " 項");
            }
            if (s.getTodayReleasedCount() > 0) {
                parts.add("今日上線 " + s.getTodayReleasedCount() + " 個");
            }
        } else if (s.getTodayDueItemCount() > 0) {
            parts.add("🟡 今日到期 " + s.getTodayDueItemCount() + " 項");
        }
        if (s.getOverdueItemCount() > 0) {
            parts.add("🔴 逾期 " + s.getOverdueItemCount() + " 項");
        }
        if (s.getRiskProjectCount() > 0) {
            parts.add("🟠 風險 " + s.getRiskProjectCount() + " 個");
        }
        return "**" + String.join("｜", parts) + "**";
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
            parts.add("週期 " + shortDay(p.getPlanStartDate()) + "~" + shortDay(p.getPlanEndDate()));
        }
        if (on(f.getProjectNextDelivery()) && StringUtils.hasText(p.getNextDeliveryDate())) {
            parts.add("下次交付 " + shortDay(p.getNextDeliveryDate()));
        }
        /*
         * 逾期/阻塞是异常角标，不受开关控制：这一行之所以出现在「需關注」里，读者必须能立刻
         * 看到严重程度；关掉开关只显示一个红灯、不给数量，等于让人回去翻看板。
         * 只拼非零项，避免出现「逾期 0｜阻塞 1」这种噪音。
         */
        List<String> abnormal = new ArrayList<>();
        if (p.getDeliveryItemOverdue() > 0) {
            abnormal.add("逾期 " + p.getDeliveryItemOverdue() + " 項");
        }
        if (p.getDeliveryItemBlocked() > 0) {
            abnormal.add("阻塞 " + p.getDeliveryItemBlocked() + " 項");
        }
        if (!abnormal.isEmpty()) {
            parts.add(String.join("｜", abnormal));
        }
        return String.join("｜", parts);
    }

    /**
     * 迭代行：code + 名称必显（框架），其余字段按开关拼接。
     *
     * <p>精简规则：
     * <ul>
     *   <li>逾期/今日到期是<b>异常角标，不受开关控制</b>——否则关掉开关后，这一行为什么被列出来
     *       就完全看不出来了；只拼非零项；</li>
     *   <li>進度/產能只在有值时输出：每行拖一个「產能 0%」纯属噪音；</li>
     *   <li>日期区间压成 {@code MM-dd~MM-dd}，年份对日报是冗余信息。</li>
     * </ul>
     */
    private String fixedIterationLine(IterationNode it, MessageFieldOptions f, String bullet) {
        if (it == null) {
            return "";
        }
        boolean overdue = it.getOverdueReqCount() > 0;
        boolean todayDue = it.getTodayDueReqCount() > 0;
        StringBuilder sb = new StringBuilder(bullet);
        if (overdue) {
            sb.append("🔴 ");
        } else if (todayDue) {
            sb.append("🟡 ");
        }
        sb.append(safe(nullToDash(it.getCode())));
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
            if (it.getProgressPercent() != null && it.getProgressPercent() > 0) {
                meta.add("進度 " + it.getProgressPercent() + "%");
            }
            if (it.getCapacityHours() > 0 && it.getCapacityUsagePercent() != null
                    && it.getCapacityUsagePercent() > 0) {
                meta.add("產能 " + it.getCapacityUsagePercent() + "%");
            }
        }
        // 需求 0 不进消息：它不是行动项，只会在每行拖一个零
        if (on(f.getIterationReqTotal()) && it.getRequirementCount() > 0) {
            meta.add("需求 " + it.getRequirementCount());
        }
        if (todayDue) {
            meta.add("今日到期 " + it.getTodayDueReqCount());
        }
        if (overdue) {
            meta.add("逾期 " + it.getOverdueReqCount());
        }
        if (on(f.getIterationPeriod()) && StringUtils.hasText(it.getStartDate())
                && StringUtils.hasText(it.getEndDate())) {
            meta.add(shortDay(it.getStartDate()) + "~" + shortDay(it.getEndDate()));
        }
        if (!meta.isEmpty()) {
            sb.append('（').append(String.join("｜", meta)).append('）');
        }
        sb.append('\n');
        return sb.toString();
    }

    /** 迭代是否有要处理的事：逾期/今日到期需求。判定不看字段开关，开关只影响展示多少字段 */
    private static boolean iterationHasIssue(IterationNode it) {
        return it != null && (it.getOverdueReqCount() > 0 || it.getTodayDueReqCount() > 0);
    }

    /**
     * 未挂项目迭代块。
     *
     * <p><b>为何默认只列异常的</b>：未挂项目的迭代往往十几条，逐条铺开就是刷屏，而群里读者
     * 要判断的是「有没有事」；正常迭代的排版、进度属于看板。全部正常时压成一行计数。
     *
     * @param forceDetail 迭代视角（规则只盯一个未挂迭代）必须展开，否则消息里没有任何内容
     */
    private String cardUnassigned(List<IterationNode> unassigned, MessageFieldOptions f, boolean forceDetail) {
        if (unassigned == null || unassigned.isEmpty()) {
            return "";
        }
        List<IterationNode> issues = unassigned.stream()
                .filter(RdmDailyReportRenderer::iterationHasIssue).toList();
        if (!forceDetail && issues.isEmpty()) {
            return "\n🧩 未掛項目的迭代 " + unassigned.size() + " 個，均無逾期\n";
        }
        List<IterationNode> lines = forceDetail ? unassigned : issues;
        StringBuilder sb = new StringBuilder("\n🧩 **未掛項目的迭代 ")
                .append(unassigned.size()).append(" 個**\n");
        for (IterationNode it : lines) {
            sb.append(fixedIterationLine(it, f, "- "));
        }
        int normal = unassigned.size() - lines.size();
        if (normal > 0) {
            sb.append("- 其餘 ").append(normal).append(" 個正常\n");
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
