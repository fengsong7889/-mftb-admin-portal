package com.mftb.admin.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 企业 Agent 平台核心表（应用/预算池/动作提案/知识 ACL/数据分级与端点批准/持久运行/评测发布）。
 *
 * <p>只建新表，不改既有结构；脚本见 {@code 291_agent_platform_core.sql}，登记于
 * {@code db/migrations/catalog.json} 的 {@code ai:agent-platform-core-v1.0}。
 * 结构迁移失败必须抛出，禁止吞异常后被误记为已迁移。
 */
@Slf4j
@Component
@Order(30)
@RequiredArgsConstructor
public class AgentPlatformSchemaInitializer implements CommandLineRunner {

    static final String VERSION_KEY = "ai:agent-platform-core-v1.0";
    /** v1.1：运行租约，支持多实例安全领取与崩溃后快速回收。 */
    static final String VERSION_KEY_LEASE = "ai:agent-platform-core-v1.1";

    static final List<String> TABLES = List.of(
            "ai_application", "ai_application_version", "ai_budget_pool",
            "ai_action_proposal", "ai_action_receipt", "ai_knowledge_acl",
            "ai_data_class_policy", "ai_endpoint_approval",
            "ai_run", "ai_run_step", "ai_eval_case", "ai_eval_run", "ai_release_snapshot");

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;

    @Override
    public void run(String... args) {
        versionTracker.applyOnce(VERSION_KEY, this::migrate, this::verify);
        versionTracker.applyOnce(VERSION_KEY_LEASE, this::addRunLease, this::verifyRunLease);
    }

    /** 运行租约列；先查 INFORMATION_SCHEMA 再 ADD，禁止 ADD COLUMN IF NOT EXISTS。 */
    private void addRunLease() {
        addColumnIfAbsent("ai_run", "lease_owner", "ALTER TABLE ai_run ADD COLUMN lease_owner VARCHAR(96) DEFAULT NULL");
        addColumnIfAbsent("ai_run", "lease_expires_at", "ALTER TABLE ai_run ADD COLUMN lease_expires_at DATETIME DEFAULT NULL");
        addColumnIfAbsent("ai_run", "attempt", "ALTER TABLE ai_run ADD COLUMN attempt INT NOT NULL DEFAULT 0");
        jdbcTemplate.update("UPDATE ai_run SET attempt=0 WHERE attempt IS NULL");
        log.info("Agent 运行租约列就绪: lease_owner / lease_expires_at / attempt");
    }

    private void verifyRunLease() {
        for (String column : List.of("lease_owner", "lease_expires_at", "attempt")) {
            Integer exists = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS "
                            + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_run' AND COLUMN_NAME = ?",
                    Integer.class, column);
            if (exists == null || exists == 0) throw new IllegalStateException("ai_run." + column + " 未就绪");
        }
    }

    /** 列不存在才执行 DDL；失败必须抛出，不能吞异常后被误记为已迁移。 */
    private void addColumnIfAbsent(String table, String column, String ddl) {
        Integer exists = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
                Integer.class, table, column);
        if (exists != null && exists > 0) return;
        jdbcTemplate.execute(ddl);
    }

    private void migrate() {
        jdbcTemplate.execute("CREATE TABLE IF NOT EXISTS ai_application ("
                + "id BIGINT AUTO_INCREMENT PRIMARY KEY, app_key VARCHAR(64) NOT NULL, name VARCHAR(128) NOT NULL,"
                + "system_code VARCHAR(32) NOT NULL DEFAULT 'common', owner_user_id BIGINT DEFAULT NULL,"
                + "owner_name VARCHAR(64) DEFAULT NULL, purpose VARCHAR(512) DEFAULT NULL,"
                + "status TINYINT NOT NULL DEFAULT 1, published_version INT NOT NULL DEFAULT 0,"
                + "created_by VARCHAR(64) DEFAULT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,"
                + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,"
                + "UNIQUE KEY uk_app_key (app_key), KEY idx_app_system (system_code, status))"
                + " COMMENT='Agent 应用注册表'");
        jdbcTemplate.execute("CREATE TABLE IF NOT EXISTS ai_application_version ("
                + "id BIGINT AUTO_INCREMENT PRIMARY KEY, app_id BIGINT NOT NULL, version_no INT NOT NULL,"
                + "status VARCHAR(16) NOT NULL DEFAULT 'draft', model_key VARCHAR(128) DEFAULT NULL,"
                + "prompt_profile_key VARCHAR(64) DEFAULT NULL, tool_whitelist_json TEXT,"
                + "knowledge_systems_json VARCHAR(255) DEFAULT NULL, budget_scope_type VARCHAR(16) DEFAULT 'USER',"
                + "budget_scope_key VARCHAR(64) DEFAULT NULL, change_note VARCHAR(512) DEFAULT NULL,"
                + "published_at DATETIME DEFAULT NULL, published_by VARCHAR(64) DEFAULT NULL,"
                + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP,"
                + "UNIQUE KEY uk_app_version (app_id, version_no), KEY idx_app_version_status (app_id, status))"
                + " COMMENT='Agent 应用版本'");
        jdbcTemplate.execute("CREATE TABLE IF NOT EXISTS ai_budget_pool ("
                + "id BIGINT AUTO_INCREMENT PRIMARY KEY, scope_type VARCHAR(16) NOT NULL, scope_key VARCHAR(64) NOT NULL,"
                + "period VARCHAR(16) NOT NULL, currency VARCHAR(8) NOT NULL DEFAULT 'CNY',"
                + "limit_amount DECIMAL(18,6) NOT NULL DEFAULT 0, reserved_amount DECIMAL(18,6) NOT NULL DEFAULT 0,"
                + "used_amount DECIMAL(18,6) NOT NULL DEFAULT 0, status TINYINT NOT NULL DEFAULT 1,"
                + "created_by VARCHAR(64) DEFAULT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,"
                + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,"
                + "UNIQUE KEY uk_pool_scope (scope_type, scope_key, period, currency), KEY idx_pool_status (status))"
                + " COMMENT='AI 预算池'");
        jdbcTemplate.execute("CREATE TABLE IF NOT EXISTS ai_action_proposal ("
                + "id BIGINT AUTO_INCREMENT PRIMARY KEY, proposal_no VARCHAR(48) NOT NULL, app_key VARCHAR(64) DEFAULT NULL,"
                + "tool_key VARCHAR(64) NOT NULL, tool_version INT NOT NULL DEFAULT 1, params_json MEDIUMTEXT NOT NULL,"
                + "params_hash CHAR(64) NOT NULL, target_resource VARCHAR(255) DEFAULT NULL,"
                + "target_version VARCHAR(64) DEFAULT NULL, impact_summary VARCHAR(512) DEFAULT NULL,"
                + "requester VARCHAR(64) NOT NULL, status VARCHAR(16) NOT NULL DEFAULT 'pending',"
                + "approval_ref VARCHAR(128) DEFAULT NULL, approved_by VARCHAR(64) DEFAULT NULL,"
                + "approved_at DATETIME DEFAULT NULL, expires_at DATETIME NOT NULL, consumed_at DATETIME DEFAULT NULL,"
                + "idempotency_key VARCHAR(96) NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,"
                + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,"
                + "UNIQUE KEY uk_proposal_no (proposal_no), UNIQUE KEY uk_proposal_idem (idempotency_key),"
                + "KEY idx_proposal_requester (requester, status), KEY idx_proposal_status (status, expires_at))"
                + " COMMENT='动作提案'");
        jdbcTemplate.execute("CREATE TABLE IF NOT EXISTS ai_action_receipt ("
                + "id BIGINT AUTO_INCREMENT PRIMARY KEY, proposal_id BIGINT NOT NULL, status VARCHAR(16) NOT NULL,"
                + "external_ref VARCHAR(128) DEFAULT NULL, payload_digest CHAR(64) DEFAULT NULL, detail VARCHAR(512) DEFAULT NULL,"
                + "reconciled TINYINT NOT NULL DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,"
                + "UNIQUE KEY uk_receipt_proposal (proposal_id), KEY idx_receipt_status (status, reconciled))"
                + " COMMENT='动作执行回执'");
        jdbcTemplate.execute("CREATE TABLE IF NOT EXISTS ai_knowledge_acl ("
                + "id BIGINT AUTO_INCREMENT PRIMARY KEY, doc_id BIGINT NOT NULL, subject_type VARCHAR(16) NOT NULL,"
                + "subject_id VARCHAR(64) NOT NULL, permission VARCHAR(16) NOT NULL DEFAULT 'read',"
                + "created_by VARCHAR(64) DEFAULT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,"
                + "UNIQUE KEY uk_acl_subject (doc_id, subject_type, subject_id, permission),"
                + "KEY idx_acl_subject_lookup (subject_type, subject_id, permission)) COMMENT='知识文档收窄 ACL'");
        jdbcTemplate.execute("CREATE TABLE IF NOT EXISTS ai_data_class_policy ("
                + "system_code VARCHAR(32) PRIMARY KEY, data_class VARCHAR(16) NOT NULL, note VARCHAR(255) DEFAULT NULL,"
                + "updated_by VARCHAR(64) DEFAULT NULL, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)"
                + " COMMENT='业务系统数据分级'");
        jdbcTemplate.execute("CREATE TABLE IF NOT EXISTS ai_endpoint_approval ("
                + "id BIGINT AUTO_INCREMENT PRIMARY KEY, model_key VARCHAR(128) NOT NULL, max_data_class VARCHAR(16) NOT NULL,"
                + "residency VARCHAR(16) NOT NULL DEFAULT 'external', status TINYINT NOT NULL DEFAULT 1,"
                + "approved_by VARCHAR(64) DEFAULT NULL, approved_at DATETIME DEFAULT NULL, expires_at DATETIME DEFAULT NULL,"
                + "note VARCHAR(255) DEFAULT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,"
                + "UNIQUE KEY uk_endpoint_model (model_key)) COMMENT='模型端点数据准入批准'");
        jdbcTemplate.execute("CREATE TABLE IF NOT EXISTS ai_run ("
                + "id BIGINT AUTO_INCREMENT PRIMARY KEY, run_no VARCHAR(48) NOT NULL, app_key VARCHAR(64) DEFAULT NULL,"
                + "app_version INT DEFAULT NULL, requester VARCHAR(64) NOT NULL, system_code VARCHAR(32) NOT NULL DEFAULT 'common',"
                + "conversation_pk BIGINT DEFAULT NULL, status VARCHAR(16) NOT NULL DEFAULT 'queued',"
                + "idempotency_key VARCHAR(96) NOT NULL, input_json MEDIUMTEXT, result_json MEDIUMTEXT,"
                + "error_kind VARCHAR(64) DEFAULT NULL, cancel_requested TINYINT NOT NULL DEFAULT 0,"
                + "started_at DATETIME DEFAULT NULL, finished_at DATETIME DEFAULT NULL,"
                + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,"
                + "UNIQUE KEY uk_run_no (run_no), UNIQUE KEY uk_run_idem (idempotency_key), KEY idx_run_status (status, created_at))"
                + " COMMENT='持久化运行'");
        jdbcTemplate.execute("CREATE TABLE IF NOT EXISTS ai_run_step ("
                + "id BIGINT AUTO_INCREMENT PRIMARY KEY, run_id BIGINT NOT NULL, step_no INT NOT NULL, step_type VARCHAR(32) NOT NULL,"
                + "status VARCHAR(16) NOT NULL DEFAULT 'running', tool_key VARCHAR(64) DEFAULT NULL, proposal_id BIGINT DEFAULT NULL,"
                + "detail VARCHAR(512) DEFAULT NULL, elapsed_ms BIGINT DEFAULT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,"
                + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,"
                + "UNIQUE KEY uk_run_step (run_id, step_no), KEY idx_step_status (run_id, status)) COMMENT='运行步骤检查点'");
        jdbcTemplate.execute("CREATE TABLE IF NOT EXISTS ai_eval_case ("
                + "id BIGINT AUTO_INCREMENT PRIMARY KEY, dataset_key VARCHAR(64) NOT NULL, case_no VARCHAR(32) NOT NULL,"
                + "system_code VARCHAR(32) NOT NULL DEFAULT 'common', actor VARCHAR(64) DEFAULT NULL, input_text TEXT NOT NULL,"
                + "expect_json TEXT, must_pass TINYINT NOT NULL DEFAULT 1, created_by VARCHAR(64) DEFAULT NULL,"
                + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY uk_eval_case (dataset_key, case_no))"
                + " COMMENT='评测用例'");
        jdbcTemplate.execute("CREATE TABLE IF NOT EXISTS ai_eval_run ("
                + "id BIGINT AUTO_INCREMENT PRIMARY KEY, dataset_key VARCHAR(64) NOT NULL, app_key VARCHAR(64) DEFAULT NULL,"
                + "app_version INT DEFAULT NULL, total INT NOT NULL DEFAULT 0, passed INT NOT NULL DEFAULT 0,"
                + "failed INT NOT NULL DEFAULT 0, detail_json MEDIUMTEXT, started_by VARCHAR(64) DEFAULT NULL,"
                + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP, KEY idx_eval_run_dataset (dataset_key, created_at))"
                + " COMMENT='评测执行记录'");
        jdbcTemplate.execute("CREATE TABLE IF NOT EXISTS ai_release_snapshot ("
                + "id BIGINT AUTO_INCREMENT PRIMARY KEY, app_key VARCHAR(64) NOT NULL, app_version INT NOT NULL,"
                + "snapshot_json MEDIUMTEXT NOT NULL, released_by VARCHAR(64) DEFAULT NULL,"
                + "released_at DATETIME DEFAULT CURRENT_TIMESTAMP, rolled_back_at DATETIME DEFAULT NULL, note VARCHAR(512) DEFAULT NULL,"
                + "UNIQUE KEY uk_release (app_key, app_version)) COMMENT='不可变发布快照'");
        log.info("Agent 平台核心表就绪: {} 张", TABLES.size());
    }

    private void verify() {
        for (String table : TABLES) {
            Integer exists = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
                    Integer.class, table);
            if (exists == null || exists == 0) {
                throw new IllegalStateException("Agent 平台表未就绪: " + table);
            }
        }
    }
}
