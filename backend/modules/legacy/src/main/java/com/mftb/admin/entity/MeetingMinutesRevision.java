package com.mftb.admin.entity;

import lombok.Data;
import lombok.ToString;

import java.time.LocalDateTime;

/** 不可变正式发布版本；对应 Mapper 只提供插入与读取，不提供更新或删除。 */
@Data
public class MeetingMinutesRevision {
    private Long id;
    private Long minutesId;
    private Integer revisionNo;
    private Integer schemaVersion;
    @ToString.Exclude
    private String documentSnapshot;
    private String digest;
    private String changeNote;
    private Long publisherUserId;
    private String publisherName;
    private String publisherEmpNo;
    private LocalDateTime publishedAt;
    private Integer draftVersion;
    private String draftHash;
    private String requestKey;
    private String requestHash;
    private String createdBy;
    private LocalDateTime createdAt;
    private String updatedBy;
    private LocalDateTime updatedAt;
}
