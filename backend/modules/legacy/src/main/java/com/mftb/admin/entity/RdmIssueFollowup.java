package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.FieldStrategy;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * RDM 问题承接历史实体（Batch 3 / rdm:schema:v3.2，对应 237_rdm_batch3_test_release.sql）。
 * <p>问题延期后必须绑定承接需求，形成可追溯的承接链；当前关联可失效（{@code active=0}）但从不删除。
 * <p>{@code active_issue_id} 是数据库 STORED 生成列（active=1 时等于 issue_id，否则 NULL），
 * 配合 {@code uk_rdm_followup_active_issue} 保证「一个问题同时只有一条生效承接」。
 * 生成列由数据库维护，实体侧禁止插入/更新（{@link FieldStrategy#NEVER}）。
 * <p>字段区分：{@code scopeVersion} = 业务范围版本；{@code version} = 并发控制版本（乐观锁），不可混用。
 */
@Data
@TableName("rdm_issue_followup")
public class RdmIssueFollowup {

    @TableId
    private Long id;

    /** 问题ID */
    private Long issueId;

    /** 延期决定ID */
    private Long deferId;

    /** 承接需求ID */
    private Long followUpReqId;

    /** 来源需求ID */
    private Long sourceReqId;

    /** 来源交付项ID */
    private Long sourceDeliveryItemId;

    /** 业务范围版本，非并发版本 */
    private Integer scopeVersion;

    /** 承接责任人 */
    private Long ownerUserId;

    /** 目标版本 */
    private String targetVersion;

    /** 截止日期 */
    private LocalDate dueAt;

    /** 是否生效（0/1） */
    private Integer active;

    /**
     * 数据库 STORED 生成列：active=1 时等于 issue_id，否则 NULL。
     * 由 {@code uk_rdm_followup_active_issue} 保证一个问题只有一条生效承接；实体侧只读，禁止写。
     */
    @TableField(value = "active_issue_id", insertStrategy = FieldStrategy.NEVER, updateStrategy = FieldStrategy.NEVER)
    private Long activeIssueId;

    /** 被取代的历史承接ID */
    private Long supersedesId;

    /** 承接理由 */
    private String reason;

    /** 创建人 */
    private Long createdBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    /** 失效时间 */
    private LocalDateTime deactivatedAt;

    /** 失效操作人 */
    private Long deactivatedBy;

    /** 并发控制版本（乐观锁），非业务范围版本 scopeVersion */
    @Version
    private Integer version;
}
