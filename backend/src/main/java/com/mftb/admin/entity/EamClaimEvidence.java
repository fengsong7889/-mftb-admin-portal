package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 领用/归还凭证附件实体
 */
@Data
@TableName("biz_eam_claim_evidence")
public class EamClaimEvidence {

    @TableId
    private Long id;

    /** 关联领用 ID */
    private Long claimId;

    /** 凭证类型：signature / photo / return_photo */
    private String evidenceType;

    /** 原始文件名 */
    private String fileName;

    /** 存储路径或 Data URL */
    private String storagePath;

    /** MIME 类型 */
    private String contentType;

    /** 文件大小（字节） */
    private Integer fileSize;

    /** 文件 SHA-256 */
    private String contentHash;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableLogic
    private Integer deleted;
}
