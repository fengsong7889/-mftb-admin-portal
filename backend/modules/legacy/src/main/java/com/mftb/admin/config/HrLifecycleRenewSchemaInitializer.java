package com.mftb.admin.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * HR 入转调离引擎扩展「合同續簽」单据（P0 合同到期预警与续签）：
 * 为 hr_lifecycle_request 补齐合同维度 7 列 + 种子 biz_oa_process.hr_renew。
 * <p>
 * MySQL 不支持 {@code ADD COLUMN IF NOT EXISTS}，逐列先查 INFORMATION_SCHEMA.COLUMNS 再 ADD；
 * 遵循迁移治理 {@code applyOnce(versionKey, task, verify)} —— 加列与后置校验都成功才记版本，
 * 失败抛出（不吞异常）下次启动重试。列契约同时登记 ContractRegistry 保证启动自愈。
 * 参考 SQL: backend/sql/196_hr_lifecycle_renew.sql
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class HrLifecycleRenewSchemaInitializer implements CommandLineRunner {

    private static final String VERSION_KEY = "hr:lifecycle-renew:v1.0";

    /** {列名, DDL 片段} —— 与 196_hr_lifecycle_renew.sql / ContractRegistry 列契约保持同构 */
    private static final String[][] COLUMNS = {
            {"contract_id", "BIGINT DEFAULT NULL COMMENT '被续签的原合同ID(emp_contract.id)'"},
            {"contract_no", "VARCHAR(64) DEFAULT NULL COMMENT '原合同编号快照'"},
            {"new_contract_no", "VARCHAR(64) DEFAULT NULL COMMENT '新合同编号'"},
            {"new_contract_type", "VARCHAR(32) DEFAULT NULL COMMENT '新合同类型(HR字典 CONTRACT_TYPE)'"},
            {"new_contract_company", "VARCHAR(128) DEFAULT NULL COMMENT '新合同签约主体(HR字典 EMPLOYER_COMPANY)'"},
            {"new_contract_start_date", "DATE DEFAULT NULL COMMENT '新合同开始日期'"},
            {"new_contract_end_date", "DATE DEFAULT NULL COMMENT '新合同结束日期'"},
    };

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;

    @Override
    public void run(String... args) {
        try {
            versionTracker.applyOnce(VERSION_KEY, this::migrate, this::verify);
        } catch (Exception e) {
            // applyOnce 已写失败审计且不记版本；此处仅避免阻塞本地启动，下次启动会重试
            log.error("HR 合同續簽列扩展/種子失敗: {}", e.getMessage(), e);
        }
    }

    private void migrate() {
        for (String[] col : COLUMNS) {
            if (columnExists(col[0])) {
                continue;
            }
            jdbcTemplate.update("ALTER TABLE hr_lifecycle_request ADD COLUMN " + col[0] + " " + col[1]);
            log.info("hr_lifecycle_request 已加列: {}", col[0]);
        }
        seedRenewProcess();
    }

    /** 续签 OA 流程定义种子（挂 oa_general 通用审批节点，可在「流程配置」单独编排） */
    private void seedRenewProcess() {
        int inserted = jdbcTemplate.update(
                "INSERT IGNORE INTO biz_oa_process "
                        + "(process_code, process_name, category, icon, description, workflow_type, sort_order, status) "
                        + "VALUES ('hr_renew', '合同續簽', 'hr', 'FileSyncOutlined', "
                        + "'勞動合同到期續簽審批流程，通過後自動寫入新合同', 'oa_general', 15, 1)");
        if (inserted > 0) {
            log.info("已写入 hr_renew OA 流程定义种子");
        }
    }

    private boolean columnExists(String column) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.COLUMNS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_lifecycle_request' AND COLUMN_NAME = ?",
                Integer.class, column);
        return count != null && count > 0;
    }

    /** 后置校验：7 列与流程定义必须全部就绪，否则抛出不记版本 */
    private void verify() {
        for (String[] col : COLUMNS) {
            if (!columnExists(col[0])) {
                throw new IllegalStateException("hr_lifecycle_request 列未就绪: " + col[0]);
            }
        }
        Integer process = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM biz_oa_process WHERE process_code = 'hr_renew'", Integer.class);
        if (process == null || process == 0) {
            throw new IllegalStateException("hr_renew 流程定义未就绪");
        }
    }
}
