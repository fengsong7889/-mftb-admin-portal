package com.mftb.admin.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/**
 * 会议纪要 AI 辅助录入的独立契约（笔记 + 提取），与正式 {@link MeetingMinutesContent} 分离。
 *
 * <p>刻意不复用正文 DTO：{@code proposal} 只是「字段级建议」，禁止当成整份正文替换；
 * 注解、问题清单、用量都是辅助元数据，绝不写进正式纪要或发布快照。
 */
public final class MeetingMinutesAiDto {

    private MeetingMinutesAiDto() {
    }

    /* ==================== 笔记 ==================== */

    /** @员工标记：mentionRef 是临时别名，真实 userId 由服务端回查，前端不自报身份。 */
    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Mention {
        private String mentionRef;
        private Long userId;
        private String name;
        private Integer start;
        private Integer end;
    }

    @Data
    public static class NoteForm {
        private Long bookingId;
        private String rawText;
        private List<Mention> mentions = new ArrayList<>();
        /** 乐观锁：新建传 0，编辑传上次读到的版本；不一致即冲突 */
        private Integer noteVersion;
        private String requestKey;
    }

    @Data
    public static class NoteVO {
        private boolean exists;
        private String rawText;
        private List<Mention> mentions = new ArrayList<>();
        private Integer noteVersion;
        private String updatedAt;
        /** 最近一次可恢复的提取请求号（重连用），无则 null */
        private String lastExtractionRequestKey;
        private int maxChars;
    }

    /* ==================== AI 状态 ==================== */

    @Data
    public static class AiStatusVO {
        private boolean available;
        private String reasonCode;
        private int maxInputChars;
        /** 灰度开关：false 时前端隐藏 AI 入口，手动录入不受影响 */
        private boolean enabled;
    }

    /* ==================== 提取 ==================== */

    @Data
    public static class ExtractionForm {
        private Long bookingId;
        private Integer noteVersion;
        private Long baseMinutesId;
        private Integer baseMinutesVersion;
        private String requestKey;
    }

    /** 结构化建议：字段级，不是整份正文 */
    @Data
    public static class Proposal {
        private String purpose;
        private List<ProposalItem> items = new ArrayList<>();
        private List<ProposalAction> actions = new ArrayList<>();
        private List<ProposalOpenIssue> openIssues = new ArrayList<>();
    }

    @Data
    public static class ProposalItem {
        private String ref;
        private String topic;
        private String discussion;
        private String conclusion;
        private String decisionStatus;
        private List<String> sourceRefs = new ArrayList<>();
    }

    @Data
    public static class ProposalAction {
        private String ref;
        private String topicRef;
        private String content;
        private Long ownerUserId;
        private String ownerName;
        private String ownerEmpNo;
        private String dueDate;
        private String deliverable;
        private List<String> sourceRefs = new ArrayList<>();
    }

    @Data
    public static class ProposalOpenIssue {
        private String ref;
        private String topicRef;
        private String content;
        private Long ownerUserId;
        private String ownerName;
        private String dueDate;
        private List<String> sourceRefs = new ArrayList<>();
    }

    /** 解析注解：字段 → 原文依据 / 原始称呼 / 解析状态 */
    @Data
    public static class Annotation {
        private String proposalKey;
        private String field;
        private List<String> sourceRefs = new ArrayList<>();
        private String rawText;
        private String parseStatus;
    }

    /** 待确认问题：重名、模糊期限、缺负责人等，供界面标注，不阻断草稿保存 */
    @Data
    public static class Issue {
        private String code;
        private String proposalKey;
        private String field;
        private String severity;
        private List<Candidate> candidates = new ArrayList<>();
    }

    @Data
    public static class Candidate {
        private Long userId;
        private String name;
        private String empNo;
    }

    @Data
    public static class Usage {
        private String model;
        private Integer promptTokens;
        private Integer completionTokens;
        private String meteringStatus;
    }

    @Data
    public static class SourceMeta {
        private Integer noteVersion;
        private String sourceHash;
        private Long baseMinutesId;
        private Integer baseMinutesVersion;
    }

    @Data
    public static class ContextMeta {
        private String meetingDate;
        private String timezone;
    }

    @Data
    public static class ExtractionVO {
        private String requestKey;
        /** processing / succeeded / failed / unknown / expired */
        private String status;
        private int extractionSchemaVersion;
        private String promptVersion;
        private SourceMeta source;
        private ContextMeta context;
        private Proposal proposal;
        private List<Annotation> annotations = new ArrayList<>();
        private List<Issue> issues = new ArrayList<>();
        private Usage usage;
        /** 失败/未知时的业务错误码（文案由前端按码映射，不回传供应商响应体） */
        private String errorCode;
    }
}
