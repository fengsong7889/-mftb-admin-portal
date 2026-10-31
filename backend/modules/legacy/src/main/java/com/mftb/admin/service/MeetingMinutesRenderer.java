package com.mftb.admin.service;

import com.mftb.admin.constant.MeetingConstants;
import com.mftb.admin.dto.MeetingMinutesContent;
import com.mftb.admin.dto.MeetingMinutesDocument;
import com.mftb.admin.entity.MeetingMinutes;
import com.mftb.admin.entity.MeetingMinutesItem;
import com.mftb.admin.entity.MeetingMinutesLink;
import com.mftb.admin.util.JsonUtils;
import org.springframework.util.StringUtils;

import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 纪要 → 钉钉卡片的唯一渲染出口（v2：模板优先，代码内置文案兜底）。
 *
 * <p>渲染走两段：先把会议/纪要/事项压成一组变量（${meetingTitle}、${actions}…），
 * 再交给 {@link MeetingNotifyTemplateService#render} 套模板；模板缺失或停用时回落到本类的内置文案。
 * 这样"改文案"只需改模板，而"模板改坏了"也不会让通知发不出去。
 *
 * <p>三条钉钉侧硬约束写死在这里：
 * <ol>
 *   <li><b>markdown 不支持表格与字体颜色</b>：负责人统一 `👤 **姓名（工号）**`、事项按状态加 ✅/⏳/❗；</li>
 *   <li><b>正文约 4000 字符上限</b>：超过 {@link MeetingConstants#MINUTES_MARKDOWN_MAX_CHARS} 折叠为
 *       「摘要 + 行动项 + 链接」，而不是让渠道静默截断；</li>
 *   <li><b>同一员工当天相同内容只投一条</b>：尾注必带批次号与发送时刻。</li>
 * </ol>
 */
public final class MeetingMinutesRenderer {

    private static final DateTimeFormatter SEND_TIME = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");
    private static final String TITLE_PREFIX = "【會議紀要】";

    private MeetingMinutesRenderer() {
    }

    /** 渲染结果：标题、正文、是否被折叠、原始长度 */
    public record Rendered(String title, String markdown, boolean truncated, int fullLength) {
    }

    public static String title(MeetingMinutes minutes) {
        String subject = StringUtils.hasText(minutes.getMeetingTitle()) ? minutes.getMeetingTitle() : minutes.getMinutesNo();
        return TITLE_PREFIX + subject;
    }

    /**
     * 渲染卡片正文。
     *
     * @param minutes  纪要主体（会议資訊快照与议题/缺席/备注都在这里）
     * @param items    行动项与跟进事项（v2 起独立成表；旧数据已由迁移回填）
     * @param links    关联纪要（带来源快照）
     * @param template 模板服务；为 null 时直接用内置文案（单测与兜底路径）
     */
    public static Rendered render(MeetingMinutes minutes, List<MeetingMinutesItem> items,
                                  List<MeetingMinutesLink> links, int batchSeq, String sentText,
                                  String sender, String viewUrl, MeetingNotifyTemplateService template) {
        MeetingMinutesContent content = parse(minutes);
        Map<String, String> vars = variables(minutes, content, items, links, batchSeq, sentText, sender, viewUrl);

        if (template != null) {
            MeetingNotifyTemplateService.Rendered rendered =
                    template.render(MeetingConstants.SCENARIO_MINUTES, vars);
            if (rendered != null && StringUtils.hasText(rendered.body())) {
                String body = rendered.body();
                if (body.length() > MeetingConstants.MINUTES_MARKDOWN_MAX_CHARS) {
                    return new Rendered(rendered.title(), compact(minutes, content, items, vars), true, body.length());
                }
                return new Rendered(rendered.title(), body, false, body.length());
            }
        }

        String full = fallback(minutes, content, items, links, batchSeq, sentText, sender, viewUrl);
        if (full.length() > MeetingConstants.MINUTES_MARKDOWN_MAX_CHARS) {
            return new Rendered(title(minutes), compact(minutes, content, items, vars), true, full.length());
        }
        return new Rendered(title(minutes), full, false, full.length());
    }

    /** 新通知只从正式文档生成，不提供正文、名单或缺席原因给模板。
     *
     * <p>格式与会议邀约推送保持一致：标题灰色、正文黑色；标题为「会议名称(会议纪要)」，
     * 正文简洁只写重点：会议时间、记录人、议题/行动/跟进数量。
     */
    public static Rendered publishedCard(MeetingMinutesDocument document, int batchSeq,
                                          MeetingNotifyTemplateService templates) {
        MeetingMinutesContent content = document.getContent();
        Map<String, String> vars = new LinkedHashMap<>();
        vars.put("meetingTitle", cardText(document.getMeetingTitle(), 100));
        vars.put("meetingTime", cardText(document.getMeetingTimeText(), 80));
        vars.put("recorder", cardText(document.getRecorderName(), 64));
        vars.put("minutesNo", cardText(document.getMinutesNo(), 40));
        vars.put("revisionNo", String.valueOf(document.getRevisionNo()));
        vars.put("topicCount", String.valueOf(content.getItems() == null ? 0 : content.getItems().size()));
        vars.put("actionCount", String.valueOf(content.getActions() == null ? 0 : content.getActions().size()));
        vars.put("followCount", String.valueOf(content.getOpenIssues() == null ? 0 : content.getOpenIssues().size()));
        // 标题格式：会议名称(会议纪要)，与会议邀约推送风格一致（灰色标题）
        String title = vars.get("meetingTitle") + "(会议纪要)";
        // 正文简洁：会议时间 + 记录人 + 议题/行动/跟进数量
        String fallback = "會議時間：" + vars.get("meetingTime") + "\n"
                + "記錄人：" + vars.get("recorder") + "\n\n"
                + "議題 " + vars.get("topicCount") + " 項 · 行動 " + vars.get("actionCount")
                + " 項 · 跟進 " + vars.get("followCount") + " 項";
        MeetingNotifyTemplateService.Rendered custom = templates == null ? null
                : templates.render(MeetingConstants.SCENARIO_MINUTES_PUBLISHED, vars);
        String body = custom == null || !StringUtils.hasText(custom.body()) ? fallback : custom.body();
        boolean shortened = body.length() > MeetingConstants.MINUTES_CARD_MAX_CHARS;
        if (shortened) body = fallback;
        return new Rendered(title, body, shortened, body.length());
    }

    /** 业务输入是纯文本，不能借会议主题注入链接、图片或 Markdown 层级。 */
    private static String cardText(String value, int limit) {
        String text = nullToEmpty(value).replaceAll("[\\r\\n\\t]", " ")
                .replaceAll("[\\\\`*_{}\\[\\]<>#!]", " ");
        return text.length() > limit ? text.substring(0, limit) : text;
    }

    /* ==================== 变量 ==================== */

    /**
     * 把渲染所需的一切压成占位符变量。
     * <p>未知变量在模板里会被清空，因此这里宁可多给几个空串，也不要让管理员看到 `${xxx}` 字面量。
     */
    public static Map<String, String> variables(MeetingMinutes minutes, MeetingMinutesContent content,
                                                List<MeetingMinutesItem> items, List<MeetingMinutesLink> links,
                                                int batchSeq, String sentText, String sender, String viewUrl) {
        Map<String, String> vars = new LinkedHashMap<>();
        vars.put("meetingTitle", nullToEmpty(minutes.getMeetingTitle()));
        vars.put("meetingNo", nullToEmpty(minutes.getBookingNo()));
        vars.put("minutesNo", nullToEmpty(minutes.getMinutesNo()));
        vars.put("meetingTime", nullToEmpty(minutes.getMeetingTimeText()));
        vars.put("roomName", nullToEmpty(minutes.getRoomText()));
        vars.put("organizer", nullToEmpty(minutes.getOrganizerName()));
        vars.put("recorder", nullToEmpty(minutes.getRecorderName())
                + (StringUtils.hasText(minutes.getRecorderEmpNo()) ? "（" + minutes.getRecorderEmpNo() + "）" : ""));
        vars.put("agenda", agendaBlock(content));
        vars.put("actions", itemBlock(items, MeetingMinutesItem.KIND_ACTION));
        vars.put("followUps", itemBlock(items, MeetingMinutesItem.KIND_FOLLOW));
        vars.put("absenteeLine", absenteeLine(content));
        vars.put("nextMeetingLine", nextMeetingLine(content));
        vars.put("remarkLine", remarkLine(content));
        vars.put("linksLine", linksLine(links));
        vars.put("batchNote", batchNote(batchSeq, sentText, sender));
        vars.put("viewUrl", nullToEmpty(viewUrl));
        return vars;
    }

    /** 议题与结论：有序列表，结论单独一行加粗（卡片上扫一眼就能看到定了什么） */
    private static String agendaBlock(MeetingMinutesContent content) {
        if (content.getItems() == null || content.getItems().isEmpty()) {
            return "（無議題）";
        }
        StringBuilder sb = new StringBuilder();
        int index = 0;
        for (MeetingMinutesContent.Item item : content.getItems()) {
            index++;
            sb.append(index).append(". **").append(nullToEmpty(item.getTopic())).append("**\n");
            if (StringUtils.hasText(item.getDiscussion())) {
                sb.append("   討論：").append(item.getDiscussion().trim()).append("\n");
            }
            if (StringUtils.hasText(item.getConclusion())) {
                sb.append("   結論：**").append(item.getConclusion().trim()).append("**\n");
            }
        }
        return sb.toString().trim();
    }

    /**
     * 事项列表：负责人用 `👤 **姓名（工号）**` 独立凸显（钉钉不支持字体颜色，只能用加粗+符号），
     * 状态用 ✅/⏳/❗ 三个符号，处理结果与说明跟在后面。
     */
    private static String itemBlock(List<MeetingMinutesItem> items, String kind) {
        if (items == null || items.isEmpty()) {
            return "（無）";
        }
        StringBuilder sb = new StringBuilder();
        for (MeetingMinutesItem item : items) {
            if (!kind.equals(item.getKind())) {
                continue;
            }
            sb.append("- ").append(statusIcon(item)).append(" ").append(nullToEmpty(item.getContent()));
            if (StringUtils.hasText(item.getOwnerName())) {
                sb.append("｜👤 **").append(item.getOwnerName());
                if (StringUtils.hasText(item.getOwnerEmpNo())) {
                    sb.append("（").append(item.getOwnerEmpNo()).append("）");
                }
                sb.append("**");
            } else {
                sb.append("｜👤 **未指定負責人**");
            }
            if (item.getDueDate() != null) {
                sb.append("｜截止 **").append(item.getDueDate()).append("**");
            }
            if (MeetingMinutesItem.STATUS_DONE.equals(item.getStatus())) {
                sb.append("｜").append(resultLabel(item.getResult()));
                if (StringUtils.hasText(item.getResolutionNote())) {
                    sb.append("（").append(item.getResolutionNote()).append("）");
                }
            } else if (item.getDueDate() != null && item.getDueDate().isBefore(java.time.LocalDate.now())) {
                sb.append("｜❗已逾期");
            }
            sb.append("\n");
        }
        return sb.length() == 0 ? "（無）" : sb.toString().trim();
    }

    private static String statusIcon(MeetingMinutesItem item) {
        if (MeetingMinutesItem.STATUS_DONE.equals(item.getStatus())) {
            return MeetingMinutesItem.RESULT_CANNOT.equals(item.getResult()) ? "❗" : "✅";
        }
        return "⏳";
    }

    public static String resultLabel(String result) {
        if (result == null) {
            return "已完成";
        }
        return switch (result) {
            case MeetingMinutesItem.RESULT_COMPLETED -> "已完成";
            case MeetingMinutesItem.RESULT_PARTIAL -> "部分完成";
            case MeetingMinutesItem.RESULT_CANNOT -> "無法完成";
            default -> "已完成";
        };
    }

    private static String absenteeLine(MeetingMinutesContent content) {
        List<MeetingMinutesContent.Absentee> absentees = content.getAbsentees();
        if (absentees == null || absentees.isEmpty()) {
            return "";
        }
        return "缺席：**" + absentees.size() + " 人**（明細見完整紀要）\n";
    }

    private static String nextMeetingLine(MeetingMinutesContent content) {
        if (!StringUtils.hasText(content.getNextMeetingAt()) && !StringUtils.hasText(content.getNextMeetingNote())) {
            return "";
        }
        StringBuilder sb = new StringBuilder("**下次會議**\n");
        if (StringUtils.hasText(content.getNextMeetingAt())) {
            sb.append("- 時間：**").append(content.getNextMeetingAt().trim()).append("**\n");
        }
        if (StringUtils.hasText(content.getNextMeetingNote())) {
            sb.append("- 議程：").append(content.getNextMeetingNote().trim()).append("\n");
        }
        return sb.toString();
    }

    private static String remarkLine(MeetingMinutesContent content) {
        if (!StringUtils.hasText(content.getRemark())) {
            return "";
        }
        return "**補充說明**\n" + content.getRemark().trim() + "\n";
    }

    /** 关联纪要：明确标注"引自哪场会"，否则收件人会把别人的结论当成这场会的 */
    private static String linksLine(List<MeetingMinutesLink> links) {
        if (links == null || links.isEmpty()) {
            return "";
        }
        StringBuilder sb = new StringBuilder("\n**關聯紀要（引自其它會議）**\n");
        for (MeetingMinutesLink link : links) {
            sb.append("- ").append(nullToEmpty(link.getLinkedTitle()))
                    .append("（").append(nullToEmpty(link.getLinkedBookingNo())).append(" · ")
                    .append(nullToEmpty(link.getLinkedTimeText())).append("）\n");
        }
        return sb.toString();
    }

    private static String batchNote(int batchSeq, String sentText, String sender) {
        StringBuilder sb = new StringBuilder("———\n第 ").append(batchSeq).append(" 次發送");
        if (StringUtils.hasText(sentText)) {
            sb.append(" · ").append(sentText);
        }
        if (StringUtils.hasText(sender)) {
            sb.append(" · 由 ").append(sender).append(" 發送");
        }
        return sb.toString();
    }

    /* ==================== 内置兜底文案 ==================== */

    private static String fallback(MeetingMinutes minutes, MeetingMinutesContent content,
                                   List<MeetingMinutesItem> items, List<MeetingMinutesLink> links,
                                   int batchSeq, String sentText, String sender, String viewUrl) {
        StringBuilder sb = new StringBuilder();
        sb.append("**").append(TITLE_PREFIX).append(nullToEmpty(minutes.getMeetingTitle())).append("**\n\n");
        sb.append("會議單號：").append(nullToEmpty(minutes.getBookingNo()))
                .append("｜紀要單號：").append(nullToEmpty(minutes.getMinutesNo())).append("\n");
        sb.append("會議時間：").append(nullToEmpty(minutes.getMeetingTimeText())).append("\n");
        sb.append("會議室：").append(nullToEmpty(minutes.getRoomText())).append("\n");
        sb.append("組織者：**").append(nullToEmpty(minutes.getOrganizerName()))
                .append("**｜記錄人：**").append(nullToEmpty(minutes.getRecorderName())).append("**\n");
        sb.append(absenteeLine(content));
        sb.append("\n**議程與結論**\n").append(agendaBlock(content)).append("\n");
        sb.append("\n**行動項**\n").append(itemBlock(items, MeetingMinutesItem.KIND_ACTION)).append("\n");
        sb.append("\n**跟進事項**\n").append(itemBlock(items, MeetingMinutesItem.KIND_FOLLOW)).append("\n");
        sb.append(nextMeetingLine(content));
        sb.append(remarkLine(content));
        sb.append(linksLine(links));
        sb.append("\n").append(batchNote(batchSeq, sentText, sender)).append("\n");
        if (StringUtils.hasText(viewUrl)) {
            sb.append("[查看完整紀要](").append(viewUrl).append(")");
        }
        return sb.toString();
    }

    /** 折叠版：摘要 + 行动项 + 链接（正文再长也不该把结论挤出渠道上限） */
    private static String compact(MeetingMinutes minutes, MeetingMinutesContent content,
                                  List<MeetingMinutesItem> items, Map<String, String> vars) {
        StringBuilder sb = new StringBuilder();
        sb.append("**").append(TITLE_PREFIX).append(nullToEmpty(minutes.getMeetingTitle())).append("**\n\n");
        if (StringUtils.hasText(minutes.getMinutesNo())) {
            sb.append("紀要單號：").append(minutes.getMinutesNo()).append("\n\n");
        }
        String digest = content.digest();
        if (StringUtils.hasText(digest)) {
            sb.append("**結論**\n").append(digest).append("\n\n");
        }
        sb.append("**行動項**\n").append(itemBlock(items, MeetingMinutesItem.KIND_ACTION)).append("\n\n");
        String viewUrl = vars.get("viewUrl");
        if (StringUtils.hasText(viewUrl)) {
            sb.append("[查看完整紀要](").append(viewUrl).append(")\n");
        }
        sb.append(vars.get("batchNote"));
        return sb.toString();
    }

    private static MeetingMinutesContent parse(MeetingMinutes minutes) {
        MeetingMinutesContent content = JsonUtils.parse(minutes.getContentJson(), MeetingMinutesContent.class);
        return content == null ? new MeetingMinutesContent() : content;
    }

    private static String nullToEmpty(String value) {
        return value == null ? "" : value;
    }

    /** 发送时刻的统一格式（尾注与快照都用它，避免两处格式串不一致） */
    public static String formatSendTime(java.time.LocalDateTime value) {
        return value == null ? "" : SEND_TIME.format(value);
    }

    /** 供调度/外部拼装：把事项按类型分组（保持 seq 顺序） */
    public static List<MeetingMinutesItem> ofKind(List<MeetingMinutesItem> items, String kind) {
        if (items == null) {
            return List.of();
        }
        List<MeetingMinutesItem> out = new ArrayList<>();
        for (MeetingMinutesItem item : items) {
            if (kind.equals(item.getKind())) {
                out.add(item);
            }
        }
        return out;
    }
}
