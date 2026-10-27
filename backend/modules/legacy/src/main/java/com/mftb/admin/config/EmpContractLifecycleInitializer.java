package com.mftb.admin.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 合同台账生命周期字段（C4 第二批）：续签/变更链、解除事件、签署证据。
 * <p>
 * 为什么不新建表：`emp_contract` 已是「一人多份合同」的台账，一行一份；续签只是新的一行，
 * 用 {@code previous_contract_id} 串成链即可。拆出「合同事件表」会让「当前有效合同」
 * 需要跨表推断，反而容易算错。
 * <p>
 * ALTER TABLE 不可重放：逐列先查 information_schema 再补，缺哪列补哪列；
 * 后置校验要求六列齐全，否则不记版本、下次启动重试。
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(25)
public class EmpContractLifecycleInitializer implements CommandLineRunner {

    static final String VERSION_KEY = "hr:contract-lifecycle:v1.0";

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;

    @Override
    public void run(String... args) {
        try {
            versionTracker.applyOnce(VERSION_KEY, this::migrate, this::verify);
        } catch (Exception e) {
            log.error("合同生命周期字段迁移失败: {}", e.getMessage(), e);
        }
    }

    private void migrate() {
        addColumnIfAbsent("emp_contract", "change_type",
                "ALTER TABLE emp_contract ADD COLUMN change_type VARCHAR(16) NOT NULL DEFAULT 'NEW' "
                        + "COMMENT '变更类型 NEW/RENEW/CHANGE' AFTER status");
        addColumnIfAbsent("emp_contract", "previous_contract_id",
                "ALTER TABLE emp_contract ADD COLUMN previous_contract_id BIGINT DEFAULT NULL "
                        + "COMMENT '上一份合同ID（续签/变更链）' AFTER change_type");
        addColumnIfAbsent("emp_contract", "terminated_date",
                "ALTER TABLE emp_contract ADD COLUMN terminated_date DATE DEFAULT NULL "
                        + "COMMENT '解除/终止日期' AFTER previous_contract_id");
        addColumnIfAbsent("emp_contract", "terminate_reason",
                "ALTER TABLE emp_contract ADD COLUMN terminate_reason VARCHAR(255) DEFAULT NULL "
                        + "COMMENT '解除原因' AFTER terminated_date");
        addColumnIfAbsent("emp_contract", "evidence_url",
                "ALTER TABLE emp_contract ADD COLUMN evidence_url VARCHAR(500) DEFAULT NULL "
                        + "COMMENT '签署证据地址' AFTER terminate_reason");
        addColumnIfAbsent("emp_contract", "evidence_name",
                "ALTER TABLE emp_contract ADD COLUMN evidence_name VARCHAR(128) DEFAULT NULL "
                        + "COMMENT '证据文件名' AFTER evidence_url");
    }

    private void addColumnIfAbsent(String table, String column, String alterSql) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.COLUMNS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
                Integer.class, table, column);
        if (count == null || count == 0) {
            jdbcTemplate.execute(alterSql);
            log.info("已新增欄位 {}.{}", table, column);
        }
    }

    private void verify() {
        for (String column : new String[]{"change_type", "previous_contract_id", "terminated_date",
                "terminate_reason", "evidence_url", "evidence_name"}) {
            Integer count = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM information_schema.COLUMNS "
                            + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'emp_contract' AND COLUMN_NAME = ?",
                    Integer.class, column);
            if (count == null || count == 0) {
                throw new IllegalStateException("emp_contract 缺少欄位: " + column);
            }
        }
    }
}
