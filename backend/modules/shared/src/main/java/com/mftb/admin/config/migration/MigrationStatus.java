package com.mftb.admin.config.migration;

/**
 * 迁移登记状态。
 */
public enum MigrationStatus {
    /** 当前有效、启动期自动执行 */
    ACTIVE,
    /** 已退役：不再执行，且禁止为使旧脚本成功而重建（如已废弃业务表） */
    RETIRED,
    /** 被同版本键的更高 minor 取代 */
    SUPERSEDED,
    /** 仅人工执行，不参与启动自动迁移（如生产数据修复、破坏性操作） */
    MANUAL_ONLY
}
