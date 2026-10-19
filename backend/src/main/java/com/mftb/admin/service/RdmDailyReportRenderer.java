package com.mftb.admin.service;

import com.mftb.admin.constant.RdmDailyReportTemplates;
import com.mftb.admin.dto.RdmDailyReportVO.IterationNode;
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

        // 层级片段最后填：它本身含 markdown 结构，不能被当作普通文本二次转义
        content = content
                .replace(RdmDailyReportTemplates.PH_PROJECT_BLOCK,
                        projectBlock(projects, MAX_PROJECTS_IN_GROUP, GROUP_CONTENT_LIMIT))
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
