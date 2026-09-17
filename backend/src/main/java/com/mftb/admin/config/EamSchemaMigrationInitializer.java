package com.mftb.admin.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * EAM 归还/借用/赔付表结构迁移初始化器
 * <p>
 * 对应 SQL 脚本: backend/sql/150_eam_claim_signature_return.sql,
 *              backend/sql/151_eam_return_borrow_compensation.sql
 * <p>
 * 通过 SchemaVersionTracker 保证幂等: 已执行过的版本重启时跳过。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class EamSchemaMigrationInitializer implements CommandLineRunner {

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;

    /** v1: 归还表扩展列 + 借用/赔付/收款/复核 建表 + 凭证表补列 + 菜单 */
    private static final String V_EAM_RETURN_BORROW_COMP = "eam:schema-v1";
    /** v2: claim_id 改为可空（借用归还场景无 claim_id） */
    private static final String V_EAM_RETURN_CLAIM_NULL = "eam:schema-v2";

    @Override
    public void run(String... args) {
        versionTracker.applyOnce(V_EAM_RETURN_BORROW_COMP, this::migrateEamSchema);
        versionTracker.applyOnce(V_EAM_RETURN_CLAIM_NULL, this::fixClaimIdNullable);
    }

    private void fixClaimIdNullable() {
        log.info("修复 biz_eam_return.claim_id 为可空 ...");
        jdbcTemplate.execute("ALTER TABLE biz_eam_return MODIFY COLUMN claim_id BIGINT NULL COMMENT '关联领用 ID'");
        log.info("biz_eam_return.claim_id 已修改为可空");
    }

    private void migrateEamSchema() {
        log.info("开始执行 EAM 归还/借用/赔付 表结构迁移 ...");

        // ───────────── biz_eam_return 扩展列 ─────────────
        alterSafe("biz_eam_return",
                "ADD COLUMN return_status VARCHAR(20) NOT NULL DEFAULT 'completed' COMMENT '归还状态：completed/exception_pending/exception_closed'");
        alterSafe("biz_eam_return",
                "ADD COLUMN asset_condition VARCHAR(20) NOT NULL DEFAULT 'normal' COMMENT '归还时资产状况：normal/damaged/lost'");
        alterSafe("biz_eam_return",
                "ADD COLUMN exception_reason VARCHAR(500) NULL COMMENT '异常原因说明'");
        alterSafe("biz_eam_return",
                "ADD COLUMN disposition VARCHAR(20) NULL COMMENT '实物处置结果：idle/scrapped/written_off'");
        alterSafe("biz_eam_return",
                "ADD COLUMN disposition_date DATE NULL COMMENT '处置日期'");
        alterSafe("biz_eam_return",
                "ADD COLUMN disposition_evidence_id BIGINT NULL COMMENT '处置凭证 ID'");
        alterSafe("biz_eam_return",
                "ADD COLUMN recovered TINYINT NOT NULL DEFAULT 0 COMMENT '是否已找回：0=否 1=是'");
        alterSafe("biz_eam_return",
                "ADD COLUMN recovered_date DATE NULL COMMENT '找回日期'");
        alterSafe("biz_eam_return",
                "ADD COLUMN recovered_note VARCHAR(500) NULL COMMENT '找回说明'");
        alterSafe("biz_eam_return",
                "ADD COLUMN actual_returnee_id BIGINT NULL COMMENT '实际归还人 ID（代还场景）'");
        alterSafe("biz_eam_return",
                "ADD COLUMN actual_returnee_name VARCHAR(64) NULL COMMENT '实际归还人姓名'");
        alterSafe("biz_eam_return",
                "ADD COLUMN source_type VARCHAR(10) NOT NULL DEFAULT 'claim' COMMENT '来源类型：claim/borrow'");
        alterSafe("biz_eam_return",
                "ADD COLUMN source_id BIGINT NOT NULL DEFAULT 0 COMMENT '来源 ID（claim_id 或 borrow_id）'");
        alterSafe("biz_eam_return",
                "ADD COLUMN compensation_id BIGINT NULL COMMENT '关联赔付记录 ID'");
        addIndexSafe("biz_eam_return", "idx_return_status", "return_status");
        addIndexSafe("biz_eam_return", "idx_source", "source_type, source_id");
        addIndexSafe("biz_eam_return", "idx_compensation", "compensation_id");

        // ───────────── biz_eam_borrow 借用登记主表 ─────────────
        jdbcTemplate.execute(
                "CREATE TABLE IF NOT EXISTS biz_eam_borrow ("
                + "id BIGINT AUTO_INCREMENT PRIMARY KEY, "
                + "borrow_no VARCHAR(32) NOT NULL COMMENT '借用编号（JY+YYYYMMDD+4位）', "
                + "asset_id BIGINT NOT NULL COMMENT '资产 ID', "
                + "holder_id BIGINT NOT NULL COMMENT '借用人 ID', "
                + "holder_name VARCHAR(64) NOT NULL COMMENT '借用人姓名快照', "
                + "department VARCHAR(100) NOT NULL COMMENT '借用部门', "
                + "operator_id BIGINT NULL COMMENT '操作人 ID', "
                + "operator_name VARCHAR(64) NOT NULL COMMENT '操作人姓名快照', "
                + "status VARCHAR(20) NOT NULL DEFAULT 'active' COMMENT 'active/overdue/returned/cancelled', "
                + "start_date DATE NOT NULL COMMENT '借出日期', "
                + "due_date DATE NOT NULL COMMENT '到期日期', "
                + "return_date DATE NULL COMMENT '实际归还日期', "
                + "purpose VARCHAR(500) NULL COMMENT '借用用途', "
                + "renew_count INT NOT NULL DEFAULT 0 COMMENT '续借次数', "
                + "return_id BIGINT NULL COMMENT '关联归还记录 ID', "
                + "created_by VARCHAR(64) NULL COMMENT '创建人', "
                + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP, "
                + "updated_by VARCHAR(64) NULL COMMENT '最后更新人', "
                + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, "
                + "deleted TINYINT NOT NULL DEFAULT 0, "
                + "UNIQUE KEY uk_borrow_no (borrow_no), "
                + "INDEX idx_asset (asset_id), "
                + "INDEX idx_holder (holder_id), "
                + "INDEX idx_status (status), "
                + "INDEX idx_due_date (due_date)"
                + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='资产借用登记表'");

        // ───────────── biz_eam_compensation 赔付记录主表 ─────────────
        jdbcTemplate.execute(
                "CREATE TABLE IF NOT EXISTS biz_eam_compensation ("
                + "id BIGINT AUTO_INCREMENT PRIMARY KEY, "
                + "comp_no VARCHAR(32) NOT NULL COMMENT '赔付编号（PF+YYYYMMDD+4位）', "
                + "return_id BIGINT NOT NULL COMMENT '关联归还记录 ID', "
                + "asset_id BIGINT NOT NULL COMMENT '资产 ID', "
                + "asset_name VARCHAR(200) NOT NULL COMMENT '资产名称快照', "
                + "asset_no VARCHAR(64) NOT NULL COMMENT '资产编号快照', "
                + "holder_id BIGINT NOT NULL COMMENT '原持有人 ID', "
                + "holder_name VARCHAR(64) NOT NULL COMMENT '原持有人姓名快照', "
                + "damage_type VARCHAR(20) NOT NULL COMMENT '损失类型：damage/loss', "
                + "cause VARCHAR(20) NULL COMMENT '原因：human/natural/third_party/quality', "
                + "party VARCHAR(20) NULL COMMENT '责任对象：employee/department/company/none', "
                + "responsible_id BIGINT NULL COMMENT '责任人 ID', "
                + "responsible_name VARCHAR(64) NULL COMMENT '责任人姓名', "
                + "department VARCHAR(100) NULL COMMENT '责任部门', "
                + "amount BIGINT NOT NULL DEFAULT 0 COMMENT '应赔金额（分）', "
                + "net_paid BIGINT NOT NULL DEFAULT 0 COMMENT '净收款（分）', "
                + "status VARCHAR(20) NOT NULL DEFAULT 'pending' COMMENT 'pending/confirmed/partially_paid/paid/waived/refund_pending', "
                + "review_required TINYINT NOT NULL DEFAULT 0 COMMENT '是否需要找回复核：0=否 1=是', "
                + "basis VARCHAR(500) NULL COMMENT '定责依据', "
                + "reason VARCHAR(500) NULL COMMENT '异常说明', "
                + "waive_reason VARCHAR(500) NULL COMMENT '免赔原因', "
                + "operator_id BIGINT NULL COMMENT '操作人 ID', "
                + "operator_name VARCHAR(64) NOT NULL COMMENT '操作人姓名快照', "
                + "created_by VARCHAR(64) NULL COMMENT '创建人', "
                + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP, "
                + "updated_by VARCHAR(64) NULL COMMENT '最后更新人', "
                + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, "
                + "deleted TINYINT NOT NULL DEFAULT 0, "
                + "UNIQUE KEY uk_comp_no (comp_no), "
                + "INDEX idx_return (return_id), "
                + "INDEX idx_asset (asset_id), "
                + "INDEX idx_holder (holder_id), "
                + "INDEX idx_status (status), "
                + "INDEX idx_review_required (review_required)"
                + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='资产赔付记录表'");

        // ───────────── biz_eam_compensation_payment 赔付收款/退款流水 ─────────────
        jdbcTemplate.execute(
                "CREATE TABLE IF NOT EXISTS biz_eam_compensation_payment ("
                + "id BIGINT AUTO_INCREMENT PRIMARY KEY, "
                + "compensation_id BIGINT NOT NULL COMMENT '关联赔付记录 ID', "
                + "type VARCHAR(10) NOT NULL COMMENT '类型：payment/refund', "
                + "amount BIGINT NOT NULL COMMENT '金额（分）', "
                + "payment_date DATE NOT NULL COMMENT '业务日期', "
                + "reason VARCHAR(500) NULL COMMENT '说明', "
                + "evidence_id BIGINT NULL COMMENT '凭证 ID', "
                + "operator_id BIGINT NULL COMMENT '操作人 ID', "
                + "operator_name VARCHAR(64) NOT NULL COMMENT '操作人姓名', "
                + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP, "
                + "INDEX idx_compensation (compensation_id)"
                + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='赔付收款/退款流水表'");

        // ───────────── biz_eam_compensation_review 赔付找回复核记录 ─────────────
        jdbcTemplate.execute(
                "CREATE TABLE IF NOT EXISTS biz_eam_compensation_review ("
                + "id BIGINT AUTO_INCREMENT PRIMARY KEY, "
                + "compensation_id BIGINT NOT NULL COMMENT '关联赔付记录 ID', "
                + "review_date DATE NOT NULL COMMENT '复核日期', "
                + "before_amount BIGINT NOT NULL COMMENT '原应赔金额（分）', "
                + "after_amount BIGINT NOT NULL COMMENT '复核后应赔金额（分）', "
                + "reason VARCHAR(500) NOT NULL COMMENT '调整理由', "
                + "operator_id BIGINT NULL COMMENT '操作人 ID', "
                + "operator_name VARCHAR(64) NOT NULL COMMENT '操作人姓名', "
                + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP, "
                + "INDEX idx_compensation (compensation_id)"
                + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='赔付找回复核记录表'");

        // ───────────── 凭证附件表扩展 ─────────────
        alterSafe("biz_eam_claim_evidence",
                "ADD COLUMN biz_type VARCHAR(20) NOT NULL DEFAULT 'claim' COMMENT '业务类型：claim/return/borrow/compensation'");
        alterSafe("biz_eam_claim_evidence",
                "ADD COLUMN biz_id BIGINT NULL COMMENT '业务 ID'");
        addIndexSafe("biz_eam_claim_evidence", "idx_biz", "biz_type, biz_id");

        // ───────────── 菜单配置 ─────────────
        // 查找资产管理父菜单 ID
        Long assetMgmtId = jdbcTemplate.queryForObject(
                "SELECT id FROM sys_menu WHERE menu_key = 'asset-management' AND deleted = 0 LIMIT 1", Long.class);
        if (assetMgmtId == null) {
            log.warn("未找到 asset-management 菜单, 跳过子菜单创建");
        } else {
            String actions = "[\"view\",\"create\",\"edit\",\"delete\",\"export\"]";
            // 借用管理菜单（asset-return 已在 DataInitializer 中创建）
            ensureMenu(assetMgmtId, "asset-borrow", "借用管理", "/asset-borrow",
                    "AssetBorrow", "FieldTimeOutlined", 9, actions);
            // 损坏赔付菜单
            ensureMenu(assetMgmtId, "asset-compensation", "損壞賠付", "/asset-compensation",
                    "AssetCompensation", "WarningOutlined", 10, actions);

            // 角色菜单关联（admin 角色自动获得新菜单权限）
            Long adminRoleId = jdbcTemplate.queryForObject(
                    "SELECT id FROM sys_role WHERE code = 'admin' LIMIT 1", Long.class);
            if (adminRoleId != null) {
                String[] newMenuKeys = {"asset-borrow", "asset-compensation"};
                for (String mk : newMenuKeys) {
                    jdbcTemplate.update(
                            "INSERT INTO sys_role_menu (role_id, menu_id, actions) "
                                    + "SELECT ?, m.id, ? FROM sys_menu m WHERE m.menu_key = ? AND m.deleted = 0 "
                                    + "ON DUPLICATE KEY UPDATE actions = VALUES(actions)",
                            adminRoleId, actions, mk);
                }
            }
        }

        log.info("EAM 归还/借用/赔付 表结构迁移完成");
    }

    /** 确保菜单存在（按 menu_key 判断，已存在则跳过） */
    private void ensureMenu(Long parentId, String menuKey, String name, String path,
                            String component, String icon, int sortOrder, String actions) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_menu WHERE menu_key = ? AND deleted = 0", Integer.class, menuKey);
        if (count != null && count > 0) {
            log.debug("菜单已存在, 跳过: {}", menuKey);
            return;
        }
        jdbcTemplate.update(
                "INSERT INTO sys_menu (parent_id, menu_key, name, path, component, icon, type, sort_order, actions, status, updated_by, deleted) "
                + "VALUES (?, ?, ?, ?, ?, ?, 2, ?, ?, 1, 'system', 0)",
                parentId, menuKey, name, path, component, icon, sortOrder, actions);
        log.info("已创建菜单: {} ({})", name, menuKey);
    }

    /** 安全 ALTER TABLE ADD COLUMN —— 先检查列是否存在, 不存在才执行 */
    private void alterSafe(String table, String columnDef) {
        try {
            jdbcTemplate.execute("ALTER TABLE " + table + " " + columnDef);
        } catch (Exception e) {
            if (isDuplicateColumnError(e)) {
                String colName = columnDef.trim().split("\\s+")[0];
                log.debug("列已存在, 跳过: {}.{}", table, colName);
            } else {
                throw e; // 其他异常向上抛
            }
        }
    }

    /** 安全添加索引 —— 捕获 Duplicate key name 异常 */
    private void addIndexSafe(String table, String indexName, String columns) {
        try {
            jdbcTemplate.execute("ALTER TABLE " + table + " ADD INDEX " + indexName + " (" + columns + ")");
        } catch (Exception e) {
            if (isDuplicateColumnError(e) || isDuplicateIndexError(e)) {
                log.debug("索引已存在, 跳过: {}.{}", table, indexName);
            } else {
                throw e;
            }
        }
    }

    /** 递归检查异常链是否包含“列已存在”错误 */
    private boolean isDuplicateColumnError(Throwable t) {
        Throwable cur = t;
        while (cur != null) {
            String msg = cur.getMessage();
            if (msg != null && msg.toLowerCase().contains("duplicate column")) return true;
            cur = cur.getCause();
        }
        return false;
    }

    /** 递归检查异常链是否包含“索引已存在”错误 */
    private boolean isDuplicateIndexError(Throwable t) {
        Throwable cur = t;
        while (cur != null) {
            String msg = cur.getMessage();
            if (msg != null && (msg.contains("Duplicate key name") || msg.contains("already exists"))) return true;
            cur = cur.getCause();
        }
        return false;
    }
}
