package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * RDM 追加式部署/验证/开放/回滚事实实体（Batch 3 / rdm:schema:v3.2，对应 237_rdm_batch3_test_release.sql）。
 * <p>每一次部署动作追加一行，以 {@code uk_rdm_release_attempt(deployment_id, action, attempt_no)} 保证
 * 同系统同动作同尝试号唯一，重试留痕但不覆盖历史。
 * <p>追加式事实，无 version/updated_at；{@code attempt_no} 是业务尝试序号，不是并发版本。
 */
@Data
@TableName("rdm_release_attempt")
public class RdmReleaseAttempt {

    @TableId
    private Long id;

    /** 发布批次ID */
    private Long releaseBatchId;

    /** 部署清单ID（复用逐系统部署清单 rdm_release_deployment） */
    private Long deploymentId;

    /** 尝试序号（>0），非并发版本 */
    private Integer attemptNo;

    /** 动作：deploy/verify/open/rollback */
    private String action;

    /** 结果 */
    private String result;

    /** 构建标识 */
    private String buildId;

    /** 测试环境 */
    private String testEnv;

    /** 关联的放行申请/裁决事实ID */
    private Long approvalId;

    /** 范围快照JSON */
    private String scopeSnapshotJson;

    /** 证据JSON */
    private String evidenceJson;

    /** 证据哈希 CHAR(64) */
    private String evidenceHash;

    /** 理由 */
    private String reason;

    /** 动作人（认证 SysUser.id） */
    private Long operatorUserId;

    /** 幂等请求ID */
    private String requestId;

    /** 动作发生时间 */
    private LocalDateTime occurredAt;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
}
