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
        versionTracker.applyOnce("eam:schema-v11-inventory-tables", this::createInventoryTables);
        versionTracker.applyOnce("eam:schema-v12-inbound-allocation", this::addInboundAllocationColumns);
        versionTracker.applyOnce("eam:schema-v13-inbound-department", this::addInboundBatchDepartmentColumns);
        versionTracker.applyOnce("eam:schema-v14-asset-admin-dept", this::addAssetAdminDepartmentColumn);
        versionTracker.applyOnce("eam:schema-v15-asset-location-address", this::fixAssetLocationFullAddress);
        versionTracker.applyOnce("eam:schema-v16-asset-accessories", this::addAssetAccessoriesColumn);
        versionTracker.applyOnce("eam:schema-v17-clear-orphan-asset-user", this::clearOrphanAssetUserData);
        versionTracker.applyOnce("eam:schema-v18-evidence-storage-path", this::fixEvidenceStoragePath);
        versionTracker.applyOnce("eam:schema-v19-evidence-storage-mediumtext", this::upgradeEvidenceStorageToMediumText);
        versionTracker.applyOnce("eam:schema-v20-claim-accessories", this::addClaimAccessoriesColumn);
        versionTracker.applyOnce("eam:schema-v21-return-operator-id", this::addReturnOperatorIdColumn);
        versionTracker.applyOnce("eam:schema-v22-scrap-table", this::createScrapTable);
        versionTracker.applyOnce("eam:schema-v23-repair-return-link", this::addRepairReturnLinkColumns);
        versionTracker.applyOnce("eam:schema-v24-loss-tables", this::createLossTables);
        versionTracker.applyOnce("eam:schema-v25-loss-menu", this::createLossMenu);
        versionTracker.applyOnce("eam:schema-v26-loss-menu-rename", this::renameLossMenu);
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

    /**
     * 基础数据菜单重组：耗材分类/品牌/计量单位菜单下线（功能并入分类库/品牌产品库）。
     * <p>
     * v40: 基础配置分组的唯一 key 收敛为种子的 asset-basic。历史上本方法把五个叶子挂到
     * 167 脚本引入的 eam-master-data 并停用 asset-basic，而 DataInitializer 种子又会重建
     * asset-basic，导致「物資管理」下出现两个同名「基礎配置」（一个空、一个有子菜单）。
     * 现统一挂回 asset-basic，并把 eam-master-data 已有子节点迁移过去。
     */
    private void restructureMasterDataMenus() {
        // 耗材分类/品牌/计量单位菜单下线（功能并入分类库/品牌产品库）
        jdbcTemplate.update("UPDATE sys_menu SET deleted = 1, updated_by = 'system' "
                + "WHERE menu_key IN ('consumable-category', 'consumable-brand', 'consumable-unit') AND deleted = 0");
        Long basicId;
        try {
            basicId = jdbcTemplate.queryForObject(
                    "SELECT id FROM sys_menu WHERE menu_key = 'asset-basic' AND deleted = 0 LIMIT 1", Long.class);
        } catch (org.springframework.dao.EmptyResultDataAccessException e) {
            basicId = null;
        }
        if (basicId == null) {
            log.info("asset-basic 菜单尚未种子化，跳过基础数据叶子挂载（由 DataInitializer.reconcileMenuMasterData 兜底）");
            return;
        }
        // 先吸收 eam-master-data 的历史子节点，再停用该重复分组
        jdbcTemplate.update("UPDATE sys_menu SET parent_id = ? WHERE parent_id = "
                + "(SELECT id FROM (SELECT id FROM sys_menu WHERE menu_key = 'eam-master-data' AND deleted = 0) t) AND deleted = 0",
                basicId);
        jdbcTemplate.update("UPDATE sys_menu SET deleted = 1, updated_by = 'system' "
                + "WHERE menu_key = 'eam-master-data' AND deleted = 0 "
                + "AND id NOT IN (SELECT parent_id FROM (SELECT DISTINCT parent_id FROM sys_menu "
                + "WHERE deleted = 0 AND parent_id IS NOT NULL) p)");
        // 5 个基础配置叶子菜单固定挂在 asset-basic 下
        String[] leafKeys = {"asset-category", "asset-model", "asset-location", "param-library", "asset-tag"};
        int sort = 1;
        for (String key : leafKeys) {
            jdbcTemplate.update("UPDATE sys_menu SET parent_id = ?, sort_order = ? WHERE menu_key = ? AND deleted = 0",
                    basicId, sort++, key);
        }
        log.info("基础数据菜单重组完成（统一挂 asset-basic）");
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

    /** v11: 资产盘点任务表 + 盘点明细表 */
    private void createInventoryTables() {
        log.info("开始创建 EAM 资产盘点表结构 ...");

        // ───────────── biz_eam_inventory_task 盘点任务主表 ─────────────
        jdbcTemplate.execute(
                "CREATE TABLE IF NOT EXISTS `biz_eam_inventory_task` ("
                + "`id` BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, "
                + "`task_no` VARCHAR(64) NOT NULL COMMENT '盘点任务编号（PD+YYYYMMDD+4位）', "
                + "`task_name` VARCHAR(200) NOT NULL COMMENT '盘点任务名称', "
                + "`inventory_date` VARCHAR(20) NOT NULL COMMENT '盘点日期', "
                + "`operator` VARCHAR(128) NOT NULL COMMENT '盘点人', "
                + "`expected_count` INT NOT NULL DEFAULT 0 COMMENT '应盘数量', "
                + "`actual_count` INT NOT NULL DEFAULT 0 COMMENT '实盘数量', "
                + "`diff_count` INT NOT NULL DEFAULT 0 COMMENT '差异数（实盘-应盘）', "
                + "`status` VARCHAR(32) NOT NULL DEFAULT 'in_progress' COMMENT '状态：in_progress/completed/cancelled', "
                + "`remark` VARCHAR(500) NULL DEFAULT '' COMMENT '备注', "
                + "`created_by` VARCHAR(128) NULL DEFAULT NULL COMMENT '创建人', "
                + "`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间', "
                + "`updated_by` VARCHAR(128) NULL DEFAULT NULL COMMENT '最后更新人', "
                + "`updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间', "
                + "`deleted` TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除', "
                + "UNIQUE KEY `uk_task_no` (`task_no`), "
                + "KEY `idx_status` (`status`), "
                + "KEY `idx_inventory_date` (`inventory_date`)"
                + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='资产盘点任务表'");

        // ───────────── biz_eam_inventory_item 盘点明细表 ─────────────
        jdbcTemplate.execute(
                "CREATE TABLE IF NOT EXISTS `biz_eam_inventory_item` ("
                + "`id` BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, "
                + "`task_id` BIGINT NOT NULL COMMENT '关联盘点任务 ID', "
                + "`asset_id` BIGINT NOT NULL COMMENT '资产 ID', "
                + "`asset_no` VARCHAR(64) NOT NULL DEFAULT '' COMMENT '资产编号（快照）', "
                + "`asset_name` VARCHAR(256) NOT NULL DEFAULT '' COMMENT '资产名称（快照）', "
                + "`asset_type` VARCHAR(128) NULL DEFAULT NULL COMMENT '资产分类（快照）', "
                + "`location` VARCHAR(200) NULL DEFAULT NULL COMMENT '存放位置（快照）', "
                + "`status` VARCHAR(32) NOT NULL DEFAULT 'pending' COMMENT '盘点状态：pending/normal/lost/damaged', "
                + "`remark` VARCHAR(500) NULL DEFAULT '' COMMENT '备注', "
                + "`created_by` VARCHAR(128) NULL DEFAULT NULL COMMENT '创建人', "
                + "`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间', "
                + "`updated_by` VARCHAR(128) NULL DEFAULT NULL COMMENT '最后更新人', "
                + "`updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间', "
                + "KEY `idx_task_id` (`task_id`), "
                + "KEY `idx_asset_id` (`asset_id`), "
                + "KEY `idx_status` (`status`)"
                + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='资产盘点明细表'");

        log.info("EAM 资产盘点表结构创建完成");
    }

    /**
     * v12: 验收入库多结果分配模型
     * <p>为批次明细添加 client_line_id / source_exchange_item_id；
     * 为批次添加 contract_version / request_key。</p>
     */
    private void addInboundAllocationColumns() {
        log.info("开始为验收入库表添加多结果分配列 ...");
        alterSafe("biz_eam_inbound_batch_item", "ADD COLUMN client_line_id VARCHAR(64) NULL COMMENT '前端稳定ID'");
        alterSafe("biz_eam_inbound_batch_item", "ADD COLUMN source_exchange_item_id BIGINT NULL COMMENT '来源换货明细ID'");
        alterSafe("biz_eam_inbound_batch", "ADD COLUMN contract_version INT NULL DEFAULT NULL COMMENT '契约版本'");
        alterSafe("biz_eam_inbound_batch", "ADD COLUMN request_key VARCHAR(64) NULL COMMENT '幂等请求键'");
        addIndexSafe("biz_eam_inbound_batch_item", "idx_batch_item_client_line", "client_line_id");
        addIndexSafe("biz_eam_inbound_batch_item", "idx_batch_item_source_exchange", "source_exchange_item_id");
        // 幂等唯一索引（po_id + request_key）
        try {
            jdbcTemplate.execute("ALTER TABLE biz_eam_inbound_batch ADD UNIQUE INDEX uk_batch_request_key (po_id, request_key)");
        } catch (Exception e) {
            if (!isDuplicateIndexError(e)) throw e instanceof RuntimeException ? (RuntimeException) e : new RuntimeException(e);
        }
        log.info("验收入库多结果分配列添加完成");
    }

    /** v13: 验收入库批次添加管理部门字段 */
    private void addInboundBatchDepartmentColumns() {
        log.info("开始为验收入库批次添加管理部门列 ...");
        alterSafe("biz_eam_inbound_batch", "ADD COLUMN department_id BIGINT NULL COMMENT '管理部門ID' AFTER operator");
        alterSafe("biz_eam_inbound_batch", "ADD COLUMN department_name VARCHAR(128) NULL COMMENT '管理部門名稱' AFTER department_id");
        log.info("验收入库批次管理部门列添加完成");
    }

    /** v14: 资产台账新增管理部门字段 + 历史数据修复 */
    private void addAssetAdminDepartmentColumn() {
        log.info("开始为资产台账添加 admin_department 列 ...");
        alterSafe("biz_eam_asset", "ADD COLUMN admin_department VARCHAR(100) DEFAULT NULL COMMENT '管理部门' AFTER department");
        // 修复历史数据：验收入库同步的 department 实为管理部门，迁移到 admin_department
        int rows = jdbcTemplate.update(
                "UPDATE biz_eam_asset SET admin_department = department, department = NULL "
                + "WHERE batch_id IS NOT NULL AND department IS NOT NULL AND department != ''");
        log.info("资产台账 admin_department 列添加完成，历史数据修复 {} 条", rows);
        // 修复历史数据：从采购订单所属品牌映射购买公司（brand: 1=闪蜂, 2=mFood）
        int companyRows = jdbcTemplate.update(
                "UPDATE biz_eam_asset a INNER JOIN biz_eam_purchase_order o ON a.order_id = o.id AND o.deleted = 0 "
                + "SET a.company = CASE o.brand WHEN 1 THEN '珠海闪蜂科技有限公司' WHEN 2 THEN '珠海麦峰科技有限公司' ELSE a.company END "
                + "WHERE a.batch_id IS NOT NULL AND (a.company IS NULL OR a.company = '') AND o.brand IS NOT NULL");
        log.info("资产台账 company 字段从采购订单品牌映射修复 {} 条", companyRows);
    }

    /** v15: 修复已有资产的 location 字段，补充完整地址（城市+区县+详细地址） */
    private void fixAssetLocationFullAddress() {
        log.info("开始修复资产台账 location 字段完整地址 ...");
        int rows = jdbcTemplate.update(
                "UPDATE biz_eam_asset a "
                + "INNER JOIN biz_eam_location loc ON a.location_id = loc.id "
                + "SET a.location = CONCAT(loc.name, '（', CONCAT_WS('', IFNULL(loc.city,''), IFNULL(loc.district,''), IFNULL(loc.address,'')), '）') "
                + "WHERE a.location_id IS NOT NULL AND a.deleted = 0 "
                + "AND (loc.city IS NOT NULL OR loc.district IS NOT NULL OR loc.address IS NOT NULL) "
                + "AND a.location NOT LIKE '%（%）'");
        log.info("资产台账 location 完整地址修复 {} 条", rows);
    }

    /** v16: 资产台账新增配件清单列 + 从入库批次明细回填已有数据 */
    private void addAssetAccessoriesColumn() {
        log.info("开始为资产台账添加 accessories 列 ...");
        // MySQL 不支持 IF NOT EXISTS，先检查列是否存在
        Integer colExists = jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'biz_eam_asset' AND COLUMN_NAME = 'accessories'",
            Integer.class
        );
        if (colExists != null && colExists == 0) {
            jdbcTemplate.execute("ALTER TABLE biz_eam_asset ADD COLUMN accessories TEXT DEFAULT NULL COMMENT '配件清单 JSON 数组 [{name,qty}]'");
            log.info("资产台账 accessories 列添加完成");
        } else {
            log.info("资产台账 accessories 列已存在，跳过");
        }
        // 从入库批次明细回填已有资产的配件清单
        log.info("开始从入库批次明细回填已有资产配件清单 ...");
        int rows = jdbcTemplate.update(
            "UPDATE biz_eam_asset a "
            + "INNER JOIN biz_eam_inbound_batch b ON a.batch_id = b.id "
            + "INNER JOIN biz_eam_inbound_batch_item bi ON b.id = bi.batch_id "
            + "  AND bi.id = (SELECT bi2.id FROM biz_eam_inbound_batch_item bi2 "
            + "    WHERE bi2.batch_id = b.id AND bi2.accessories IS NOT NULL "
            + "    AND bi2.accessories != '' AND bi2.accessories != '[]' "
            + "    ORDER BY bi2.sort_order ASC, bi2.id ASC LIMIT 1) "
            + "SET a.accessories = bi.accessories "
            + "WHERE a.accessories IS NULL AND a.batch_id IS NOT NULL AND a.deleted = 0"
        );
        log.info("资产台账配件清单回填 {} 条", rows);
    }

    /** v17: 清空无领用记录但手动填写了使用人信息的资产数据（对应 SQL: 175_clear_orphan_asset_user.sql） */
    private void clearOrphanAssetUserData() {
        log.info("开始清空无领用记录的孤立资产使用人数据 ...");
        int rows = jdbcTemplate.update(
            "UPDATE biz_eam_asset "
            + "SET user_name = NULL, department = NULL, usage_date = NULL, "
            + "current_holder_id = NULL, active_claim_id = NULL, status = 'idle', "
            + "updated_by = 'system', updated_at = NOW() "
            + "WHERE asset_no = 'XX-M-01-01-0001' AND deleted = 0 AND active_claim_id IS NULL"
        );
        log.info("孤立资产使用人数据清空完成，影响 {} 条", rows);
    }

    /** v18: 修复签署页提交时 signature image 过长导致 storage_path 字段溢出 */
    private void fixEvidenceStoragePath() {
        log.info("开始修复 biz_eam_claim_evidence.storage_path 字段类型 ...");
        try {
            jdbcTemplate.execute("ALTER TABLE biz_eam_claim_evidence MODIFY COLUMN storage_path TEXT NOT NULL COMMENT '存储路径或 Data URL (base64)'");
            log.info("biz_eam_claim_evidence.storage_path 字段类型修复完成");
        } catch (Exception e) {
            log.warn("biz_eam_claim_evidence.storage_path 字段修复失败: {}", e.getMessage());
        }
    }

    /** v19: 手机高分屏全屏签名 base64 PNG 可超 64KB，TEXT 仍不够，升级为 MEDIUMTEXT */
    private void upgradeEvidenceStorageToMediumText() {
        log.info("开始升级 biz_eam_claim_evidence.storage_path 为 MEDIUMTEXT ...");
        try {
            jdbcTemplate.execute("ALTER TABLE biz_eam_claim_evidence MODIFY COLUMN storage_path MEDIUMTEXT NOT NULL COMMENT '存储路径或 Data URL (base64)'");
            log.info("biz_eam_claim_evidence.storage_path 已升级为 MEDIUMTEXT");
        } catch (Exception e) {
            log.warn("biz_eam_claim_evidence.storage_path 升级 MEDIUMTEXT 失败: {}", e.getMessage());
        }
    }

    /** v20: 领用记录新增配件快照列（领用时从资产复制，支持删减） */
    private void addClaimAccessoriesColumn() {
        log.info("开始为领用记录表添加 accessories 列 ...");
        // MySQL 不支持 IF NOT EXISTS，先检查列是否存在
        Integer colExists = jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'biz_eam_claim' AND COLUMN_NAME = 'accessories'",
            Integer.class
        );
        if (colExists != null && colExists == 0) {
            jdbcTemplate.execute("ALTER TABLE biz_eam_claim ADD COLUMN accessories TEXT DEFAULT NULL COMMENT '领用配件快照 JSON（领用时从资产复制，支持删减）'");
            log.info("领用记录表 accessories 列添加完成");
        } else {
            log.info("领用记录表 accessories 列已存在，跳过");
        }
    }

    /** v21: 归还记录表新增 operator_id 列 + 历史数据回填 */
    private void addReturnOperatorIdColumn() {
        log.info("开始为归还记录表添加 operator_id 列 ...");
        alterSafe("biz_eam_return",
                "ADD COLUMN operator_id BIGINT NULL COMMENT '操作人 ID（归还接收人）' AFTER operator_name");
        // 回填历史数据：按 operator_name 匹配 sys_user.name
        int rows = jdbcTemplate.update(
                "UPDATE biz_eam_return r "
                + "INNER JOIN sys_user u ON u.name = r.operator_name AND u.deleted = 0 "
                + "SET r.operator_id = u.id "
                + "WHERE r.operator_id IS NULL AND r.deleted = 0");
        log.info("归还记录表 operator_id 列添加完成，历史数据回填 {} 条", rows);
    }

    /** v22: 资产报废记录表（支持归还处置→报废自动流转） */
    private void createScrapTable() {
        log.info("开始创建 EAM 资产报废记录表 ...");
        jdbcTemplate.execute(
                "CREATE TABLE IF NOT EXISTS biz_eam_scrap ("
                + "id BIGINT AUTO_INCREMENT PRIMARY KEY, "
                + "asset_id BIGINT NOT NULL COMMENT '资产 ID', "
                + "asset_no VARCHAR(64) NOT NULL COMMENT '资产编号（快照）', "
                + "asset_name VARCHAR(200) NOT NULL COMMENT '资产名称（快照）', "
                + "asset_type VARCHAR(100) NULL COMMENT '资产分类（快照）', "
                + "brand VARCHAR(100) NULL COMMENT '品牌（快照）', "
                + "scrap_date DATE NOT NULL COMMENT '报废日期', "
                + "apply_by VARCHAR(64) NOT NULL COMMENT '申请人', "
                + "emp_id VARCHAR(32) NULL COMMENT '申请人工号', "
                + "reason VARCHAR(500) NOT NULL COMMENT '报废原因', "
                + "residual_value DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT '残值（MOP）', "
                + "dispose_type VARCHAR(20) NULL COMMENT '处置方式：sale/donate/recycle/destroy', "
                + "appraisal VARCHAR(500) NULL COMMENT '鉴定意见', "
                + "remark VARCHAR(500) NULL COMMENT '备注', "
                + "return_id BIGINT NULL COMMENT '关联归还记录 ID', "
                + "status VARCHAR(20) NOT NULL DEFAULT 'pending' COMMENT 'pending/approved/rejected/cancelled', "
                + "created_by VARCHAR(64) NULL, "
                + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP, "
                + "updated_by VARCHAR(64) NULL, "
                + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, "
                + "deleted TINYINT NOT NULL DEFAULT 0, "
                + "INDEX idx_asset (asset_id), "
                + "INDEX idx_return (return_id), "
                + "INDEX idx_status (status), "
                + "INDEX idx_scrap_date (scrap_date)"
                + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='资产报废记录表'");
        log.info("EAM 资产报废记录表创建完成");
    }

    /** v23: 维修记录表增加 return_id 列 + 归还记录表增加 repair_id 列（支持归还处置→维修自动流转） */
    private void addRepairReturnLinkColumns() {
        log.info("开始执行 v23 迁移：维修-归还关联列 ...");
        // biz_eam_repair 增加 return_id
        Integer repairReturnIdCol = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS "
                + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'biz_eam_repair' AND COLUMN_NAME = 'return_id'",
                Integer.class);
        if (repairReturnIdCol != null && repairReturnIdCol == 0) {
            jdbcTemplate.execute(
                    "ALTER TABLE biz_eam_repair ADD COLUMN return_id BIGINT NULL COMMENT '关联归还记录 ID' AFTER cause_type");
            jdbcTemplate.execute(
                    "ALTER TABLE biz_eam_repair ADD INDEX idx_return_id (return_id)");
        }
        // biz_eam_return 增加 repair_id
        Integer returnRepairIdCol = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS "
                + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'biz_eam_return' AND COLUMN_NAME = 'repair_id'",
                Integer.class);
        if (returnRepairIdCol != null && returnRepairIdCol == 0) {
            jdbcTemplate.execute(
                    "ALTER TABLE biz_eam_return ADD COLUMN repair_id BIGINT NULL COMMENT '关联维修记录 ID' AFTER compensation_id");
        }
        log.info("v23 迁移完成：维修-归还关联列添加完成");
    }

    /** v24: 遗失找回模块建表（biz_eam_loss + biz_eam_loss_event）+ 赔付/报废表加 loss_id */
    private void createLossTables() {
        log.info("开始执行 v24 迁移：遗失找回模块表结构 ...");

        // ───────────── biz_eam_loss 遗失单主表 ─────────────
        jdbcTemplate.execute(
                "CREATE TABLE IF NOT EXISTS biz_eam_loss ("
                + "id BIGINT AUTO_INCREMENT PRIMARY KEY, "
                + "loss_no VARCHAR(32) NOT NULL COMMENT '遗失编号（YS+YYYYMMDD+4位）', "
                + "source_type VARCHAR(16) NOT NULL COMMENT '来源类型：claim/borrow/return/direct', "
                + "source_id BIGINT NOT NULL DEFAULT 0 COMMENT '来源 ID', "
                + "return_id BIGINT NULL COMMENT '关联归还记录 ID', "
                + "asset_id BIGINT NOT NULL COMMENT '资产 ID', "
                + "asset_no VARCHAR(64) NOT NULL COMMENT '资产编号（快照）', "
                + "asset_name VARCHAR(200) NOT NULL COMMENT '资产名称（快照）', "
                + "asset_type VARCHAR(100) NULL COMMENT '资产分类（快照）', "
                + "brand VARCHAR(100) NULL COMMENT '品牌（快照）', "
                + "original_holder_id BIGINT NULL COMMENT '原持有人 ID（快照）', "
                + "original_holder_name VARCHAR(64) NULL COMMENT '原持有人姓名（快照）', "
                + "original_department VARCHAR(128) NULL COMMENT '原归属部门（快照）', "
                + "last_known_location VARCHAR(200) NULL COMMENT '最后已知位置', "
                + "loss_date DATE NOT NULL COMMENT '遗失日期', "
                + "loss_reason VARCHAR(500) NOT NULL COMMENT '报失原因', "
                + "reporter_id BIGINT NULL COMMENT '报失登记人 ID', "
                + "reporter_name VARCHAR(64) NULL COMMENT '报失登记人姓名', "
                + "status VARCHAR(20) NOT NULL DEFAULT 'searching' COMMENT '状态：searching/found_pending/recovered/written_off', "
                + "recovered_date DATE NULL COMMENT '找回日期', "
                + "recovered_location VARCHAR(200) NULL COMMENT '找回地点', "
                + "recovered_by_id BIGINT NULL COMMENT '找回登记人 ID', "
                + "recovered_by_name VARCHAR(64) NULL COMMENT '找回登记人姓名', "
                + "recovered_note VARCHAR(500) NULL COMMENT '找回说明', "
                + "inspection_result VARCHAR(20) NULL COMMENT '验收结果：normal/damaged/scrapped', "
                + "inspection_date DATE NULL COMMENT '验收日期', "
                + "inspection_note VARCHAR(500) NULL COMMENT '验收说明', "
                + "write_off_date DATE NULL COMMENT '核销日期', "
                + "write_off_reason VARCHAR(500) NULL COMMENT '核销原因', "
                + "write_off_evidence_id BIGINT NULL COMMENT '核销凭证 ID', "
                + "compensation_id BIGINT NULL COMMENT '关联赔付记录 ID', "
                + "repair_id BIGINT NULL COMMENT '关联维修记录 ID', "
                + "scrap_id BIGINT NULL COMMENT '关联报废记录 ID', "
                + "version BIGINT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号', "
                + "request_key VARCHAR(64) NULL COMMENT '幂等请求键', "
                + "from_migration TINYINT NOT NULL DEFAULT 0 COMMENT '是否历史回填', "
                + "created_by VARCHAR(64) NULL, "
                + "created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "
                + "updated_by VARCHAR(64) NULL, "
                + "updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, "
                + "deleted TINYINT NOT NULL DEFAULT 0, "
                + "UNIQUE KEY uk_loss_no (loss_no), "
                + "KEY idx_asset_id (asset_id), "
                + "KEY idx_status (status), "
                + "KEY idx_source (source_type, source_id), "
                + "KEY idx_return_id (return_id), "
                + "KEY idx_compensation_id (compensation_id), "
                + "KEY idx_loss_date (loss_date)"
                + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='资产遗失单'");

        // ───────────── biz_eam_loss_event 遗失事件日志表 ─────────────
        jdbcTemplate.execute(
                "CREATE TABLE IF NOT EXISTS biz_eam_loss_event ("
                + "id BIGINT AUTO_INCREMENT PRIMARY KEY, "
                + "loss_id BIGINT NOT NULL COMMENT '关联遗失单 ID', "
                + "event_type VARCHAR(32) NOT NULL COMMENT '事件类型', "
                + "event_desc VARCHAR(500) NOT NULL COMMENT '事件描述', "
                + "before_value TEXT NULL COMMENT '变更前值（JSON）', "
                + "after_value TEXT NULL COMMENT '变更后值（JSON）', "
                + "change_reason VARCHAR(500) NULL COMMENT '变更原因', "
                + "operator_id BIGINT NULL COMMENT '操作人 ID', "
                + "operator_name VARCHAR(64) NULL COMMENT '操作人姓名', "
                + "evidence_id BIGINT NULL COMMENT '关联凭证 ID', "
                + "created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "
                + "deleted TINYINT NOT NULL DEFAULT 0, "
                + "KEY idx_loss_id (loss_id), "
                + "KEY idx_event_type (event_type), "
                + "KEY idx_created_at (created_at)"
                + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='资产遗失事件日志'");

        // ───────────── biz_eam_compensation 增加 loss_id ─────────────
        alterSafe("biz_eam_compensation",
                "ADD COLUMN loss_id BIGINT NULL COMMENT '关联遗失单 ID' AFTER return_id");
        addIndexSafe("biz_eam_compensation", "idx_loss_id", "loss_id");

        // ───────────── biz_eam_scrap 增加 loss_id ─────────────
        alterSafe("biz_eam_scrap",
                "ADD COLUMN loss_id BIGINT NULL COMMENT '关联遗失单 ID（遗失核销时有值）' AFTER return_id");
        addIndexSafe("biz_eam_scrap", "idx_loss_id", "loss_id");

        log.info("v24 迁移完成：遗失找回模块表结构创建完成");
    }

    /** v25: 遗失找回菜单 + 编号规则 */
    private void createLossMenu() {
        log.info("开始执行 v25 迁移：遗失找回菜单及编号规则 ...");

        // 插入遗失找回菜单（asset-flow-ops 的子菜单）
        Long parentId = jdbcTemplate.queryForObject(
                "SELECT id FROM sys_menu WHERE menu_key = 'asset-flow-ops' AND deleted = 0 LIMIT 1", Long.class);
        if (parentId != null) {
            Long existing = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM sys_menu WHERE menu_key = 'asset-loss' AND deleted = 0", Long.class);
            if (existing != null && existing == 0) {
                jdbcTemplate.update(
                        "INSERT INTO sys_menu (parent_id, menu_key, name, path, component, icon, type, sort_order, actions, status, updated_by, deleted) "
                        + "VALUES (?, 'asset-loss', '遺失資產', '/asset-loss', '', 'SearchOutlined', 2, 8, '[\"view\",\"create\",\"edit\"]', 1, 'system', 0)",
                        parentId);
                log.info("遗失找回菜单已创建 parentId={}", parentId);

                // 默认给管理员角色授权
                Long adminRoleId = jdbcTemplate.queryForObject(
                        "SELECT id FROM sys_role WHERE code = 'admin' AND deleted = 0 LIMIT 1", Long.class);
                Long menuId = jdbcTemplate.queryForObject(
                        "SELECT id FROM sys_menu WHERE menu_key = 'asset-loss' AND deleted = 0 LIMIT 1", Long.class);
                if (adminRoleId != null && menuId != null) {
                    jdbcTemplate.update(
                            "INSERT IGNORE INTO sys_role_menu (role_id, menu_id) VALUES (?, ?)",
                            adminRoleId, menuId);
                }
            }
        }

        // 调整后续菜单排序
        jdbcTemplate.update("UPDATE sys_menu SET sort_order = 9  WHERE menu_key = 'asset-compensation' AND deleted = 0");
        jdbcTemplate.update("UPDATE sys_menu SET sort_order = 10 WHERE menu_key = 'asset-scrap' AND deleted = 0");
        jdbcTemplate.update("UPDATE sys_menu SET sort_order = 11 WHERE menu_key = 'asset-inventory' AND deleted = 0");
        jdbcTemplate.update("UPDATE sys_menu SET sort_order = 12 WHERE menu_key = 'asset-flow' AND deleted = 0");

        // 插入编号规则
        Long ruleExists = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_biz_seq_rule WHERE rule_key = 'eam_loss'", Long.class);
        if (ruleExists != null && ruleExists == 0) {
            jdbcTemplate.update(
                    "INSERT INTO sys_biz_seq_rule (rule_key, rule_name, prefix, date_format, seq_length, seq_start, status) "
                    + "VALUES ('eam_loss', '遺失編號', 'YS', 'YYYYMMDD', 4, 1, 1)");
            log.info("遗失编号规则已创建");
        }

        // 新增资产状态扩列（lost / pending_inspection / written_off 已在 v24 建表时处理，此处确保旧环境兼容）
        // 资产状态为 VARCHAR，无需 ALTER ENUM，直接允许新值写入

        log.info("v25 迁移完成：遗失找回菜单及编号规则创建完成");
    }

    /** v26: 菜单名称「遺失找回」→「遺失資產」 */
    private void renameLossMenu() {
        log.info("开始执行 v26 迁移：菜单名称 遺失找回 → 遺失資產 ...");
        jdbcTemplate.update("UPDATE sys_menu SET name = '遺失資產' WHERE menu_key = 'asset-loss' AND deleted = 0");
        log.info("v26 迁移完成：菜单名称已更新为 遺失資產");
    }
}
