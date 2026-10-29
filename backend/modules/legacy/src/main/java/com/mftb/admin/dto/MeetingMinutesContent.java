package com.mftb.admin.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.mftb.admin.common.BusinessException;
import lombok.Data;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.ResolverStyle;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;

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
    public static final int DOCUMENT_SCHEMA = 2;
    public static final int SUMMARY_MAX = 300;
    /** 合并旧目的（500 字）与摘要（300 字）时保留段落，仍受正文总长度约束。 */
    public static final int PURPOSE_MAX = 1000;
    public static final int MAX_ATTENDANCE = 100;
    /** 补充说明附件上限：与 MeetingMinutesAttachmentService.MAX_FILES 同口径 */
    public static final int MAX_ATTACHMENTS = 5;
    public static final String DECISION_DECIDED = "decided";
    public static final String DECISION_PENDING = "pending";
    public static final String DECISION_INFORMATION = "information";
    public static final String ATTENDANCE_PRESENT = "present";
    public static final String ATTENDANCE_ABSENT = "absent";
    public static final String ATTENDANCE_UNVERIFIED = "unverified";
    private static final Set<String> DECISION_STATES = Set.of(DECISION_DECIDED, DECISION_PENDING, DECISION_INFORMATION);
    private static final Set<String> ATTENDANCE_STATES = Set.of(ATTENDANCE_PRESENT, ATTENDANCE_ABSENT, ATTENDANCE_UNVERIFIED);

    /** 旧 JSON 没有结构版本时保持旧版，不追认历史发送为正式发布。 */
    private Integer schemaVersion = 1;
    private String purpose;
    /** 历史兼容字段，新版填写统一写入 purpose；读取旧快照时不迁移或改写。 */
    private String summary;
    private Long chairUserId;
    /** 人员快照必须由服务端回查，不能采信客户端署名。 */
    private String chairName;
    private String chairEmpNo;
    private List<Attendance> attendance = new ArrayList<>();

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
     * 补充说明附件：存服务端签发的附件号（32 位 hex），二进制永不入正文 JSON。
     * <p>null 与空数组语义不同：null=调用方不带附件字段（旧客户端），保存时保留既有绑定；
     * 数组（含空）=正文就该是这一组，多退少绑。落库前由服务层逐号回查真实元数据，
     * 客户端伪造的号一律拒绝——这里只校形态与条数。
     */
    private List<String> attachments;

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Item {
        private String topic;
        private String discussion;
        private String conclusion;
        /** 议题关联使用稳定键，不使用数组下标。 */
        private String topicKey;
        private String decisionStatus;
    }

    /** 出席事实和签到证据分开保存，确认人及时间由后端赋值。 */
    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Attendance {
        private Long userId;
        private String name;
        private String empNo;
        private String status;
        private String reason;
        private String source;
        private String confirmedByName;
        private String confirmedAt;
    }

    /**
     * 行动项。
     * <p>{@code ownerUserId} 是唯一入库的身份字段，姓名与工号是服务端按 id 回查的快照：
     * 与行政代订同一口径，前端自报名字等于允许伪造台账。
     */
    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Action {
        /** 新事项在发布前无主键，已发布事项必须携带原主键，不能按位置替换。 */
        private Long itemId;
        private String topicKey;
        private String deliverable;
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
        private Long itemId;
        private String topicKey;
        private Long ownerUserId;
        private String ownerName;
        private String ownerEmpNo;
        private String dueDate;
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
        if (schemaVersion == null || (schemaVersion != 1 && schemaVersion != DOCUMENT_SCHEMA)) {
            throw new BusinessException("不支援的紀要結構版本，請刷新後重試");
        }
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
        if (safeItems.stream().anyMatch(Objects::isNull) || safeActions.stream().anyMatch(Objects::isNull)
                || (openIssues != null && openIssues.stream().anyMatch(Objects::isNull))
                || (absentees != null && absentees.stream().anyMatch(Objects::isNull))) {
            throw new BusinessException("紀要內容不可包含空白資料項");
        }
        if (versioned()) validateVersionedFields();
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
        validateAttachments();
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
        if (versioned()) {
            sum += length(purpose) + length(summary);
            if (actions != null) {
                for (Action action : actions) sum += length(action.getDeliverable());
            }
            if (attendance != null) {
                for (Attendance person : attendance) sum += length(person.getName()) + length(person.getReason());
            }
        }
        return sum + length(nextMeetingNote) + length(remark);
    }

    /** 只派生展示文本，不更改旧快照；仅去除两字段完全重复的内容。 */
    public String purposeText() {
        String current = purpose == null ? "" : purpose.trim();
        String legacy = summary == null ? "" : summary.trim();
        if (current.isEmpty()) return legacy;
        if (legacy.isEmpty() || current.equals(legacy)) return current;
        return current + "\n\n" + legacy;
    }

    /**
     * 列表摘要优先取统一会议目的，再回退至首条结论、议题或行动项。
     * 独立摘要列仍限制 300 字，不截断正文或历史快照。
     */
    public String digest() {
        if (versioned() && StringUtils.hasText(purposeText())) return truncate(purposeText(), SUMMARY_MAX);
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

    public boolean versioned() {
        return Integer.valueOf(DOCUMENT_SCHEMA).equals(schemaVersion);
    }

    /** 草稿允许逐步填写，发布时要求会议目的、主持人和完整责任分配；兼容旧摘要。 */
    public void validateForPublication() {
        validate();
        if (!versioned()) throw new BusinessException("請先使用新版模板保存紀要");
        if (!StringUtils.hasText(purposeText())) throw new BusinessException("發布前請填寫會議目的");
        if (chairUserId == null) throw new BusinessException("發布前請指定主持人");
        for (Item item : items == null ? List.<Item>of() : items) {
            if (!StringUtils.hasText(item.getTopicKey())) throw new BusinessException("議題識別碼缺失，請重新保存");
            if (!StringUtils.hasText(item.getDecisionStatus())) throw new BusinessException("發布前請確認每個議題的決議狀態");
            if (!DECISION_INFORMATION.equals(item.getDecisionStatus()) && !StringUtils.hasText(item.getConclusion())) {
                throw new BusinessException("已形成決議或待決策的議題必須填寫結論或待決策內容");
            }
            if (DECISION_INFORMATION.equals(item.getDecisionStatus())
                    && !StringUtils.hasText(item.getDiscussion()) && !StringUtils.hasText(item.getConclusion())) {
                throw new BusinessException("資訊同步議題必須填寫討論要點或結論");
            }
        }
        for (Action action : actions == null ? List.<Action>of() : actions) {
            requireResponsible(action.getOwnerUserId(), action.getDueDate(), "行動項");
        }
        for (OpenIssue issue : openIssues == null ? List.<OpenIssue>of() : openIssues) {
            requireResponsible(issue.getOwnerUserId(), issue.getDueDate(), "跟進事項");
        }
    }

    private void validateVersionedFields() {
        requireWithin(purpose, PURPOSE_MAX, "會議目的");
        requireWithin(summary, SUMMARY_MAX, "歷史會議摘要");
        requireWithin(purposeText(), PURPOSE_MAX, "會議目的");
        requirePositive(chairUserId, "主持人");
        Set<String> topics = new HashSet<>();
        for (Item item : items == null ? List.<Item>of() : items) {
            if (StringUtils.hasText(item.getTopicKey())) {
                requireKey(item.getTopicKey());
                if (!topics.add(item.getTopicKey())) throw new BusinessException("議題識別碼不可重複");
            }
            if (item.getDecisionStatus() != null && !DECISION_STATES.contains(item.getDecisionStatus())) {
                throw new BusinessException("不支援的決議狀態");
            }
        }
        Set<Long> taskIds = new HashSet<>();
        for (Action action : actions == null ? List.<Action>of() : actions) {
            validateTask(action.getItemId(), action.getTopicKey(), action.getOwnerUserId(), action.getDueDate(), topics, taskIds);
            requireWithin(action.getDeliverable(), ACTION_MAX, "交付物或驗收標準");
        }
        for (OpenIssue issue : openIssues == null ? List.<OpenIssue>of() : openIssues) {
            if (!StringUtils.hasText(issue.getContent())) throw new BusinessException("跟進事項不可留空");
            validateTask(issue.getItemId(), issue.getTopicKey(), issue.getOwnerUserId(), issue.getDueDate(), topics, taskIds);
        }
        if (attendance == null) return;
        if (attendance.size() > MAX_ATTENDANCE) throw new BusinessException("參會資料最多 " + MAX_ATTENDANCE + " 人");
        Set<String> attendees = new HashSet<>();
        Set<Long> presentIds = new HashSet<>();
        for (Attendance person : attendance) {
            if (person == null) throw new BusinessException("參會資料不可包含空白項");
            requirePositive(person.getUserId(), "參會人");
            if (person.getUserId() == null && !StringUtils.hasText(person.getName())) {
                throw new BusinessException("外部參會人姓名不可留空");
            }
            requireWithin(person.getName(), NAME_MAX, "參會人姓名");
            requireWithin(person.getReason(), SHORT_MAX, "參會說明");
            if (person.getStatus() == null || !ATTENDANCE_STATES.contains(person.getStatus())) {
                throw new BusinessException("不支援的參會狀態");
            }
            String key = person.getUserId() == null ? "external:" + person.getName().trim() : "user:" + person.getUserId();
            if (!attendees.add(key)) throw new BusinessException("同一參會人不可同時列入多個出席狀態");
            if (ATTENDANCE_PRESENT.equals(person.getStatus()) && person.getUserId() != null) presentIds.add(person.getUserId());
        }
        for (Absentee person : absentees == null ? List.<Absentee>of() : absentees) {
            if (person.getUserId() != null && presentIds.contains(person.getUserId())) {
                throw new BusinessException("已出席人員不可同時列入缺席名單");
            }
        }
    }

    private static void validateTask(Long itemId, String topicKey, Long ownerId, String dueDate,
                                     Set<String> topics, Set<Long> taskIds) {
        requirePositive(itemId, "事項");
        requirePositive(ownerId, "負責人");
        if (itemId != null && !taskIds.add(itemId)) throw new BusinessException("事項識別碼不可重複");
        if (StringUtils.hasText(topicKey) && !topics.contains(topicKey)) throw new BusinessException("行動項關聯的議題不存在");
        requireDate(dueDate, "yyyy-MM-dd", "完成時限");
    }

    private static void requireResponsible(Long ownerId, String dueDate, String label) {
        if (ownerId == null || !StringUtils.hasText(dueDate)) {
            throw new BusinessException("發布前每條" + label + "都必須指定負責人及完成時限");
        }
    }

    private static void requirePositive(Long value, String label) {
        if (value != null && value <= 0) throw new BusinessException(label + "識別碼不正確");
    }

    private static void requireKey(String value) {
        if (!value.matches("[A-Za-z0-9_-]{1,64}")) throw new BusinessException("議題識別碼格式不正確");
    }

    /** 附件号形态与条数校验：存在性/归属/状态由服务层按号回查数据库裁决，不信前端结论。 */
    private void validateAttachments() {
        if (attachments == null) return;
        if (attachments.size() > MAX_ATTACHMENTS) throw new BusinessException("附件最多 " + MAX_ATTACHMENTS + " 個");
        Set<String> seen = new HashSet<>();
        for (String no : attachments) {
            if (no == null || !no.matches("[0-9a-f]{32}")) throw new BusinessException("附件標識不正確，請重新上傳");
            if (!seen.add(no)) throw new BusinessException("附件不可重複綁定");
        }
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
        try {
            DateTimeFormatter formatter = DateTimeFormatter.ofPattern(pattern.replace("yyyy", "uuuu"))
                    .withResolverStyle(ResolverStyle.STRICT);
            if ("yyyy-MM-dd".equals(pattern)) LocalDate.parse(value.trim(), formatter);
            else LocalDateTime.parse(value.trim(), formatter);
        } catch (java.time.DateTimeException e) {
            throw new BusinessException(label + "不是有效日期或時間");
        }
    }

    private static int length(String value) {
        return value == null ? 0 : value.trim().length();
    }

    private static String truncate(String value, int max) {
        return value.length() > max ? value.substring(0, max) : value;
    }
}
