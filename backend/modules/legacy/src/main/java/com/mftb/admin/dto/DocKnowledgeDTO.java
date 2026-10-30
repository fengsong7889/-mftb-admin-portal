package com.mftb.admin.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/** P0 知识库独立契约；不复用旧外链 DTO，避免把分类/密级/资产字段混进历史接口。 */
public final class DocKnowledgeDTO {
    private DocKnowledgeDTO() {}

    public record CategoryNode(Long id, Long parentId, String code, String name, String path,
                               int level, int sortOrder, int status, int docCount, List<CategoryNode> children) {}
    public record CategorySave(@NotBlank @Size(max=100) String name, Long parentId,
                               @Size(max=64) String code, Integer sortOrder) {}
    public record Tag(Long id, Long spaceId, String name, String color, int status) {}
    public record TagSave(@NotBlank @Size(max=64) String name, @Size(max=16) String color, Boolean global) {}
    /** managed=true 表示已建立 doc_space_access，可写入原生文档；历史空间只能浏览。 */
    public record Space(Long id, String name, String description, int kind, boolean managed) {}

    public record SearchRow(Long nodeId, String title, String summary, Long spaceId, String spaceName,
                            Long categoryId, String categoryName, int contentKind, int confidentiality,
                            int status, String tags, String ownerName, boolean nativeDoc, LocalDateTime updatedAt) {}
    public record Page(List<SearchRow> records, long total, int page, int size) {}
    public record Stats(long total, long effective, long updatedThisMonth, long files, long pendingAck) {}

    public record Asset(Long id, Long spaceId, String originalName, String mime, long sizeBytes,
                        int status, String scanResult, Long createdBy, LocalDateTime createdAt) {}

    public record DocWrite(@NotNull @Positive Long spaceId, @NotBlank @Size(max=200) String title,
                           @Size(max=1000) String summary,
                           @NotNull @Min(1) @Max(5) Integer contentKind,
                           Long categoryId,
                           @Min(1) @Max(4) Integer confidentiality,
                           @Min(1) @Max(3) Integer downloadPolicy,
                           @Size(max=20) List<@NotBlank @Size(max=40) String> tags,
                           @Size(max=500) String sourceUrl,
                           String markdown,
                           @Size(max=255) String originalFilename,
                           @Size(max=20) List<@Positive Long> assetIds,
                           @Size(max=200) String changeReason,
                           @Size(max=128) String sourceSessionKey,
                           @Positive Integer expectedVersion) {}

    public record AclEntry(Long id, String subjectType, String subjectId, String subjectName,
                           int permissions, LocalDateTime expiresAt) {}
    public record AclEntrySave(@NotBlank String subjectType, @NotBlank @Size(max=64) String subjectId,
                               @Min(1) @Max(3) int permissions, LocalDateTime expiresAt) {}
    public record AclSave(@NotNull Integer expectedVersion, @NotNull @Size(max=100) List<AclEntrySave> entries) {}

    public record ClearanceUser(Long userId, String name, String empId, String username) {}
    public record Clearance(Long userId, String name, String empId, int maxLevel,
                            String grantedByName, LocalDateTime grantedAt, LocalDateTime expiresAt) {}
    public record ClearanceSave(@Min(1) @Max(4) int maxLevel, @Min(1) @Max(3650) Integer days) {}

    public record AckTarget(String subjectType, String subjectId, String subjectName, LocalDate dueAt) {}
    public record AckTargetInput(@NotBlank String subjectType, @NotBlank @Size(max=64) String subjectId, LocalDate dueAt) {}
    public record AckTargetSave(@NotNull @Size(max=100) List<@Valid AckTargetInput> targets) {}
    public record AckStatus(Long nodeId, Long revisionId, boolean targeted, boolean acknowledged,
                            LocalDateTime acknowledgedAt, LocalDate dueAt, long targetCount, long receiptCount) {}
    public record AckReceipt(Long userId, String name, String empId, LocalDateTime acknowledgedAt) {}
    public record AckCoverageRow(String subjectType, String subjectId, String subjectName, LocalDate dueAt,
                                 long targetUsers, long acknowledgedUsers, double rate) {}
    public record AckCoverage(List<AckCoverageRow> rows, long targetUsers, long acknowledgedUsers, double rate) {}
    public record AckExport(byte[] content, String filename) {}

    public record ReaderState(Long nodeId, Long revisionId, String positionJson, double percent,
                              int totalSeconds, LocalDateTime lastReadAt) {}
    public record ReaderStateSave(Long revisionId, @Size(max=2000) String positionJson,
                                  @DecimalMin("0") @DecimalMax("100") double percent,
                                  @Min(0) @Max(3600) Integer seconds) {}
    public record Favorite(Long nodeId, String title, String summary, int contentKind,
                           int confidentiality, LocalDateTime updatedAt, String folder) {}
    public record Note(Long id, Long nodeId, Long revisionId, int noteType, String anchorJson,
                       String quoteText, String content, int visibility,
                       LocalDateTime createdAt, LocalDateTime updatedAt) {}
    public record NoteSave(@NotNull Long revisionId, @Min(1) @Max(3) int noteType,
                           @Size(max=2000) String anchorJson, @Size(max=1000) String quoteText,
                           @Size(max=4000) String content, @Min(1) @Max(2) int visibility) {}
    public record BookMeta(Long nodeId, String title, String summary, String isbn, String author, String publisher,
                           Integer publishYear, String language, Integer pageCount, Long coverAssetId,
                           Long bookCategoryId, int accessMode, double percent, LocalDateTime lastReadAt) {}
    public record BookMetaSave(@Size(max=32) String isbn, @Size(max=200) String author,
                               @Size(max=200) String publisher, @Min(1000) @Max(9999) Integer publishYear,
                               @Size(max=16) String language, @Min(1) Integer pageCount,
                               Long coverAssetId, Long bookCategoryId, @Min(1) @Max(2) int accessMode) {}
    public record BookPage(List<BookMeta> records, long total, int page, int size) {}

    public record ApiSpecImport(@NotBlank @Size(max=32) String systemCode, @NotBlank @Size(max=32) String specVersion,
                                @NotBlank @Size(max=2000000) String rawSpec) {}
    public record ApiSpec(Long id, Long nodeId, Long revisionId, String systemCode, String specFormat,
                          String specVersion, String baseUrl, String specHash, LocalDateTime createdAt) {}
    public record ApiOperation(Long id, String operationId, String method, String path, String summary,
                               String tag, boolean deprecated, String schemaHash) {}
    public record ApiChange(Long id, Integer changeType, String operationKey, String detail,
                            Long acknowledgedBy, LocalDateTime createdAt) {}
    public record ApiSpecView(ApiSpec spec, List<ApiOperation> operations, List<ApiChange> changes,
                              int pendingDestructive) {}

    public record ArchiveSave(@Min(1) @Max(100) int retentionYears, @NotNull LocalDate retentionStart,
                              boolean legalHold) {}
    public record ArchiveMeta(Long nodeId, String documentNo, String title, String spaceName, String archiveNo,
                              String fondsCode, String seriesCode, int securityLevel, int retentionYears,
                              LocalDate retentionStart, int disposalState, boolean legalHold,
                              LocalDateTime archivedAt) {}
    public record DisposalSave(@NotBlank @Size(max=500) String reason) {}
    public record DisposalDecision(@NotNull Boolean approve, @Size(max=64) String certificateNo) {}
    public record DisposalRequest(Long id, Long nodeId, String documentNo, String title, String reason,
                                  Long requestedBy, String requestedByName, Long approvedBy, String approvedByName,
                                  int status, String certificateNo, LocalDateTime createdAt,
                                  LocalDateTime decidedAt, LocalDateTime destroyedAt) {}

    public record SystemPlan(Long id, String fileName, String title, String systemName, String systemCode,
                             String planType, LocalDateTime generatedAt, String sourcePath, String contentHash,
                             long fileSize, LocalDateTime updatedAt, int status) {}
    public record SystemPlanDetail(SystemPlan plan, String content) {}
    public record SystemPlanPage(List<SystemPlan> records, long total, int page, int size) {}

    public record ApiCatalogEntry(Long id, String systemCode, String systemName, String method, String path,
                                  String handler, String requestSchema, String responseSchema, String responseFields,
                                  String source, String apiName, String apiNameSource, String description,
                                  String scenario, String authType, String authScope, int visibility, int docStatus,
                                  Long ownerUserId, String version, String baseUrl, String requestExample,
                                  String responseExample, String errorCodes, String changelog, boolean active,
                                  LocalDateTime syncedAt) {}
    public record ApiCatalogSystem(String systemCode, String systemName, long endpointCount) {}
    public record ApiCatalogPage(List<ApiCatalogEntry> records, long total, int page, int size) {}
    public record ApiCatalogSave(@Size(max=200) String apiName, @Size(max=1000) String description,
                                 @Size(max=2000) String scenario, @Size(max=32) String authType,
                                 @Size(max=500) String authScope, @Min(1) @Max(3) int visibility,
                                 @Min(1) @Max(3) int docStatus, @Size(max=32) String version,
                                 @Size(max=255) String baseUrl, @Size(max=20000) String requestExample,
                                 @Size(max=20000) String responseExample, @Size(max=10000) String errorCodes,
                                 @Size(max=10000) String changelog) {}
    public record PendingAck(Long nodeId, String title, String spaceName, Long revisionId, LocalDate dueAt,
                             int confidentiality, LocalDateTime updatedAt) {}
    public record PendingAckPage(List<PendingAck> records, long total, int page, int size) {}

    public record Receipt(Long documentId, String documentNo, Long revisionId, String contentHash,
                          int version, LocalDateTime savedAt, String versionUrl) {}

    public record Detail(DocNativeDTO.Head document, DocNativeDTO.Revision revision,
                         List<DocNativeDTO.Revision> revisions, List<Asset> assets,
                         List<AclEntry> acl, List<String> allowedActions) {}

    @Data
    public static class AssetRef {
        private Long nodeId;
        private Long assetId;
        private String role;
    }
}
