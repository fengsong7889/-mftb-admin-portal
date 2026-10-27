package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * RDM 追加式发布申请/裁决事实实体（Batch 3 / rdm:schema:v3.2，对应 237_rdm_batch3_test_release.sql）。
 * <p>每一次「申请放行(apply)」或「裁决放行(decide)」都追加一行不可变事实，
 * 以 {@code uk_rdm_release_approval(release_batch_id, application_version, action)} 保证同批次同申请版本同动作只有一条。
 * <p>申请人与裁决人分别落在 {@code operator_user_id}（本行动作人）；
 * 「管理员不得代签/自批」由服务层校验 apply 与 decide 的 operator 不同人，契约层不做兜底放行。
 * <p>{@code application_version} 是申请时批次的**并发版本**，不是业务范围版本（scopeVersion）。
 */
@Data
@TableName("rdm_release_approval")
public class RdmReleaseApproval {

    @TableId
    private Long id;

    /** 发布批次ID */
    private Long releaseBatchId;

    /** 申请时批次并发版本（非范围版本 scopeVersion） */
    private Integer applicationVersion;

    /** 动作：apply/decide */
    private String action;

    /** 裁决：approved/rejected（action=apply 时为 null） */
    private String decision;

    /** 快照JSON */
    private String snapshotJson;

    /** 证据哈希 CHAR(64) */
    private String evidenceHash;

    /** 理由 */
    private String reason;

    /** 动作人（认证 SysUser.id）：申请人或裁决人 */
    private Long operatorUserId;

    /** 幂等请求ID */
    private String requestId;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
}
