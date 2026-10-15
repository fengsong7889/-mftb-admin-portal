package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.FieldStrategy;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * RDM 逐项迁移明细实体（Batch 4 / rdm:schema:v3.3，对应 238_rdm_batch4_migration.sql）。
 * <p>每条需求逐项「预览 → 确认 → 执行 → 保守回退」，执行前冻结 before 快照与既有事实基线
 * （{@code fact_baseline_json}），回退须重读差异、不伪造证据。
 * <p>{@code active_req_id} 是数据库 STORED 生成列（status 处于 confirmed/running/completed/blocked 时等于 req_id，否则 NULL），
 * 配合 {@code uk_rdm_migration_active_req} 保证「一个需求同时只有一条生效迁移项」。生成列由数据库维护，实体侧禁止写。
 * <p>字段区分：{@code sourceVersion} = 迁移前需求的业务并发版本快照；{@code sourceFlowVersion} ∈ {1,2}；
 * {@code version} = 本迁移项自身的并发控制版本（乐观锁），三者不可混用。
 */
@Data
@TableName("rdm_migration_item")
public class RdmMigrationItem {

    @TableId
    private Long id;

    /** 迁移批次ID */
    private Long batchId;

    /** 需求ID */
    private Long reqId;

    /** 目标项目ID（可空） */
    private Long targetProjectId;

    /** 来源流程版本（1 或 2） */
    private Integer sourceFlowVersion;

    /** 迁移前需求的业务并发版本快照，非本项 version */
    private Integer sourceVersion;

    /** 预览哈希 CHAR(64) */
    private String previewHash;

    /** 执行前快照JSON：原范围、任务归属、整改来源和版本摘要 */
    private String beforeSnapshotJson;

    /** 执行后快照JSON：关联及版本摘要，不伪造证据 */
    private String afterSnapshotJson;

    /** 事实基线JSON：执行前已有事实ID集合与摘要，回滚须重读差异 */
    private String factBaselineJson;

    /** 已执行事实哈希 CHAR(64) */
    private String executedFactHash;

    /** 状态：previewed/confirmed/running/completed/failed/blocked/rolled_back */
    private String status;

    /**
     * 数据库 STORED 生成列：status ∈ (confirmed,running,completed,blocked) 时等于 req_id，否则 NULL。
     * 由 {@code uk_rdm_migration_active_req} 保证一个需求只有一条生效迁移项；实体侧只读，禁止写。
     */
    @TableField(value = "active_req_id", insertStrategy = FieldStrategy.NEVER, updateStrategy = FieldStrategy.NEVER)
    private Long activeReqId;

    /** 确认人 */
    private Long confirmedBy;

    /** 确认时间 */
    private LocalDateTime confirmedAt;

    /** 执行人 */
    private Long executedBy;

    /** 执行时间 */
    private LocalDateTime executedAt;

    /** 回退人 */
    private Long rolledBackBy;

    /** 回退时间 */
    private LocalDateTime rolledBackAt;

    /** 执行结果JSON */
    private String resultJson;

    /** 阻塞原因 */
    private String blockingReason;

    /** 本迁移项并发控制版本（乐观锁），非 sourceVersion 业务版本 */
    @Version
    private Integer version;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
