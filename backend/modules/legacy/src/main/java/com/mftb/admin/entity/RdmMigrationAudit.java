package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * RDM 不可覆盖的迁移结果审计实体（Batch 4 / rdm:schema:v3.3，对应 238_rdm_batch4_migration.sql）。
 * <p>迁移的每个动作（preview/confirm/execute/pause/resume/rollback/reconcile）都追加一行审计，
 * 记录动作前后的版本号与哈希，供事后追溯；追加式、不可覆盖，无 version/updated_at。
 * <p>{@code before_version}/{@code after_version} 是被审计对象的业务版本变化，非本行并发版本。
 */
@Data
@TableName("rdm_migration_audit")
public class RdmMigrationAudit {

    @TableId
    private Long id;

    /** 迁移批次ID */
    private Long batchId;

    /** 迁移明细ID（可空，批次级动作为 NULL） */
    private Long itemId;

    /** 动作：preview/confirm/execute/pause/resume/rollback/reconcile */
    private String action;

    /** 结果：success/failed/blocked */
    private String result;

    /** 操作人（认证 SysUser.id） */
    private Long operatorUserId;

    /** 幂等请求ID */
    private String requestId;

    /** 动作前被审计对象版本 */
    private Integer beforeVersion;

    /** 动作后被审计对象版本 */
    private Integer afterVersion;

    /** 动作前哈希 CHAR(64) */
    private String beforeHash;

    /** 动作后哈希 CHAR(64) */
    private String afterHash;

    /** 结果JSON */
    private String resultJson;

    /** 理由 */
    private String reason;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
}
