package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * RDM 问题实体
 */
@Data
@TableName("rdm_issue")
public class RdmIssue {

    @TableId
    private Long id;

    /** 问题编号 */
    private String issueNo;

    /** 来源:test/product_acceptance/biz_acceptance */
    private String sourceType;

    /** 来源记录ID */
    private Long sourceId;

    /** 需求ID */
    private Long reqId;

    /** 交付项ID */
    private Long deliveryItemId;

    /** 范围版本 */
    private Integer scopeVersion;

    /** 构建标识 */
    private String buildId;

    /** 问题标题 */
    private String title;

    /** 问题描述 */
    private String description;

    /** 影响描述 */
    private String impact;

    /** 严重程度:critical/major/minor/trivial */
    private String severity;

    /** 负责人ID */
    private Long ownerUserId;

    /** 负责人姓名 */
    private String ownerUserName;

    /** 状态:open/processing/pending_verify/resolved/deferred */
    private String status;

    /** 报告人ID */
    private Long reporterUserId;

    /** 报告人姓名 */
    private String reporterUserName;

    /* ==================== Batch 3 补列（rdm:schema:v3.2 / 237） ==================== */

    /**
     * 并发控制版本（乐观锁），用于问题状态推进与延期绑定的并发保护。
     * <p>注意：这是**并发版本**，不是业务范围版本 {@code scopeVersion}，二者不可混用。
     */
    @Version
    private Integer version;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
