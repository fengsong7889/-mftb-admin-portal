package com.mftb.admin.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

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
    /** v3: 交接表建表（biz_eam_handover + biz_eam_handover_item） */
    private static final String V_EAM_HANDOVER_TABLES = "eam:schema-v3";
    /** v4: 调拨单建表（biz_eam_transfer） */
    private static final String V_EAM_TRANSFER_TABLE = "eam:schema-v4";
    /** v5: 调拨单补充原使用人工号列 */
    private static final String V_EAM_TRANSFER_FROM_EMP = "eam:schema-v5";

    @Override
    public void run(String... args) {
        versionTracker.applyOnce(V_EAM_RETURN_BORROW_COMP, this::migrateEamSchema);
        versionTracker.applyOnce(V_EAM_RETURN_CLAIM_NULL, this::fixClaimIdNullable);
        versionTracker.applyOnce(V_EAM_HANDOVER_TABLES, this::createHandoverTables);
        versionTracker.applyOnce(V_EAM_TRANSFER_TABLE, this::createTransferTable);
        versionTracker.applyOnce(V_EAM_TRANSFER_FROM_EMP, this::addTransferFromUserEmpId);
        versionTracker.applyOnce("eam:schema-v6-transfer-integrity", this::upgradeTransferIntegrity);
        versionTracker.applyOnce("eam:schema-v7-model-code", this::addModelCodeColumn);
        versionTracker.applyOnce("eam:schema-v8-merge-category-brand", this::mergeCategoryBrandTables);
        versionTracker.applyOnce("eam:schema-v9-rename-master-data", this::renameMasterDataMenu);
        versionTracker.applyOnce("eam:schema-v10-repair-table", this::createRepairTable);
    }

    private void upgradeTransferIntegrity() {
        alterSafe("biz_eam_asset", "ADD COLUMN hold_version BIGINT NOT NULL DEFAULT 0");
        alterSafe("biz_eam_claim", "ADD COLUMN source_transfer_id BIGINT NULL");
        alterSafe("biz_eam_claim", "ADD COLUMN previous_claim_id BIGINT NULL");
        String[] columns = {
                "brand_id BIGINT NULL", "brand VARCHAR(128) NULL", "brand_backfilled TINYINT NOT NULL DEFAULT 0",
                "from_department_id BIGINT NULL", "to_department_id BIGINT NULL",
                "from_claim_id BIGINT NULL", "to_claim_id BIGINT NULL", "from_usage_date VARCHAR(32) NULL",
                "applied_version BIGINT NULL", "request_key VARCHAR(64) NULL", "request_hash VARCHAR(64) NULL",
                "cancel_reason VARCHAR(500) NULL", "cancelled_by VARCHAR(128) NULL", "cancelled_at DATETIME NULL"
        };
        for (String column : columns) alterSafe("biz_eam_transfer", "ADD COLUMN " + column);
        try {
            jdbcTemplate.execute("ALTER TABLE biz_eam_transfer ADD UNIQUE INDEX uk_transfer_request (operator_id, request_key)");
        } catch (Exception e) {
            if (!isDuplicateIndexError(e)) throw e;
        }
        addIndexSafe("biz_eam_transfer", "idx_transfer_asset", "asset_id,id");
        addIndexSafe("biz_eam_transfer", "idx_transfer_brand", "brand_id");
        addIndexSafe("biz_eam_claim", "idx_claim_transfer", "source_transfer_id");
        // 旧单只能按当前台账补录，显式标记来源，不能冒充调拨时快照。
        jdbcTemplate.update("UPDATE biz_eam_transfer t JOIN biz_eam_asset a ON a.id=t.asset_id AND a.deleted=0 "
                + "SET t.brand_id=a.brand_id,t.brand=a.brand,t.brand_backfilled=1 "
                + "WHERE t.request_key IS NULL AND t.brand_id IS NULL AND t.brand IS NULL");
    }

    private void fixClaimIdNullable() {
        log.info("修复 biz_eam_return.claim_id 为可空 ...");
        jdbcTemplate.execute("ALTER TABLE biz_eam_return MODIFY COLUMN claim_id BIGINT NULL COMMENT '关联领用 ID'");
        log.info("biz_eam_return.claim_id 已修改为可空");
    }

    private void createHandoverTables() {
        log.info("开始创建 EAM 交接表结构 ...");

        // ───────────── biz_eam_handover 交接单主表 ─────────────
        jdbcTemplate.execute(
                "CREATE TABLE IF NOT EXISTS biz_eam_handover ("
                + "id BIGINT AUTO_INCREMENT PRIMARY KEY, "
                + "handover_no VARCHAR(64) NOT NULL COMMENT '交接单号（JJ+YYYYMMDD+4位）', "
                + "from_user_id BIGINT NULL COMMENT '交出人 ID', "
                + "from_user_name VARCHAR(128) NOT NULL COMMENT '交出人姓名快照', "
                + "from_department VARCHAR(128) NOT NULL COMMENT '交出人部门快照', "
                + "to_user_id BIGINT NULL COMMENT '接收人 ID', "
                + "to_user_name VARCHAR(128) NOT NULL COMMENT '接收人姓名', "
                + "to_department VARCHAR(128) NOT NULL COMMENT '接收人部门', "
                + "handover_date DATE NOT NULL COMMENT '交接日期', "
                + "asset_count INT NOT NULL DEFAULT 0 COMMENT '交接资产数量', "
                + "reason VARCHAR(32) NOT NULL COMMENT '交接原因：resign/transfer/other', "
                + "status VARCHAR(32) NOT NULL DEFAULT 'done' COMMENT '状态：done/cancelled', "
                + "operator_id BIGINT NULL COMMENT '操作人 ID', "
                + "operator_name VARCHAR(128) NOT NULL COMMENT '操作人姓名', "
                + "remark VARCHAR(512) NULL COMMENT '备注', "
                + "created_by VARCHAR(128) NULL, "
                + "created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "
                + "updated_by VARCHAR(128) NULL, "
                + "updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, "
                + "deleted TINYINT NOT NULL DEFAULT 0, "
                + "UNIQUE KEY uk_handover_no (handover_no), "
                + "INDEX idx_from_user (from_user_name), "
                + "INDEX idx_to_user (to_user_name), "
                + "INDEX idx_handover_date (handover_date), "
                + "INDEX idx_status (status)"
                + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='资产交接单'");

        // ───────────── biz_eam_handover_item 交接单明细 ─────────────
        jdbcTemplate.execute(
                "CREATE TABLE IF NOT EXISTS biz_eam_handover_item ("
                + "id BIGINT AUTO_INCREMENT PRIMARY KEY, "
                + "handover_id BIGINT NOT NULL COMMENT '关联交接单 ID', "
                + "asset_id BIGINT NOT NULL COMMENT '资产 ID', "
                + "asset_no VARCHAR(64) NOT NULL COMMENT '资产编号快照', "
                + "asset_name VARCHAR(256) NOT NULL COMMENT '资产名称快照', "
                + "asset_type VARCHAR(128) NULL COMMENT '资产分类快照', "
                + "old_department VARCHAR(128) NULL COMMENT '交接前部门', "
                + "new_department VARCHAR(128) NULL COMMENT '交接后部门', "
                + "created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "
                + "INDEX idx_handover_id (handover_id), "
                + "INDEX idx_asset_id (asset_id)"
                + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='资产交接单明细'");

        log.info("EAM 交接表结构创建完成");
    }

    /** v4: 调拨单建表（biz_eam_transfer，与 backend/sql/156_eam_asset_transfer.sql 等效） */
    private void createTransferTable() {
        log.info("开始创建 EAM 调拨单表结构 ...");
        jdbcTemplate.execute(
                "CREATE TABLE IF NOT EXISTS biz_eam_transfer ("
                + "id BIGINT AUTO_INCREMENT PRIMARY KEY, "
                + "transfer_no VARCHAR(64) NOT NULL COMMENT '调拨单号（DB+YYYYMMDD+4位）', "
                + "asset_id BIGINT NOT NULL COMMENT '资产ID', "
                + "asset_no VARCHAR(64) NOT NULL COMMENT '资产编号快照', "
                + "asset_name VARCHAR(200) DEFAULT '' COMMENT '资产名称快照', "
                + "from_user_id BIGINT NULL COMMENT '原使用人ID', "
                + "from_user_name VARCHAR(128) DEFAULT '' COMMENT '原使用人快照', "
                + "from_department VARCHAR(128) DEFAULT '' COMMENT '原归属部门快照', "
                + "to_user_id BIGINT NULL COMMENT '新使用人ID', "
                + "to_user_name VARCHAR(128) NOT NULL COMMENT '新使用人姓名', "
                + "to_user_emp_id VARCHAR(32) DEFAULT '' COMMENT '新使用人工号', "
                + "to_department VARCHAR(128) NOT NULL COMMENT '新归属部门', "
                + "transfer_date DATE NOT NULL COMMENT '调拨日期', "
                + "reason VARCHAR(500) NOT NULL COMMENT '调拨原因', "
                + "status VARCHAR(32) NOT NULL DEFAULT 'done' COMMENT '状态：done/cancelled', "
                + "operator_id BIGINT NULL COMMENT '操作人ID', "
                + "operator_name VARCHAR(128) NOT NULL COMMENT '操作人姓名', "
                + "remark VARCHAR(512) NULL COMMENT '备注', "
                + "created_by VARCHAR(128) NULL, "
                + "created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "
                + "updated_by VARCHAR(128) NULL, "
                + "updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, "
                + "deleted TINYINT NOT NULL DEFAULT 0, "
                + "UNIQUE KEY uk_transfer_no (transfer_no), "
                + "INDEX idx_asset_id (asset_id), "
                + "INDEX idx_asset_no (asset_no), "
                + "INDEX idx_transfer_date (transfer_date), "
                + "INDEX idx_status (status)"
                + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='资产调拨单'");
        log.info("EAM 调拨单表结构创建完成");
    }

    /** v5: 调拨单补充原使用人工号列 */
    private void addTransferFromUserEmpId() {
        log.info("补充 biz_eam_transfer.from_user_emp_id 列 ...");
        alterSafe("biz_eam_transfer",
                "ADD COLUMN from_user_emp_id VARCHAR(50) DEFAULT NULL COMMENT '原使用人工号'");
        log.info("biz_eam_transfer.from_user_emp_id 列已添加");
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
            // 借用菜單（asset-return 已在 DataInitializer 中创建）
            ensureMenu(assetMgmtId, "asset-borrow", "借用資產", "/asset-borrow",
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

    /**
     * v7: biz_eam_model 新增 code 列（产品编码）+ 存量数据回填
     * <p>编码规则：{品牌编码}-{3位品牌内序号}，如 AB01-001</p>
     */
    private void addModelCodeColumn() {
        log.info("开始为 biz_eam_model 添加 code 列 ...");
        alterSafe("biz_eam_model",
                "ADD COLUMN code VARCHAR(32) DEFAULT NULL COMMENT '产品编码（品牌编码-3位序号）' AFTER brand_logo");
        addIndexSafe("biz_eam_model", "idx_model_code", "code");

        // 存量回填：按品牌分组生成 {brand_code}-{3位序号}
        try {
            jdbcTemplate.update(
                    "UPDATE biz_eam_model m "
                    + "INNER JOIN biz_eam_brand b ON m.brand_id = b.id AND b.deleted = 0 "
                    + "SET m.code = CONCAT(b.code, '-', LPAD("
                    + "    ROW_NUMBER() OVER (PARTITION BY m.brand_id ORDER BY m.id),"
                    + "    3, '0'"
                    + ")) "
                    + "WHERE m.deleted = 0 AND (m.code IS NULL OR m.code = '')");
            log.info("biz_eam_model.code 存量数据回填完成");
        } catch (Exception e) {
            log.warn("biz_eam_model.code 存量回填异常（可能 MySQL 版本不支持窗口函数）: {}", e.getMessage());
            // 兆底：Java 层逐品牌回填
            backfillProductCodesInJava();
        }
    }

    /** Java 层兆底回填产品编码（当 MySQL 不支持窗口函数时使用） */
    private void backfillProductCodesInJava() {
        List<Map<String, Object>> brands = jdbcTemplate.queryForList(
                "SELECT id, code FROM biz_eam_brand WHERE deleted = 0 AND code IS NOT NULL AND code != ''");
        for (Map<String, Object> brand : brands) {
            String brandCode = (String) brand.get("code");
            Long brandId = ((Number) brand.get("id")).longValue();
            List<Map<String, Object>> models = jdbcTemplate.queryForList(
                    "SELECT id FROM biz_eam_model WHERE brand_id = ? AND deleted = 0 AND (code IS NULL OR code = '') ORDER BY id",
                    brandId);
            int seq = 1;
            for (Map<String, Object> model : models) {
                String code = brandCode + "-" + String.format("%03d", seq);
                jdbcTemplate.update("UPDATE biz_eam_model SET code = ? WHERE id = ?",
                        code, ((Number) model.get("id")).longValue());
                seq++;
            }
        }
        log.info("biz_eam_model.code Java 兆底回填完成");
    }

    /* ==================== v8: 方案二 分类/品牌表统一 ==================== */

    /**
     * 方案二：耗材分类/品牌表并入资产分类/品牌表（biz_type 区分），并重組基础数据菜单
     * <p>对应 SQL 草稿: backend/sql/94_merge_category_brand_tables.sql（本方法为其 MySQL 兼容实现）
     */
    private void mergeCategoryBrandTables() {
        log.info("开始方案二迁移：分类/品牌表统一（biz_type）...");
        // 1. biz_type 列 + 存量回填
        alterSafe("biz_eam_category",
                "ADD COLUMN biz_type VARCHAR(20) NOT NULL DEFAULT 'ASSET' COMMENT '业务类型：ASSET-资产, CONSUMABLE-耗材'");
        jdbcTemplate.update("UPDATE biz_eam_category SET biz_type = 'ASSET' WHERE biz_type IS NULL OR biz_type = ''");
        alterSafe("biz_eam_brand",
                "ADD COLUMN biz_type VARCHAR(20) NOT NULL DEFAULT 'ASSET' COMMENT '业务类型：ASSET-资产, CONSUMABLE-耗材'");
        jdbcTemplate.update("UPDATE biz_eam_brand SET biz_type = 'ASSET' WHERE biz_type IS NULL OR biz_type = ''");
        // 品牌表补状态/备注列（耗材品牌原有字段，统一后保留）
        alterSafe("biz_eam_brand", "ADD COLUMN status VARCHAR(16) NOT NULL DEFAULT 'enabled' COMMENT 'enabled/disabled'");
        alterSafe("biz_eam_brand", "ADD COLUMN remark VARCHAR(500) NOT NULL DEFAULT ''");

        // 2. 迁移耗材分类（含父子关系与耗材档案引用重映射），完成后删除旧表
        if (tableExists("biz_consumable_category")) {
            migrateConsumableCategories();
            jdbcTemplate.execute("DROP TABLE biz_consumable_category");
            log.info("biz_consumable_category 数据已迁移至 biz_eam_category，旧表已删除");
        }
        // 3. 迁移耗材品牌
        if (tableExists("biz_consumable_brand")) {
            migrateConsumableBrands();
            jdbcTemplate.execute("DROP TABLE biz_consumable_brand");
            log.info("biz_consumable_brand 数据已迁移至 biz_eam_brand，旧表已删除");
        }
        // 4. 基础数据菜单重组
        restructureMasterDataMenus();
        log.info("方案二迁移完成");
    }

    /** 耗材分类 → 统一分类表（biz_type=CONSUMABLE），重映射父子关系与耗材档案 category_id */
    private void migrateConsumableCategories() {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT id, code, name, parent_id, sort_order, status, remark, updated_by, created_at, updated_at "
                        + "FROM biz_consumable_category WHERE deleted = 0 ORDER BY id");
        Map<Long, Long> idMap = new HashMap<>();
        for (Map<String, Object> r : rows) {
            Long oldId = ((Number) r.get("id")).longValue();
            String code = (String) r.get("code");
            Integer exists = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM biz_eam_category WHERE code = ? AND deleted = 0", Integer.class, code);
            if (exists != null && exists > 0) {
                idMap.put(oldId, jdbcTemplate.queryForObject(
                        "SELECT id FROM biz_eam_category WHERE code = ? AND deleted = 0 LIMIT 1", Long.class, code));
                continue;
            }
            jdbcTemplate.update(
                    "INSERT INTO biz_eam_category (code, name, parent_id, biz_type, status, sort, remark, updated_by, created_at, updated_at, deleted) "
                            + "VALUES (?, ?, 0, 'CONSUMABLE', ?, ?, ?, ?, ?, ?, 0)",
                    code,
                    Objects.toString(r.get("name"), ""),
                    Objects.toString(r.get("status"), "enabled"),
                    r.get("sort_order") == null ? 0 : ((Number) r.get("sort_order")).intValue(),
                    Objects.toString(r.get("remark"), ""),
                    Objects.toString(r.get("updated_by"), "system"),
                    r.get("created_at"),
                    r.get("updated_at"));
            idMap.put(oldId, jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class));
        }
        // 父子关系重映射（旧 parent_id → 新 id）
        for (Map<String, Object> r : rows) {
            Long oldId = ((Number) r.get("id")).longValue();
            long parentId = r.get("parent_id") == null ? 0L : ((Number) r.get("parent_id")).longValue();
            long newParent = parentId == 0L ? 0L : idMap.getOrDefault(parentId, 0L);
            jdbcTemplate.update("UPDATE biz_eam_category SET parent_id = ? WHERE id = ?",
                    newParent, idMap.get(oldId));
        }
        // 耗材档案分类引用重映射
        idMap.forEach((oldId, newId) -> jdbcTemplate.update(
                "UPDATE biz_eam_consumable_item SET category_id = ? WHERE category_id = ?", newId, oldId));
        log.info("耗材分类迁移完成：{} 条", rows.size());
    }

    /** 耗材品牌 → 统一品牌表（biz_type 取 category_type），重映射耗材档案 brand_id */
    private void migrateConsumableBrands() {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT id, code, name, name_en, category_type, logo, status, remark, updated_by, created_at, updated_at "
                        + "FROM biz_consumable_brand WHERE deleted = 0 ORDER BY id");
        Map<Long, Long> idMap = new HashMap<>();
        for (Map<String, Object> r : rows) {
            Long oldId = ((Number) r.get("id")).longValue();
            String code = (String) r.get("code");
            Integer exists = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM biz_eam_brand WHERE code = ? AND deleted = 0", Integer.class, code);
            if (exists != null && exists > 0) {
                idMap.put(oldId, jdbcTemplate.queryForObject(
                        "SELECT id FROM biz_eam_brand WHERE code = ? AND deleted = 0 LIMIT 1", Long.class, code));
                continue;
            }
            String bizType = "ASSET".equals(r.get("category_type")) ? "ASSET" : "CONSUMABLE";
            jdbcTemplate.update(
                    "INSERT INTO biz_eam_brand (code, category_code, brand_zh, brand_en, brand_logo, biz_type, status, remark, updated_by, created_at, updated_at, deleted) "
                            + "VALUES (?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)",
                    code,
                    Objects.toString(r.get("name"), ""),
                    Objects.toString(r.get("name_en"), ""),
                    Objects.toString(r.get("logo"), ""),
                    bizType,
                    Objects.toString(r.get("status"), "enabled"),
                    Objects.toString(r.get("remark"), ""),
                    Objects.toString(r.get("updated_by"), "system"),
                    r.get("created_at"),
                    r.get("updated_at"));
            idMap.put(oldId, jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class));
        }
        // 耗材档案品牌引用重映射
        idMap.forEach((oldId, newId) -> jdbcTemplate.update(
                "UPDATE biz_eam_consumable_item SET brand_id = ? WHERE brand_id = ?", newId, oldId));
        log.info("耗材品牌迁移完成：{} 条", rows.size());
    }

    /** 基础数据菜单重组：耗材基础配置菜单下线、基础配置扁平化、分类库/品牌产品库改名 */
    private void restructureMasterDataMenus() {
        Long masterId;
        try {
            masterId = jdbcTemplate.queryForObject(
                    "SELECT id FROM sys_menu WHERE menu_key = 'eam-master-data' AND deleted = 0 LIMIT 1", Long.class);
        } catch (org.springframework.dao.EmptyResultDataAccessException e) {
            log.info("eam-master-data 菜单不存在，跳过菜单重组（可能 167 脚本尚未执行）");
            return;
        }
        // 耗材分类/品牌/计量单位菜单下线（功能并入分类库/品牌产品库）
        jdbcTemplate.update("UPDATE sys_menu SET deleted = 1, updated_by = 'system' "
                + "WHERE menu_key IN ('consumable-category', 'consumable-brand', 'consumable-unit') AND deleted = 0");
        // 扁平化：5 个基础配置叶子菜单直挂基础数据，停用 asset-basic 子分组
        String[] leafKeys = {"asset-category", "asset-model", "asset-location", "param-library", "asset-tag"};
        int sort = 1;
        for (String key : leafKeys) {
            jdbcTemplate.update("UPDATE sys_menu SET parent_id = ?, sort_order = ? WHERE menu_key = ? AND deleted = 0",
                    masterId, sort++, key);
        }
        jdbcTemplate.update("UPDATE sys_menu SET deleted = 1, updated_by = 'system' WHERE menu_key = 'asset-basic' AND deleted = 0");
        // 改名（统一库命名）
        jdbcTemplate.update("UPDATE sys_menu SET name = '基礎配置', name_en = 'Basic Configuration' WHERE menu_key = 'eam-master-data' AND deleted = 0");
        jdbcTemplate.update("UPDATE sys_menu SET name = '分類庫', name_en = 'Category Library' WHERE menu_key = 'asset-category' AND deleted = 0");
        jdbcTemplate.update("UPDATE sys_menu SET name = '品牌產品庫', name_en = 'Brand Product Library' WHERE menu_key = 'asset-model' AND deleted = 0");
        log.info("基础数据菜单重组完成");
    }

    /** v10: 资产维修记录表 */
    private void createRepairTable() {
        jdbcTemplate.execute("CREATE TABLE IF NOT EXISTS `biz_eam_repair` ("
                + "`id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键', "
                + "`asset_id` BIGINT NOT NULL COMMENT '资产 ID', "
                + "`asset_no` VARCHAR(64) NOT NULL DEFAULT '' COMMENT '资产编号（快照）', "
                + "`asset_name` VARCHAR(128) NOT NULL DEFAULT '' COMMENT '资产名称（快照）', "
                + "`repair_date` VARCHAR(20) NOT NULL DEFAULT '' COMMENT '维修日期', "
                + "`fault_desc` VARCHAR(500) NOT NULL DEFAULT '' COMMENT '故障描述', "
                + "`repair_content` VARCHAR(500) NOT NULL DEFAULT '' COMMENT '维修内容', "
                + "`repair_by` VARCHAR(100) NOT NULL DEFAULT '' COMMENT '维修方', "
                + "`cost` DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT '维修费用（MOP）', "
                + "`finish_date` VARCHAR(20) NULL DEFAULT NULL COMMENT '完成日期', "
                + "`status` VARCHAR(16) NOT NULL DEFAULT 'repairing' COMMENT '状态：repairing/done', "
                + "`applicant` VARCHAR(64) NOT NULL DEFAULT '' COMMENT '申请人/部门', "
                + "`cause_type` VARCHAR(20) NULL DEFAULT NULL COMMENT '损坏原因', "
                + "`created_by` VARCHAR(64) NULL DEFAULT NULL COMMENT '创建人', "
                + "`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间', "
                + "`updated_by` VARCHAR(64) NULL DEFAULT NULL COMMENT '最后更新人', "
                + "`updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间', "
                + "`deleted` TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除', "
                + "PRIMARY KEY (`id`), "
                + "KEY `idx_asset_id` (`asset_id`), "
                + "KEY `idx_status` (`status`), "
                + "KEY `idx_repair_date` (`repair_date`)) "
                + "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='资产维修记录表'");
        log.info("维修记录表创建完成");
    }

    /** v9: 基础数据分组改名：資產基礎配置 → 基礎配置 */
    private void renameMasterDataMenu() {
        jdbcTemplate.update(
                "UPDATE sys_menu SET name = '基礎配置', name_en = 'Basic Configuration' "
                + "WHERE menu_key = 'eam-master-data' AND deleted = 0");
        log.info("菜单改名完成：eam-master-data → 基礎配置");
    }

    /** 表是否存在（information_schema 检查） */
    private boolean tableExists(String table) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
                Integer.class, table);
        return count != null && count > 0;
    }
}
