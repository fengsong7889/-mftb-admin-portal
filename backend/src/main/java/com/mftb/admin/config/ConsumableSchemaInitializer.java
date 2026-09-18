package com.mftb.admin.config;

import com.mftb.admin.util.BizSeqService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/**
 * 耗材管理（消耗品/MRO）建表 + 菜单 + 编号规则初始化器
 * <p>
 * 对应 SQL 脚本: backend/sql/159_eam_consumable.sql（结构完全一致，二者幂等等效）。
 * 通过 SchemaVersionTracker 保证一次性执行；所有 DDL 用 CREATE TABLE IF NOT EXISTS、
 * 菜单用 NOT EXISTS 守卫、编号规则用 ON DUPLICATE KEY UPDATE，重复执行安全。
 * <p>
 * 设计要点：耗材域与资产域「单件化台账」分离，采用「数量型库存」模型：
 *   主数据(item) → 库存(stock，item×location) → 出入库流水(txn，append-only)
 *   → 领用单(claim/claim_item，申请→审批→出库核销，无归还流程)。
 */
@Slf4j
@Order(30)
@Component
@RequiredArgsConstructor
public class ConsumableSchemaInitializer implements CommandLineRunner {

    private static final String V_CONSUMABLE_SCHEMA = "consumable:schema-v1.0";
    private static final String V_CONSUMABLE_REFACTOR = "consumable:refactor-v2.2";

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;
    private final BizSeqService bizSeqService;

    @Override
    public void run(String... args) {
        versionTracker.applyOnce(V_CONSUMABLE_SCHEMA, this::migrate);
        versionTracker.applyOnce(V_CONSUMABLE_REFACTOR, this::migrateRefactor);
        // 每次启动均修正排序
        jdbcTemplate.update("UPDATE sys_menu SET sort_order = 4 WHERE menu_key = 'consumable-ops' AND deleted = 0 AND sort_order != 4");
        // 补种子：出入库流水菜单（v3，幂等）
        seedStockTxnMenu();
        // 排序修正：出入庫流水插入后，基础配置菜单顺延
        jdbcTemplate.update("UPDATE sys_menu SET sort_order = 7 WHERE menu_key = 'consumable-category' AND deleted = 0 AND sort_order != 7");
        jdbcTemplate.update("UPDATE sys_menu SET sort_order = 8 WHERE menu_key = 'consumable-brand' AND deleted = 0 AND sort_order != 8");
        jdbcTemplate.update("UPDATE sys_menu SET sort_order = 9 WHERE menu_key = 'consumable-unit' AND deleted = 0 AND sort_order != 9");
    }

    /** 幂等创建「出入库流水」菜单并授权 admin 角色 */
    private void seedStockTxnMenu() {
        Long groupId = queryLong("SELECT id FROM sys_menu WHERE menu_key = 'consumable-ops' AND deleted = 0 LIMIT 1");
        if (groupId == null) return;
        Integer exists = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_menu WHERE menu_key = 'consumable-stock-txn' AND deleted = 0", Integer.class);
        if (exists == null || exists == 0) {
            jdbcTemplate.update(
                    "INSERT INTO sys_menu (parent_id, menu_key, name, path, component, icon, type, sort_order, actions, status, updated_by, deleted) "
                            + "VALUES (?, 'consumable-stock-txn', '出入庫流水', '/consumable-stock-txn', 'ConsumableStockTxnList', 'SwapOutlined', 2, 6, '[\"view\"]', 1, 'system', 0)",
                    groupId);
            log.info("已创建菜单: 出入庫流水 (consumable-stock-txn)");
        }
        // admin 角色授权（INSERT IGNORE + 自愈）
        Long adminRoleId = queryLong("SELECT id FROM sys_role WHERE code = 'admin' LIMIT 1");
        if (adminRoleId != null) {
            String actionsJson = "[\"view\"]";
            jdbcTemplate.update(
                    "INSERT IGNORE INTO sys_role_menu (role_id, menu_id, actions) "
                            + "SELECT ?, m.id, ? FROM sys_menu m WHERE m.menu_key = 'consumable-stock-txn' AND m.deleted = 0",
                    adminRoleId, actionsJson);
            jdbcTemplate.update(
                    "UPDATE sys_role_menu rm JOIN sys_menu m ON rm.menu_id = m.id "
                            + "SET rm.actions = ? WHERE rm.role_id = ? AND m.menu_key = 'consumable-stock-txn' AND m.deleted = 0 "
                            + "AND (rm.actions IS NULL OR rm.actions = '')",
                    actionsJson, adminRoleId);
        }
    }

    private void migrate() {
        createTables();
        seedMenus();
        seedSeqRules();
        log.info("耗材管理（消耗品）初始化完成：建表 + 菜单 + 编号规则");
    }

    /**
     * 二期迁移：耗材分类/品牌/计量单位独立化
     */
    private void migrateRefactor() {
        log.info("开始耗材管理二期迁移：分类/品牌/计量单位独立化 ...");
        createRefactorTables();
        seedRefactorMenus();
        // 品牌编码列必须先于种子数据：seedRefactorData 的 INSERT 引用 code 列
        addBrandCodeColumns();
        seedRefactorData();
        log.info("耗材管理二期迁移完成");
    }

    /* ==================== 1. 建表 ==================== */

    private void createTables() {
        log.info("开始创建耗材管理表结构 ...");

        jdbcTemplate.execute(
                "CREATE TABLE IF NOT EXISTS biz_eam_consumable_item ("
                + "id BIGINT AUTO_INCREMENT PRIMARY KEY, "
                + "item_code VARCHAR(32) NOT NULL COMMENT '耗材编码（HC+6位全局自增）', "
                + "name VARCHAR(128) NOT NULL COMMENT '耗材名称', "
                + "category_id BIGINT DEFAULT NULL COMMENT '分类 ID', "
                + "category_code VARCHAR(64) DEFAULT '' COMMENT '分类编码快照', "
                + "category_name VARCHAR(100) DEFAULT '' COMMENT '分类名称快照', "
                + "brand VARCHAR(100) DEFAULT '' COMMENT '品牌', "
                + "spec VARCHAR(200) DEFAULT '' COMMENT '规格型号', "
                + "unit VARCHAR(32) NOT NULL DEFAULT '個' COMMENT '计量单位', "
                + "ref_price DECIMAL(14,2) DEFAULT 0 COMMENT '参考单价', "
                + "image TEXT DEFAULT NULL COMMENT '图片（Data URL）', "
                + "safety_stock INT NOT NULL DEFAULT 0 COMMENT '安全库存下限（0=不预警）', "
                + "max_stock INT NOT NULL DEFAULT 0 COMMENT '库存上限（0=不限）', "
                + "per_claim_limit INT NOT NULL DEFAULT 0 COMMENT '单人单次限领量（0=不限）', "
                + "status VARCHAR(16) NOT NULL DEFAULT 'enabled' COMMENT 'enabled/disabled', "
                + "remark VARCHAR(500) DEFAULT '' COMMENT '备注', "
                + "created_by VARCHAR(64) DEFAULT '' COMMENT '创建人', "
                + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP, "
                + "updated_by VARCHAR(64) DEFAULT '' COMMENT '最后更新人', "
                + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, "
                + "deleted TINYINT NOT NULL DEFAULT 0, "
                + "UNIQUE KEY uk_item_code (item_code), "
                + "KEY idx_status (status), KEY idx_category (category_id)"
                + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='耗材主数据'");

        jdbcTemplate.execute(
                "CREATE TABLE IF NOT EXISTS biz_eam_consumable_stock ("
                + "id BIGINT AUTO_INCREMENT PRIMARY KEY, "
                + "item_id BIGINT NOT NULL COMMENT '耗材 ID', "
                + "location_id BIGINT NOT NULL DEFAULT 0 COMMENT '仓库 ID', "
                + "location_name VARCHAR(200) DEFAULT '' COMMENT '仓库名称快照', "
                + "qty INT NOT NULL DEFAULT 0 COMMENT '当前库存数量', "
                + "locked_qty INT NOT NULL DEFAULT 0 COMMENT '审批中占用数量', "
                + "version BIGINT NOT NULL DEFAULT 0 COMMENT '乐观锁版本', "
                + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP, "
                + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, "
                + "UNIQUE KEY uk_item_location (item_id, location_id), KEY idx_item (item_id)"
                + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='耗材库存表'");

        jdbcTemplate.execute(
                "CREATE TABLE IF NOT EXISTS biz_eam_consumable_txn ("
                + "id BIGINT AUTO_INCREMENT PRIMARY KEY, "
                + "txn_no VARCHAR(40) NOT NULL COMMENT '流水号', "
                + "item_id BIGINT NOT NULL COMMENT '耗材 ID', "
                + "item_code VARCHAR(32) DEFAULT '' COMMENT '耗材编码快照', "
                + "item_name VARCHAR(128) DEFAULT '' COMMENT '耗材名称快照', "
                + "location_id BIGINT NOT NULL DEFAULT 0 COMMENT '仓库 ID', "
                + "location_name VARCHAR(200) DEFAULT '' COMMENT '仓库名称快照', "
                + "txn_type VARCHAR(20) NOT NULL COMMENT 'in_purchase/in_manual/in_adjust/out_claim/out_adjust', "
                + "qty INT NOT NULL COMMENT '变动数量（入正/出负）', "
                + "before_qty INT NOT NULL DEFAULT 0 COMMENT '变动前库存', "
                + "after_qty INT NOT NULL DEFAULT 0 COMMENT '变动后库存', "
                + "unit_cost DECIMAL(14,2) DEFAULT NULL COMMENT '入库单价', "
                + "ref_type VARCHAR(20) DEFAULT '' COMMENT '关联单据类型', "
                + "ref_id BIGINT DEFAULT NULL COMMENT '关联单据 ID', "
                + "operator_id BIGINT DEFAULT NULL COMMENT '操作人 ID', "
                + "operator VARCHAR(64) DEFAULT '' COMMENT '操作人姓名', "
                + "remark VARCHAR(500) DEFAULT '' COMMENT '备注', "
                + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP, "
                + "KEY idx_item (item_id), KEY idx_type (txn_type), "
                + "KEY idx_created (created_at), KEY idx_ref (ref_type, ref_id)"
                + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='耗材出入库流水'");

        jdbcTemplate.execute(
                "CREATE TABLE IF NOT EXISTS biz_eam_consumable_claim ("
                + "id BIGINT AUTO_INCREMENT PRIMARY KEY, "
                + "claim_no VARCHAR(32) NOT NULL COMMENT '领用单号（HCLY+YYYYMMDD+4位）', "
                + "applicant_id BIGINT NOT NULL COMMENT '申请人 ID', "
                + "applicant_name VARCHAR(64) NOT NULL COMMENT '申请人姓名快照', "
                + "applicant_emp_id VARCHAR(32) DEFAULT '' COMMENT '申请人工号', "
                + "department VARCHAR(100) DEFAULT '' COMMENT '申请部门', "
                + "reason VARCHAR(500) NOT NULL DEFAULT '' COMMENT '领用事由', "
                + "status VARCHAR(20) NOT NULL DEFAULT 'pending' COMMENT 'pending/approved/rejected/issued/cancelled', "
                + "approver_id BIGINT DEFAULT NULL COMMENT '审批人 ID', "
                + "approver_name VARCHAR(64) DEFAULT '' COMMENT '审批人姓名', "
                + "approved_at DATETIME DEFAULT NULL COMMENT '审批时间', "
                + "approve_remark VARCHAR(500) DEFAULT '' COMMENT '审批意见', "
                + "issue_operator_id BIGINT DEFAULT NULL COMMENT '出库操作人 ID', "
                + "issue_operator VARCHAR(64) DEFAULT '' COMMENT '出库操作人姓名', "
                + "issued_at DATETIME DEFAULT NULL COMMENT '出库时间', "
                + "cancel_reason VARCHAR(500) DEFAULT '' COMMENT '取消原因', "
                + "created_by VARCHAR(64) DEFAULT '', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, "
                + "updated_by VARCHAR(64) DEFAULT '', updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, "
                + "deleted TINYINT NOT NULL DEFAULT 0, "
                + "UNIQUE KEY uk_claim_no (claim_no), KEY idx_applicant (applicant_id), "
                + "KEY idx_status (status), KEY idx_created (created_at)"
                + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='耗材领用单'");

        jdbcTemplate.execute(
                "CREATE TABLE IF NOT EXISTS biz_eam_consumable_claim_item ("
                + "id BIGINT AUTO_INCREMENT PRIMARY KEY, "
                + "claim_id BIGINT NOT NULL COMMENT '领用单 ID', "
                + "item_id BIGINT NOT NULL COMMENT '耗材 ID', "
                + "item_code VARCHAR(32) DEFAULT '' COMMENT '耗材编码快照', "
                + "item_name VARCHAR(128) NOT NULL COMMENT '耗材名称快照', "
                + "spec VARCHAR(200) DEFAULT '' COMMENT '规格型号快照', "
                + "unit VARCHAR(32) DEFAULT '' COMMENT '单位快照', "
                + "qty INT NOT NULL COMMENT '领用数量', "
                + "location_id BIGINT NOT NULL DEFAULT 0 COMMENT '出库仓库 ID', "
                + "location_name VARCHAR(200) DEFAULT '' COMMENT '出库仓库名称快照', "
                + "unit_cost DECIMAL(14,2) DEFAULT NULL COMMENT '出库成本单价快照', "
                + "KEY idx_claim (claim_id), KEY idx_item (item_id)"
                + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='耗材领用单明细'");

        log.info("耗材管理表结构创建完成（5 张表）");
    }

    /* ==================== 2. 菜单 ==================== */

    private void seedMenus() {
        Long assetMgmtId = queryLong(
                "SELECT id FROM sys_menu WHERE menu_key = 'asset-management' AND deleted = 0 LIMIT 1");
        if (assetMgmtId == null) {
            log.warn("未找到 asset-management 菜单，跳过耗材菜单创建");
            return;
        }
        String actions = "[\"view\",\"create\",\"edit\",\"delete\"]";
        // 耗材管理分组（二级，挂在资产管理下，sort=4）
        ensureMenu(assetMgmtId, "consumable-ops", "耗材管理", "", "", "GoldOutlined", 4, "[\"view\"]");
        Long groupId = queryLong("SELECT id FROM sys_menu WHERE menu_key = 'consumable-ops' AND deleted = 0 LIMIT 1");
        if (groupId == null) return;
        // 5 个子菜单
        ensureMenu(groupId, "consumable-dashboard", "耗材看板", "/consumable-dashboard", "ConsumableDashboard", "DashboardOutlined", 1, "[\"view\"]");
        ensureMenu(groupId, "consumable-item", "耗材档案", "/consumable-item", "ConsumableItem", "ProfileOutlined", 2, actions);
        ensureMenu(groupId, "consumable-claim", "耗材领用", "/consumable-claim", "ConsumableClaim", "UserAddOutlined", 3, actions);
        ensureMenu(groupId, "consumable-stock", "耗材库存", "/consumable-stock", "ConsumableStock", "DatabaseOutlined", 4, "[\"view\",\"create\",\"edit\"]");
        ensureMenu(groupId, "consumable-alert", "库存预警", "/consumable-alert", "ConsumableAlert", "AlertOutlined", 5, "[\"view\",\"edit\"]");

        // admin 角色授权（超管在权限层直通，此处为菜单可见性与非超管角色兜底）
        // actions 必须写入：前端受控菜单要求 actions 非空，NULL/空授权会导致菜单整项隐藏
        Long adminRoleId = queryLong("SELECT id FROM sys_role WHERE code = 'admin' LIMIT 1");
        if (adminRoleId != null) {
            Map<String, String> menuActions = Map.of(
                    "consumable-ops", "[\"view\"]",
                    "consumable-dashboard", "[\"view\"]",
                    "consumable-item", actions,
                    "consumable-claim", actions,
                    "consumable-stock", "[\"view\",\"create\",\"edit\"]",
                    "consumable-alert", "[\"view\",\"edit\"]");
            menuActions.forEach((menuKey, menuActionsJson) -> {
                jdbcTemplate.update(
                        "INSERT IGNORE INTO sys_role_menu (role_id, menu_id, actions) "
                                + "SELECT ?, m.id, ? FROM sys_menu m WHERE m.menu_key = ? AND m.deleted = 0",
                        adminRoleId, menuActionsJson, menuKey);
                // 自愈历史数据：INSERT IGNORE 不会更新已有行，需补齐历史种子的 NULL/空 actions
                jdbcTemplate.update(
                        "UPDATE sys_role_menu rm JOIN sys_menu m ON rm.menu_id = m.id "
                                + "SET rm.actions = ? WHERE rm.role_id = ? AND m.menu_key = ? AND m.deleted = 0 "
                                + "AND (rm.actions IS NULL OR rm.actions = '')",
                        menuActionsJson, adminRoleId, menuKey);
            });
        }
        log.info("耗材管理菜单创建完成（1 分组 + 5 子菜单）");
    }

    /** 确保菜单存在（按 menu_key 判断，已存在则跳过） */
    private void ensureMenu(Long parentId, String menuKey, String name, String path,
                            String component, String icon, int sortOrder, String actions) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_menu WHERE menu_key = ? AND deleted = 0", Integer.class, menuKey);
        if (count != null && count > 0) return;
        jdbcTemplate.update(
                "INSERT INTO sys_menu (parent_id, menu_key, name, path, component, icon, type, sort_order, actions, status, updated_by, deleted) "
                        + "VALUES (?, ?, ?, ?, ?, ?, 2, ?, ?, 1, 'system', 0)",
                parentId, menuKey, name, path, component, icon, sortOrder, actions);
        log.info("已创建菜单: {} ({})", name, menuKey);
    }

    /* ==================== 3. 编号规则 ==================== */

    private void seedSeqRules() {
        int affected = 0;
        // 耗材编码：HC + 6 位全局自增（无日期维度）
        affected += seedRule(BizSeqService.RULE_EAM_CONSUMABLE_ITEM, "耗材編碼",
                "物資管理(EAM)-耗材檔案", "HC", "", 6, 1,
                "{prefix} + {n}位數字自增（全局自增，如 HC000001）");
        // 耗材领用单号：HCLY + YYYYMMDD + 4 位自增
        affected += seedRule(BizSeqService.RULE_EAM_CONSUMABLE_CLAIM, "耗材領用單號",
                "物資管理(EAM)-耗材領用", "HCLY", "YYYYMMDD", 4, 0,
                "{prefix} + YYYYMMDD + {n}位自增序號");
        if (affected > 0) {
            bizSeqService.refreshRules();
            log.info("已写入/修正耗材编号规则种子数据（HC / HCLY）");
        }
    }

    private int seedRule(String ruleKey, String ruleName, String bizMenu, String prefix,
                         String dateFormat, int seqLength, int seqStart, String remark) {
        return jdbcTemplate.update(
                "INSERT INTO sys_biz_seq_rule "
                        + "(rule_key, rule_name, biz_menu, prefix, date_format, seq_length, seq_start, status, remark) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?) "
                        + "ON DUPLICATE KEY UPDATE rule_name = VALUES(rule_name), biz_menu = VALUES(biz_menu), "
                        + "prefix = VALUES(prefix), date_format = VALUES(date_format), seq_length = VALUES(seq_length), "
                        + "seq_start = VALUES(seq_start), remark = VALUES(remark), status = 1",
                ruleKey, ruleName, bizMenu, prefix, dateFormat, seqLength, seqStart, remark);
    }

    private Long queryLong(String sql) {
        try {
            return jdbcTemplate.queryForObject(sql, Long.class);
        } catch (Exception e) {
            return null;
        }
    }

    /* ==================== 4. 二期迁移：建表 ==================== */

    private void createRefactorTables() {
        log.info("开始创建耗材基础数据表结构 ...");

        // 耗材分类
        jdbcTemplate.execute(
                "CREATE TABLE IF NOT EXISTS biz_consumable_category ("
                + "id BIGINT AUTO_INCREMENT PRIMARY KEY, "
                + "code VARCHAR(64) NOT NULL COMMENT '分类编码', "
                + "name VARCHAR(100) NOT NULL COMMENT '分类名称', "
                + "parent_id BIGINT DEFAULT 0 COMMENT '父分类 ID', "
                + "sort_order INT DEFAULT 0 COMMENT '排序', "
                + "status VARCHAR(16) NOT NULL DEFAULT 'enabled', "
                + "remark VARCHAR(500) DEFAULT '', "
                + "created_by VARCHAR(64) DEFAULT '', "
                + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP, "
                + "updated_by VARCHAR(64) DEFAULT '', "
                + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, "
                + "deleted TINYINT NOT NULL DEFAULT 0, "
                + "UNIQUE KEY uk_code (code), KEY idx_parent (parent_id), KEY idx_status (status)"
                + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='耗材分类'");

        // 耗材品牌
        jdbcTemplate.execute(
                "CREATE TABLE IF NOT EXISTS biz_consumable_brand ("
                + "id BIGINT AUTO_INCREMENT PRIMARY KEY, "
                + "name VARCHAR(100) NOT NULL COMMENT '品牌名称', "
                + "name_en VARCHAR(100) DEFAULT '' COMMENT '英文名', "
                + "category_type VARCHAR(20) NOT NULL DEFAULT 'CONSUMABLE' COMMENT 'ASSET/CONSUMABLE/BOTH', "
                + "logo VARCHAR(500) DEFAULT '' COMMENT 'Logo URL', "
                + "status VARCHAR(16) NOT NULL DEFAULT 'enabled', "
                + "remark VARCHAR(500) DEFAULT '', "
                + "created_by VARCHAR(64) DEFAULT '', "
                + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP, "
                + "updated_by VARCHAR(64) DEFAULT '', "
                + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, "
                + "deleted TINYINT NOT NULL DEFAULT 0, "
                + "UNIQUE KEY uk_name (name), KEY idx_type (category_type), KEY idx_status (status)"
                + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='耗材品牌'");

        // 计量单位
        jdbcTemplate.execute(
                "CREATE TABLE IF NOT EXISTS biz_consumable_unit ("
                + "id BIGINT AUTO_INCREMENT PRIMARY KEY, "
                + "name VARCHAR(32) NOT NULL COMMENT '单位名称', "
                + "abbr VARCHAR(16) DEFAULT '' COMMENT '缩写', "
                + "sort_order INT DEFAULT 0 COMMENT '排序', "
                + "status VARCHAR(16) NOT NULL DEFAULT 'enabled', "
                + "created_by VARCHAR(64) DEFAULT '', "
                + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP, "
                + "updated_by VARCHAR(64) DEFAULT '', "
                + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, "
                + "deleted TINYINT NOT NULL DEFAULT 0, "
                + "UNIQUE KEY uk_name (name), KEY idx_status (status)"
                + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='耗材计量单位字典'");

        // 耗材主数据表增加新字段（兼容不支持 ADD COLUMN IF NOT EXISTS 的 MySQL 版本）
        addColumnIfNotExists("biz_eam_consumable_item", "consumable_category_id",
                "BIGINT DEFAULT NULL COMMENT '耗材分类 ID'");
        addColumnIfNotExists("biz_eam_consumable_item", "brand_id",
                "BIGINT DEFAULT NULL COMMENT '耗材品牌 ID'");
        addIndexIfNotExists("biz_eam_consumable_item", "idx_consumable_category",
                "consumable_category_id");
        addIndexIfNotExists("biz_eam_consumable_item", "idx_brand", "brand_id");

        log.info("耗材基础数据表结构创建完成（3 张新表 + 2 个新字段）");
    }

    /* ==================== 5. 二期迁移：菜单 ==================== */

    private void seedRefactorMenus() {
        Long groupId = queryLong("SELECT id FROM sys_menu WHERE menu_key = 'consumable-ops' AND deleted = 0 LIMIT 1");
        if (groupId == null) {
            log.warn("未找到 consumable-ops 分组，跳过基础配置菜单创建");
            return;
        }
        String actions = "[\"view\",\"create\",\"edit\",\"delete\"]";
        ensureMenu(groupId, "consumable-category", "耗材分類管理", "/consumable-category", "ConsumableCategory", "AppstoreOutlined", 6, actions);
        ensureMenu(groupId, "consumable-brand", "耗材品牌管理", "/consumable-brand", "ConsumableBrand", "TagOutlined", 7, actions);
        ensureMenu(groupId, "consumable-unit", "計量單位管理", "/consumable-unit", "ConsumableUnit", "ColumnWidthOutlined", 8, actions);

        // admin 角色授权
        Long adminRoleId = queryLong("SELECT id FROM sys_role WHERE code = 'admin' LIMIT 1");
        if (adminRoleId != null) {
            for (String menuKey : new String[]{"consumable-category", "consumable-brand", "consumable-unit"}) {
                jdbcTemplate.update(
                        "INSERT IGNORE INTO sys_role_menu (role_id, menu_id, actions) "
                                + "SELECT ?, m.id, ? FROM sys_menu m WHERE m.menu_key = ? AND m.deleted = 0",
                        adminRoleId, actions, menuKey);
            }
        }
        log.info("耗材基础配置菜单创建完成（3 个新菜单）");
    }

    /* ==================== 6. 二期迁移：种子数据 ==================== */

    private void seedRefactorData() {
        // 计量单位种子
        String[][] units = {
                {"個", "pcs", "1"}, {"支", "pcs", "2"}, {"盒", "box", "3"},
                {"包", "pack", "4"}, {"箱", "ctn", "5"}, {"瓶", "btl", "6"},
                {"卷", "roll", "7"}, {"張", "sheet", "8"}, {"套", "set", "9"},
                {"袋", "bag", "10"}
        };
        for (String[] u : units) {
            jdbcTemplate.update(
                    "INSERT IGNORE INTO biz_consumable_unit (name, abbr, sort_order, status, created_by, updated_by) VALUES (?, ?, ?, 'enabled', 'system', 'system')",
                    u[0], u[1], Integer.parseInt(u[2]));
        }

        // 耗材分类种子
        String[][] categories = {
                {"HC01", "辦公文具", "1"}, {"HC02", "辦公設備耗材", "2"},
                {"HC03", "清潔用品", "3"}, {"HC04", "勞保用品", "4"},
                {"HC05", "水電物料", "5"}, {"HC06", "其他", "99"}
        };
        for (String[] c : categories) {
            jdbcTemplate.update(
                    "INSERT IGNORE INTO biz_consumable_category (code, name, parent_id, sort_order, status, created_by, updated_by) VALUES (?, ?, 0, ?, 'enabled', 'system', 'system')",
                    c[0], c[1], Integer.parseInt(c[2]));
        }

        // 耗材品牌种子（含 CB 编码）
        String[][] brands = {
                {"CB01", "得力", "Deli", "CONSUMABLE"}, {"CB02", "晨光", "M&G", "CONSUMABLE"},
                {"CB03", "真彩", "Truecolor", "CONSUMABLE"}, {"CB04", "廣博", "GuangBo", "CONSUMABLE"},
                {"CB05", "齊心", "Comix", "CONSUMABLE"}, {"CB06", "惠普", "HP", "BOTH"},
                {"CB07", "佳能", "Canon", "BOTH"}, {"CB08", "愛普生", "Epson", "BOTH"},
                {"CB09", "兄弟", "Brother", "BOTH"}, {"CB10", "維達", "Vinda", "CONSUMABLE"},
                {"CB11", "清風", "Breeze", "CONSUMABLE"}, {"CB12", "藍月亮", "BlueMoon", "CONSUMABLE"},
                {"CB13", "立白", "Liby", "CONSUMABLE"}, {"CB14", "3M", "3M", "BOTH"}
        };
        for (String[] b : brands) {
            jdbcTemplate.update(
                    "INSERT IGNORE INTO biz_consumable_brand (code, name, name_en, category_type, status, created_by, updated_by) VALUES (?, ?, ?, ?, 'enabled', 'system', 'system')",
                    b[0], b[1], b[2], b[3]);
        }
        log.info("耗材基础数据种子数据写入完成");
    }

    /** 为耗材品牌和资产品牌添加 code 列并填充存量数据 */
    private void addBrandCodeColumns() {
        // 耗材品牌加 code 列
        addColumnIfNotExists("biz_consumable_brand", "code", "VARCHAR(32) DEFAULT NULL COMMENT '品牌编码（CB 前缀）'");
        // 填充存量耗材品牌编码
        List<Map<String, Object>> consumableBrands = jdbcTemplate.queryForList(
                "SELECT id, code FROM biz_consumable_brand WHERE deleted = 0 ORDER BY id");
        int cbSeq = 1;
        for (Map<String, Object> row : consumableBrands) {
            if (row.get("code") == null || ((String) row.get("code")).isBlank()) {
                jdbcTemplate.update("UPDATE biz_consumable_brand SET code = ? WHERE id = ?",
                        String.format("CB%02d", cbSeq), row.get("id"));
            }
            cbSeq++;
        }

        // 资产品牌加 code 列
        addColumnIfNotExists("biz_eam_brand", "code", "VARCHAR(32) DEFAULT NULL COMMENT '品牌编码（AB 前缀）'");
        // 填充存量资产品牌编码
        List<Map<String, Object>> assetBrands = jdbcTemplate.queryForList(
                "SELECT id, code FROM biz_eam_brand WHERE deleted = 0 ORDER BY id");
        int abSeq = 1;
        for (Map<String, Object> row : assetBrands) {
            if (row.get("code") == null || ((String) row.get("code")).isBlank()) {
                jdbcTemplate.update("UPDATE biz_eam_brand SET code = ? WHERE id = ?",
                        String.format("AB%02d", abSeq), row.get("id"));
            }
            abSeq++;
        }
        log.info("品牌编码列添加完成（耗材品牌 CB + 资产品牌 AB）");
    }

    /** 安全添加列（兼容不支持 ADD COLUMN IF NOT EXISTS 的 MySQL 版本） */
    private void addColumnIfNotExists(String table, String column, String definition) {
        Integer cnt = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.COLUMNS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
                Integer.class, table, column);
        if (cnt != null && cnt == 0) {
            jdbcTemplate.execute("ALTER TABLE " + table + " ADD COLUMN " + column + " " + definition);
            log.info("已为 {} 表添加 {} 列", table, column);
        }
    }

    /** 安全添加索引（兼容不支持 ADD KEY IF NOT EXISTS 的 MySQL 版本） */
    private void addIndexIfNotExists(String table, String indexName, String columns) {
        Integer cnt = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.STATISTICS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?",
                Integer.class, table, indexName);
        if (cnt != null && cnt == 0) {
            jdbcTemplate.execute("ALTER TABLE " + table + " ADD INDEX " + indexName + " (" + columns + ")");
            log.info("已为 {} 表添加索引 {}", table, indexName);
        }
    }
}
