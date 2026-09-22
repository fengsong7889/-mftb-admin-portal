package com.mftb.admin.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.concurrent.atomic.AtomicBoolean;

/**
 * 迁移版本记录器: 通过 sys_schema_version 表记录已执行的一次性建表/迁移/种子步骤,
 * 重启时已执行的步骤直接跳过, 避免每次启动全量重跑初始化 SQL (启动提速)。
 * <p>
 * 用法: 用 {@link #applyOnce(String, Runnable)} 包裹一次性逻辑,
 * versionKey 带版本号; 种子数据变更需要重新执行时, 递增版本号即可。
 * <p>
 * <b>兼容式治理增强（本次改造）：</b>
 * <ul>
 *   <li>{@link #applyOnce(String, Runnable, Runnable)} 支持后置校验，<b>只有任务执行成功且校验通过</b>
 *       才写入成功版本，杜绝“任务吞异常/结构未就绪却被记为成功”导致的漏迁移。</li>
 *   <li>版本记录表初始化标志改为 DDL 成功后再置位，失败可下次重试（修复原 AtomicBoolean 提前置 true 的缺陷）。</li>
 *   <li>新增 {@code sys_schema_migration_log} 审计表记录每次执行的版本、状态、构建标识与耗时。</li>
 *   <li>写入成功版本后回读确认，避免静默失败被当作成功。</li>
 * </ul>
 * <p>
 * <b>版本键命名约定 (Semantic Versioning 风格):</b> 格式 {@code {module}:{step}-v{major}.{minor}}；
 * 历史遗留键仍使用 {@code v{N}}。变更内容必须递增版本，不复用旧 key。
 * <p>
 * 注意: 需要每次启动都执行的"活"逻辑 (如新增部门自动授权) 不要用本组件包裹。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class SchemaVersionTracker {

    private final JdbcTemplate jdbcTemplate;

    /** 构建/部署标识（用于审计），默认取环境变量 APP_BUILD_TAG，缺省 unknown */
    @Value("${app.build-tag:${APP_BUILD_TAG:unknown}}")
    private String buildTag;

    /** 记录表就绪标志：仅在 DDL 成功后置 true，失败保持 false 以便下次重试 */
    private final AtomicBoolean tablesEnsured = new AtomicBoolean(false);

    /** 判断指定版本是否已执行过 */
    public boolean isApplied(String versionKey) {
        ensureTables();
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
        return applyOnce(versionKey, task, null);
    }

    /**
     * 带后置校验的一次性迁移。任务执行成功<b>且</b>校验通过后才记录版本；
     * 校验或任务抛出异常时不记录、写审计失败记录并向上传播，下次启动重试。
     *
     * @param verify 可空；非空时必须在任务后执行且不抛异常，用于确认结构真正就绪
     */
    public boolean applyOnce(String versionKey, Runnable task, Runnable verify) {
        if (isApplied(versionKey)) {
            return false;
        }
        long start = System.currentTimeMillis();
        try {
            task.run();
            if (verify != null) {
                verify.run();
            }
        } catch (RuntimeException e) {
            long cost = System.currentTimeMillis() - start;
            log.error("初始化迁移 [{}] 执行/校验失败, 不记录版本, 下次启动重试: {}", versionKey, e.getMessage(), e);
            writeAudit(versionKey, "FAILED", cost, sanitize(e));
            throw e;
        }
        long cost = System.currentTimeMillis() - start;
        recordSuccess(versionKey);
        writeAudit(versionKey, "SUCCESS", cost, null);
        log.info("初始化迁移 [{}] 执行并校验完成, 后续重启将跳过 ({}ms)", versionKey, cost);
        return true;
    }

    /** 写入成功版本并回读确认，确认失败视为严重错误抛出（不静默）。 */
    private void recordSuccess(String versionKey) {
        ensureTables();
        // INSERT IGNORE 用于消解并发实例的重复插入；随后回读确认行确实存在，
        // 从而把“权限/磁盘/约束等导致的静默未写入”暴露为异常，而非误记成功。
        jdbcTemplate.update("INSERT IGNORE INTO sys_schema_version (version_key) VALUES (?)", versionKey);
        if (!isApplied(versionKey)) {
            throw new IllegalStateException("迁移版本记录写入后回读缺失，疑似数据库未持久化: " + versionKey);
        }
    }

    /** 尽力写入审计记录；审计失败不影响迁移主流程（仅告警）。 */
    private void writeAudit(String versionKey, String status, long costMs, String detail) {
        try {
            ensureTables();
            jdbcTemplate.update(
                    "INSERT INTO sys_schema_migration_log (version_key, status, cost_ms, build_tag, detail) "
                            + "VALUES (?, ?, ?, ?, ?)",
                    versionKey, status, costMs, buildTag, detail);
        } catch (Exception e) {
            log.warn("写入迁移审计日志失败 [{}]: {}", versionKey, e.getMessage());
        }
    }

    /** 确保版本记录表与审计表存在；DDL 成功后才置位标志，失败可在下次调用重试。 */
    private void ensureTables() {
        if (tablesEnsured.get()) {
            return;
        }
        synchronized (this) {
            if (tablesEnsured.get()) {
                return;
            }
            jdbcTemplate.execute(
                    "CREATE TABLE IF NOT EXISTS sys_schema_version ("
                            + "version_key VARCHAR(128) PRIMARY KEY COMMENT '迁移版本标识', "
                            + "applied_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '首次执行时间'"
                            + ") COMMENT='启动初始化迁移版本记录表'");
            jdbcTemplate.execute(
                    "CREATE TABLE IF NOT EXISTS sys_schema_migration_log ("
                            + "id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID', "
                            + "version_key VARCHAR(128) NOT NULL COMMENT '迁移版本标识', "
                            + "status VARCHAR(16) NOT NULL COMMENT '执行状态: SUCCESS/FAILED', "
                            + "cost_ms BIGINT COMMENT '耗时毫秒', "
                            + "build_tag VARCHAR(128) COMMENT '构建/部署标识', "
                            + "detail VARCHAR(512) COMMENT '脱敏失败摘要', "
                            + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '记录时间', "
                            + "KEY idx_migration_log_key (version_key)"
                            + ") COMMENT='迁移执行审计日志表'");
            tablesEnsured.set(true);
        }
    }

    /** 截断并去除堆栈中的换行，避免污染审计表与日志。 */
    private String sanitize(Throwable e) {
        String msg = e.getMessage();
        if (msg == null) {
            msg = e.getClass().getSimpleName();
        }
        String oneLine = msg.replaceAll("\\s+", " ").trim();
        return oneLine.length() > 500 ? oneLine.substring(0, 500) : oneLine;
    }
}
