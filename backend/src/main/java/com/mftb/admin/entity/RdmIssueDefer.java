package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * RDM 问题延期决定实体
 */
@Data
@TableName("rdm_issue_defer")
public class RdmIssueDefer {

    @TableId
    private Long id;

    /** 问题ID */
    private Long issueId;

    /** 延期原因 */
    private String reason;

    /** 影响描述 */
    private String impactDesc;

    /** 临时措施 */
    private String mitigation;

    /** 目标版本 */
    private String targetVersion;

    /** 后续责任人ID */
    private Long ownerUserId;

    /** 后续责任人姓名 */
    private String ownerUserName;

    /** 截止日期 */
    private LocalDate dueAt;

    /** 产品决定:pending/approved/rejected */
    private String productDecision;

    /** 产品决定人ID */
    private Long productDecideUserId;

    /** 产品决定人姓名 */
    private String productDecideUserName;

    /** 产品决定时间 */
    private LocalDateTime productDecideTime;

    /** 产品决定理由 */
    private String productDecideReason;

    /** 业务决定:pending/approved/rejected/not_required */
    private String bizDecision;

    /** 业务决定人ID */
    private Long bizDecideUserId;

    /** 业务决定人姓名 */
    private String bizDecideUserName;

    /** 业务决定时间 */
    private LocalDateTime bizDecideTime;

    /** 业务决定理由 */
    private String bizDecideReason;

    /** 承接需求ID */
    private Long followUpReqId;

    /** 承接需求编号 */
    private String followUpReqNo;

    /** 状态:pending_product/pending_biz/pending_bind/effective/rejected */
    private String status;

    /** 申请人ID */
    private Long applicantUserId;

    /** 申请人姓名 */
    private String applicantUserName;

    /* ==================== Batch 3 补列（rdm:schema:v3.2 / 237） ==================== */

    /**
     * 并发控制版本（乐观锁），用于延期三段闸门推进的并发保护。
     * <p>注意：这是**并发版本**，不是业务范围版本 {@code scopeVersion}，二者不可混用。
     */
    @Version
    private Integer version;

    /** 延期对应的业务范围版本，非并发版本 */
    private Integer scopeVersion;

    /** 必要范围变更批准引用（延期伴随范围变更时） */
    private Long scopeChangeId;

    /** 延期生效时间 */
    private LocalDateTime effectiveAt;

    /** 升级时间（超期未承接时升级） */
    private LocalDateTime escalatedAt;

    /** 升级级别 */
    private Integer escalationLevel;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
