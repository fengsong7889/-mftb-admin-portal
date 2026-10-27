package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * RDM 人工确认的小批迁移计划实体（Batch 4 / rdm:schema:v3.3，对应 238_rdm_batch4_migration.sql）。
 * <p>迁移以「预览 → 人工确认 → 分块执行 → 可暂停/回退」推进，绝不自动迁移业务数据。
 * 以 {@code uk_rdm_migration_request(requested_by, request_id)} 保证同一发起人同一幂等请求只建一个批次。
 * <p>{@code version} 是并发控制版本（乐观锁），非业务版本；{@code chunk_size} 限 1..100。
 */
@Data
@TableName("rdm_migration_batch")
public class RdmMigrationBatch {

    @TableId
    private Long id;

    /** 幂等请求ID */
    private String requestId;

    /** 发起人（认证 SysUser.id） */
    private Long requestedBy;

    /** 状态：previewed/confirmed/running/paused/completed/failed/rolled_back */
    private String status;

    /** 预览哈希 CHAR(64) */
    private String previewHash;

    /** 预览摘要JSON */
    private String previewSummaryJson;

    /** 分块大小（1..100，默认 20） */
    private Integer chunkSize;

    /** 确认人 */
    private Long confirmedBy;

    /** 确认时间 */
    private LocalDateTime confirmedAt;

    /** 暂停时间 */
    private LocalDateTime pausedAt;

    /** 暂停原因 */
    private String pauseReason;

    /** 并发控制版本（乐观锁），非业务版本 */
    @Version
    private Integer version;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
