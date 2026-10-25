package com.mftb.admin.dto;

import jakarta.validation.constraints.*;
import lombok.Data;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/** 原生文档独立契约，不复用外链 status 或接受客户端身份。 */
public final class DocNativeDTO {
    private DocNativeDTO() {}

    public record Save(@NotNull @Positive Long spaceId, @NotBlank @Size(max=200) String title,
                       @Size(max=1000) String summary, @NotBlank String markdown,
                       @Size(max=20) List<@NotBlank @Size(max=40) String> tags,
                       @Size(max=32) String systemCode, @Size(max=100) String menuKey,
                       @Size(max=255) String originalFilename, @NotBlank @Size(max=200) String changeReason,
                       @Size(max=128) String sourceSessionKey, @Positive Integer expectedVersion) {}
    public record SpaceSave(@NotBlank @Size(max=64) String name, @Size(max=255) String description) {}
    public record MemberSave(@NotNull @Positive Long userId, @NotNull Integer permissions) {}
    public record AclSave(@NotNull Integer expectedVersion, boolean restricted,
                          @NotNull @Size(max=100) List<MemberSave> members) {}
    /** 收窄授权回显：只允许能维护该文档的人读取，避免前端盲写覆盖他人配置。 */
    public record AclView(boolean restricted, List<Member> members) {}
    public record Submit(@NotNull Integer expectedVersion, @NotNull Long revisionId, @NotNull Long reviewerUserId) {}
    public record Decision(@NotNull Integer expectedVersion, @NotBlank String decision, @Size(max=200) String note) {}
    public record Action(@NotNull Integer expectedVersion, @Size(max=200) String reason) {}
    public record Execution(@NotNull Integer expectedVersion, @NotNull Long revisionId,
                            @NotNull Integer status, @NotBlank @Size(max=200) String evidence) {}
    public record HandoffSave(@NotNull Integer expectedVersion, @NotNull Long revisionId,
                              @NotNull @Positive Long recipientUserId,
                              @NotBlank @Size(max=2000) String completedText,
                              @NotBlank @Size(max=2000) String remainingText, @Size(max=2000) String riskText) {}
    public record GrantSave(@NotNull @Positive Long spaceId, @NotBlank @Size(max=64) String name,
                            boolean canWrite, @Min(1) @Max(30) int days,
                            @Min(1) @Max(4) Integer maxConfidentiality) {
        /** 兼容旧调用方：不传密级时默认内部。 */
        public GrantSave(Long spaceId, String name, boolean canWrite, int days) {
            this(spaceId, name, canWrite, days, 2);
        }
    }
    public record GrantCreated(Long id, String token, LocalDateTime expiresAt) {}
    public record Receipt(Long documentId, String documentNo, Long revisionId, String contentHash,
                          int version, LocalDateTime savedAt, String versionUrl) {}
    public record Page(List<View> records, long total, int page, int size) {}
    public record Space(Long id, String name, String description, Long ownerUserId, int permissions) {}
    public record Member(Long userId, String name, String empId, int permissions) {}
    public record View(Head document, Revision revision, List<Revision> revisions, List<String> allowedActions,
                       List<Confirmation> confirmations, List<Handoff> handoffs) {}

    @Data
    public static class Head {
        private Long nodeId;
        private String documentNo;
        private Long spaceId;
        private String spaceName;
        private Long ownerUserId;
        private String ownerName;
        private Long createdByUserId;
        private Long draftRevisionId;
        private Long effectiveRevisionId;
        private Long adoptedRevisionId;
        private int version;
        private int lifecycle;
        private int executionStatus;
        /** doc_node.status：1草稿 2评审中 3已生效 4已归档 5已失效 6待销毁 7已销毁 */
        private int status;
        private boolean restricted;
        /** 1Markdown 2PDF 3Office 4外链 5OpenAPI */
        private int contentKind;
        private Long categoryId;
        private String categoryName;
        /** 1公开 2内部 3敏感 4机密 */
        private int confidentiality;
        /** 1允许 2需审批 3禁止 */
        private int downloadPolicy;
        private String sourceUrl;
        private int legalHold;
        private LocalDateTime deletedAt;
        private String deletionReason;
        private LocalDate reviewDueAt;
        private LocalDateTime createdAt;
        private LocalDateTime updatedAt;
    }
    @Data
    public static class Revision {
        private Long id;
        private Long nodeId;
        private int revisionNo;
        private String title;
        private String summary;
        private String markdown;
        private String tagsJson;
        private String systemCode;
        private String menuKey;
        private String originalFilename;
        private String contentHash;
        private String changeReason;
        private Long createdByUserId;
        private LocalDateTime createdAt;
    }
    @Data
    public static class Confirmation {
        private Long id;
        private Long nodeId;
        private Long revisionId;
        private Long reviewerUserId;
        private int status;
        private String note;
        private LocalDateTime createdAt;
        private LocalDateTime decidedAt;
    }
    @Data
    public static class Handoff {
        private Long id;
        private Long nodeId;
        private Long revisionId;
        private Long senderUserId;
        private Long recipientUserId;
        private String completedText;
        private String remainingText;
        private String riskText;
        private int status;
        private LocalDateTime createdAt;
        private LocalDateTime acceptedAt;
    }
    @Data
    public static class Grant {
        private Long id;
        private Long ownerUserId;
        private Long spaceId;
        private String name;
        private boolean canWrite;
        /** 机器令牌可读最高密级，默认 2=内部 */
        private int maxConfidentiality;
        private LocalDateTime expiresAt;
        private LocalDateTime revokedAt;
        private LocalDateTime createdAt;
    }
}
