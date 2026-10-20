package com.mftb.admin.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.mftb.admin.common.BusinessException;
import lombok.Data;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.List;

/**
 * 会议纪要正文（落 {@code biz_meeting_minutes.content_json} 的结构化模板）。
 *
 * <p>为什么用固定分区而不是一个大文本框：纪要要能渲染成钉钉卡片、要被摘要列引用、
 * 行动项将来要能被跟进；自由文本一进去，这三件事都得靠猜。分区字段一旦定下来，
 * 前端表单、后端渲染、免登页展示讲的是同一份结构。
 *
 * <p><b>校验一律在服务层完成，不信前端</b>：长度、条数、日期格式都在这里校，
 * {@code @JsonIgnoreProperties(ignoreUnknown=false)} 的语义由字段白名单承担——
 * 请求体里多余的键（例如试图自报的 recorderUserId）不该有地方生效。
 */
@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class MeetingMinutesContent {

    /** 议题条数上限：一场会超过 20 个议题时该拆会，而不是把纪要写成文档 */
    public static final int MAX_ITEMS = 20;
    public static final int MAX_ACTIONS = 30;
    public static final int MAX_ISSUES = 20;
    public static final int MAX_ABSENTS = 50;

    public static final int TOPIC_MAX = 100;
    public static final int TEXT_MAX = 500;
    public static final int ACTION_MAX = 300;
    public static final int SHORT_MAX = 200;
    public static final int NAME_MAX = 64;
    /** 正文总字数上限：列是 TEXT(65535)，留一半余量给 JSON 结构与人员快照 */
    public static final int CONTENT_MAX = 8000;

    /** 议题与结论（至少一条，或行动项至少一条） */
    private List<Item> items = new ArrayList<>();
    /** 行动项 */
    private List<Action> actions = new ArrayList<>();
    /** 未决事项 */
    private List<OpenIssue> openIssues = new ArrayList<>();
    /** 缺席/未到场人员 */
    private List<Absentee> absentees = new ArrayList<>();
    /** 下次会议时间，'yyyy-MM-dd HH:mm' 字符串（由前端格式化，服务端只校格式不猜时区） */
    private String nextMeetingAt;
    private String nextMeetingNote;
    /** 补充说明 */
    private String remark;

    /**
     * 附件预留位（一期不启用）：方案明确“一期不做附件/图片”，但预留字段避免后续加附件时
     * 改 content_json 的结构版本。任何一期代码都不读写它。
     */
    private List<String> attachments;

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Item {
        private String topic;
        private String discussion;
        private String conclusion;
    }

    /**
     * 行动项。
     * <p>{@code ownerUserId} 是唯一入库的身份字段，姓名与工号是服务端按 id 回查的快照：
     * 与行政代订同一口径，前端自报名字等于允许伪造台账。
     */
    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Action {
        private String content;
        private Long ownerUserId;
        private String ownerName;
        private String ownerEmpNo;
        /** 'yyyy-MM-dd' */
        private String dueDate;
    }

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class OpenIssue {
        private String content;
        private String needDecisionBy;
    }

    /** 缺席人员：可以是系统内员工（有 userId），也可以是只留姓名快照的外部人员 */
    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Absentee {
        private Long userId;
        private String name;
        private String empNo;
        private String reason;
    }

    /* ==================== 服务端校验 ==================== */

    /**
     * 结构校验：拒绝空纪要、超长文本与非法日期。
     *
     * <p>失败信息面向业务（说清是哪一项超了），不回显整段正文。
     */
    public void validate() {
        List<Item> safeItems = items == null ? List.of() : items;
        List<Action> safeActions = actions == null ? List.of() : actions;
        if (safeItems.isEmpty() && safeActions.isEmpty()) {
            throw new BusinessException("請至少填寫一項議題與結論或行動項");
        }
        if (safeItems.size() > MAX_ITEMS) {
            throw new BusinessException("議題最多 " + MAX_ITEMS + " 條");
        }
        if (safeActions.size() > MAX_ACTIONS) {
            throw new BusinessException("行動項最多 " + MAX_ACTIONS + " 條");
        }
        if (openIssues != null && openIssues.size() > MAX_ISSUES) {
            throw new BusinessException("未決事項最多 " + MAX_ISSUES + " 條");
        }
        if (absentees != null && absentees.size() > MAX_ABSENTS) {
            throw new BusinessException("缺席人員最多 " + MAX_ABSENTS + " 位");
        }
        int index = 0;
        for (Item item : safeItems) {
            index++;
            if (!StringUtils.hasText(item.getTopic())) {
                throw new BusinessException("第 " + index + " 條議題缺少標題");
            }
            requireWithin(item.getTopic(), TOPIC_MAX, "議題標題");
            requireWithin(item.getDiscussion(), TEXT_MAX, "討論要點");
            requireWithin(item.getConclusion(), TEXT_MAX, "結論");
        }
        int actionIndex = 0;
        for (Action action : safeActions) {
            actionIndex++;
            if (!StringUtils.hasText(action.getContent())) {
                throw new BusinessException("第 " + actionIndex + " 條行動項缺少內容");
            }
            requireWithin(action.getContent(), ACTION_MAX, "行動項");
            requireDate(action.getDueDate(), "yyyy-MM-dd", "行動項完成時限");
        }
        if (openIssues != null) {
            for (OpenIssue issue : openIssues) {
                requireWithin(issue.getContent(), ACTION_MAX, "未決事項");
                requireWithin(issue.getNeedDecisionBy(), SHORT_MAX, "決策人");
            }
        }
        if (absentees != null) {
            for (Absentee absentee : absentees) {
                requireWithin(absentee.getName(), NAME_MAX, "缺席人員姓名");
                requireWithin(absentee.getReason(), SHORT_MAX, "缺席原因");
            }
        }
        requireDate(nextMeetingAt, "yyyy-MM-dd HH:mm", "下次會議時間");
        requireWithin(nextMeetingNote, SHORT_MAX, "下次會議議程預告");
        requireWithin(remark, SHORT_MAX, "補充說明");
        if (contentLength() > CONTENT_MAX) {
            throw new BusinessException("紀要正文 " + contentLength() + " 字，已超過 " + CONTENT_MAX + " 字上限");
        }
    }

    /** 正文总字数（不含 JSON 语法字符），用于长度上限判定 */
    public int contentLength() {
        int sum = 0;
        if (items != null) {
            for (Item item : items) {
                sum += length(item.getTopic()) + length(item.getDiscussion()) + length(item.getConclusion());
            }
        }
        if (actions != null) {
            for (Action action : actions) {
                sum += length(action.getContent()) + length(action.getOwnerName());
            }
        }
        if (openIssues != null) {
            for (OpenIssue issue : openIssues) {
                sum += length(issue.getContent()) + length(issue.getNeedDecisionBy());
            }
        }
        if (absentees != null) {
            for (Absentee absentee : absentees) {
                sum += length(absentee.getName()) + length(absentee.getReason());
            }
        }
        return sum + length(nextMeetingNote) + length(remark);
    }

    /**
     * 摘要：首条结论，其次首条议题标题，都没有就是空串。
     * 落独立列是为了列表页与钉钉卡片能直接读，不必在 SQL 里解析 JSON。
     */
    public String digest() {
        if (items != null) {
            for (Item item : items) {
                if (StringUtils.hasText(item.getConclusion())) {
                    return truncate(item.getConclusion().trim(), 300);
                }
            }
            for (Item item : items) {
                if (StringUtils.hasText(item.getTopic())) {
                    return truncate(item.getTopic().trim(), 300);
                }
            }
        }
        if (actions != null && !actions.isEmpty() && StringUtils.hasText(actions.get(0).getContent())) {
            return truncate(actions.get(0).getContent().trim(), 300);
        }
        return "";
    }

    private static void requireWithin(String value, int max, String label) {
        if (value != null && value.trim().length() > max) {
            throw new BusinessException(label + "不得超過 " + max + " 字");
        }
    }

    private static void requireDate(String value, String pattern, String label) {
        if (!StringUtils.hasText(value)) {
            return;
        }
        String regex = "yyyy-MM-dd".equals(pattern)
                ? "\\d{4}-\\d{2}-\\d{2}"
                : "\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}";
        if (!value.trim().matches(regex)) {
            throw new BusinessException(label + "格式應為 " + pattern);
        }
    }

    private static int length(String value) {
        return value == null ? 0 : value.trim().length();
    }

    private static String truncate(String value, int max) {
        return value.length() > max ? value.substring(0, max) : value;
    }
}
