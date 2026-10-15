package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * RDM 发布批次实体
 */
@Data
@TableName("rdm_release_batch")
public class RdmReleaseBatch {

    @TableId
    private Long id;

    /** 发布批次号 */
    private String batchNo;

    /** 版本标识 */
    private String versionTag;

    /** 关联需求ID(主需求) */
    private Long reqId;

    /** 关联项目ID */
    private Long projectId;

    /** 范围快照JSON */
    private String scopeSnapshotJson;

    /** 发布负责人ID */
    private Long releaseOwnerUserId;

    /** 发布负责人姓名 */
    private String releaseOwnerUserName;

    /** 计划发布时间 */
    private LocalDateTime planTime;

    /** 状态:planning/checking/approved/deploying/verifying/released/rolled_back/cancelled */
    private String status;

    /** 审批人ID */
    private Long approvalUserId;

    /** 审批人姓名 */
    private String approvalUserName;

    /** 审批时间 */
    private LocalDateTime approvalTime;

    /** 申请人ID */
    private Long applicantUserId;

    /** 申请人姓名 */
    private String applicantUserName;

    /** 回滚原因 */
    private String rollbackReason;

    /* ==================== Batch 3 补列（rdm:schema:v3.2 / 237） ==================== */

    /**
     * 并发控制版本（乐观锁），用于申请/裁决/部署等状态推进的并发保护。
     * <p>注意：这是**并发版本**，不是业务范围版本 scopeVersion，二者不可混用。
     */
    @Version
    private Integer version;

    /** 当前放行申请的并发版本快照（与 rdm_release_approval.application_version 对齐），非范围版本 */
    private Integer applicationVersion;

    /** 申请时冻结的范围/构建快照JSON */
    private String applicationSnapshotJson;

    /** 裁决时冻结的快照JSON */
    private String approvalSnapshotJson;

    /** 提交（申请放行）时间 */
    private LocalDateTime submittedAt;

    /** 申请证据哈希 CHAR(64) */
    private String evidenceHash;

    /** 裁决证据哈希 CHAR(64) */
    private String approvalEvidenceHash;

    /** 放行裁决过期时间（过期必须重新过闸） */
    private LocalDateTime approvalExpiresAt;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
