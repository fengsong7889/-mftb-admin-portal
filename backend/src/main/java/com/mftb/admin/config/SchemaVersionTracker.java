package com.mftb.admin.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.concurrent.atomic.AtomicBoolean;

/**
 * 迁移版本记录器: 通过 sys_schema_version 表记录已执行的一次性建表/迁移/种子步骤,
 * 重启时已执行的步骤直接跳过, 避免每次启动全量重跑初始化 SQL (启动提速)。
 * <p>
 * 用法: 用 {@link #applyOnce(String, Runnable)} 包裹一次性逻辑,
 * versionKey 带版本号 (如 "core:menu-seed-v1");
 * 种子数据变更需要重新执行时, 递增版本号即可 (如 v1 → v2)。
 * <p>
 * 注意: 需要每次启动都执行的"活"逻辑 (如新增部门自动授权) 不要用本组件包裹。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class SchemaVersionTracker {

    private final JdbcTemplate jdbcTemplate;

    /** 建表语句每进程仅执行一次 */
    private final AtomicBoolean tableEnsured = new AtomicBoolean(false);

    /** 判断指定版本是否已执行过 */
    public boolean isApplied(String versionKey) {
        ensureTable();
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_schema_version WHERE version_key = ?",
                Integer.class, versionKey);
        return count != null && count > 0;
    }

    /**
     * 版本未执行过时执行任务并记录版本; 已执行过则直接跳过。
     * 任务抛异常时不记录版本, 下次启动会重试。
     *
     * @return true=本次实际执行了任务, false=已执行过被跳过
     */
    public boolean applyOnce(String versionKey, Runnable task) {
        if (isApplied(versionKey)) {
            return false;
        }
        task.run();
        ensureTable();
        jdbcTemplate.update("INSERT IGNORE INTO sys_schema_version (version_key) VALUES (?)", versionKey);
        log.info("初始化迁移 [{}] 执行完成, 后续重启将跳过", versionKey);
        return true;
    }

    /** 确保版本记录表存在 */
    private void ensureTable() {
        if (tableEnsured.compareAndSet(false, true)) {
            jdbcTemplate.execute(
                    "CREATE TABLE IF NOT EXISTS sys_schema_version ("
                            + "version_key VARCHAR(128) PRIMARY KEY COMMENT '迁移版本标识', "
                            + "applied_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '首次执行时间'"
                            + ") COMMENT='启动初始化迁移版本记录表'");
        }
    }
}
