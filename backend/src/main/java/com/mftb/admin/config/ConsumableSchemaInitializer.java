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
    /** 计量单位字典表废弃清理（一次性） */
    private static final String V_DROP_UNIT_TABLE = "consumable:drop-unit-table-v1";
    /** 所属品牌 + 购买公司 + 成本/归属快照 + 业务单据表 + 购买公司字典（一次性大迁移） */
    private static final String V_BRAND_COMPANY = "consumable:brand-company-v1";
    static final String V_RETIRE_LEGACY_MENUS = "consumable:retire-legacy-menus-v1.0";
    private static final String LEGACY_MENU_FILTER =
            "menu_key IN ('consumable-category', 'consumable-brand', 'consumable-unit')";

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;
    private final BizSeqService bizSeqService;

    @Override
    public void run(String... args) {
        versionTracker.applyOnce(V_CONSUMABLE_SCHEMA, this::migrate);
        versionTracker.applyOnce(V_CONSUMABLE_REFACTOR, this::migrateRefactor);
        // 耗材改造：所属品牌 + 购买公司 + 成本/归属快照 + 入库/退料/调整/调拨单据表 + 购买公司字典
        versionTracker.applyOnce(V_BRAND_COMPANY, this::migrateBrandCompany);
        // 每次启动均修正排序（v41 菜单重组后，耗材管理排在資產看板之後 sort=2，两个业务线入口对称）
        jdbcTemplate.update("UPDATE sys_menu SET sort_order = 2 WHERE menu_key = 'consumable-ops' AND deleted = 0 AND sort_order != 2");
        // 补种子：出入库流水菜单（v3，幂等）
        seedStockTxnMenu();
        // v40: 耗材领用菜单每次启动幂等补种（不受 applyOnce 门控）：
        //      167 菜单重组曾把它误删成「暗页面」（路由/控制器仍在但菜单消失）, 门控后不再补种会重现该缺陷
        ensureClaimMenuEveryStartup();
        // 计量单位字典表废弃：存量库（含生产）一次性 DROP，单位已改为产品/耗材上的文本属性
        versionTracker.applyOnce(V_DROP_UNIT_TABLE, this::dropLegacyUnitTable);
        // 方案二：耗材分类/品牌/计量单位三个基础配置菜单已下线（并入分类库/品牌产品库），不再补种
        reconcileLegacyConsumableMenus();
    }

    /** 独立收敛旧菜单；不能通过重跑含业务数据搬迁的 EAM v8 来修复菜单漂移。 */
    void reconcileLegacyConsumableMenus() {
        if (!versionTracker.applyOnce(V_RETIRE_LEGACY_MENUS,
                this::retireLegacyConsumableMenus, this::verifyLegacyConsumableMenusRetired)) {
            // 一次性版本已记录后仍校验并修复，防止旧实例或历史脚本恢复废弃菜单。
            retireLegacyConsumableMenus();
            verifyLegacyConsumableMenusRetired();
        }
    }

    private void retireLegacyConsumableMenus() {
        log.info("开始收敛耗材旧分类/品牌/计量单位菜单");
        int affected = jdbcTemplate.update("UPDATE sys_menu SET deleted = 1, status = 0, updated_by = 'system' "
                + "WHERE " + LEGACY_MENU_FILTER + " AND (deleted <> 1 OR status <> 0)");
        log.info("耗材旧菜单收敛完成：{} 条；保留菜单记录及业务数据", affected);
    }

    private void verifyLegacyConsumableMenusRetired() {
        Integer remaining = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM sys_menu WHERE "
                + LEGACY_MENU_FILTER + " AND (deleted <> 1 OR status <> 0)", Integer.class);
        if (remaining == null || remaining != 0) {
            throw new IllegalStateException("耗材旧分类/品牌/计量单位菜单未全部下线");
        }
    }

    /** 删除已废弃的耗材计量单位字典表（幂等，表不存在时不报错） */
    private void dropLegacyUnitTable() {
        jdbcTemplate.execute("DROP TABLE IF EXISTS biz_consumable_unit");
        log.info("已删除废弃的计量单位字典表 biz_consumable_unit（单位改为产品/耗材文本属性）");
    }

    /** 每次启动确保「耗材領用」菜单存在并挂回耗材管理分组（仅修补缺失, 不覆盖人工改名） */
    private void ensureClaimMenuEveryStartup() {
        Long groupId = queryLong("SELECT id FROM sys_menu WHERE menu_key = 'consumable-ops' AND deleted = 0 LIMIT 1");
        if (groupId == null) {
            return;
        }
        ensureMenu(groupId, "consumable-claim", "耗材領用", "/consumable-claim", "ConsumableClaim",
                "UserAddOutlined", 3, "[\"view\",\"create\",\"edit\",\"delete\"]");
        // 英文名称：本初始化器晚于 DataInitializer.seedMenuEnglishNames 执行, 新建的菜单需自行补 name_en
        jdbcTemplate.update("UPDATE sys_menu SET name_en = 'Consumable Claim' "
                + "WHERE menu_key = 'consumable-claim' AND deleted = 0 AND (name_en IS NULL OR name_en = '')");
        Long adminRoleId = queryLong("SELECT id FROM sys_role WHERE code = 'admin' LIMIT 1");
        Long menuId = queryLong("SELECT id FROM sys_menu WHERE menu_key = 'consumable-claim' AND deleted = 0 LIMIT 1");
        if (adminRoleId != null && menuId != null) {
            String actions = "[\"view\",\"create\",\"edit\",\"delete\"]";
            jdbcTemplate.update(
                    "INSERT IGNORE INTO sys_role_menu (role_id, menu_id, actions) VALUES (?, ?, ?)",
                    adminRoleId, menuId, actions);
            jdbcTemplate.update(
                    "UPDATE sys_role_menu SET actions = ? WHERE role_id = ? AND menu_id = ? "
                            + "AND (actions IS NULL OR actions = '')",
                    actions, adminRoleId, menuId);
        }
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
        log.info("开始耗材管理二期迁移：计量单位独立化 + 基础数据统一化 ...");
        createRefactorTables();
        // 品牌编码列必须先于种子数据
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
        // 耗材管理分组（二级，挂在物資管理下，sort=2）
        ensureMenu(assetMgmtId, "consumable-ops", "耗材管理", "", "", "GoldOutlined", 2, "[\"view\"]");
        Long groupId = queryLong("SELECT id FROM sys_menu WHERE menu_key = 'consumable-ops' AND deleted = 0 LIMIT 1");
        if (groupId == null) return;
        // 5 个子菜单
        ensureMenu(groupId, "consumable-dashboard", "耗材看板", "/consumable-dashboard", "ConsumableDashboard", "DashboardOutlined", 1, "[\"view\"]");
        ensureMenu(groupId, "consumable-item", "耗材檔案", "/consumable-item", "ConsumableItem", "ProfileOutlined", 2, actions);
        ensureMenu(groupId, "consumable-claim", "耗材領用", "/consumable-claim", "ConsumableClaim", "UserAddOutlined", 3, actions);
        ensureMenu(groupId, "consumable-stock", "耗材庫存", "/consumable-stock", "ConsumableStock", "DatabaseOutlined", 4, "[\"view\",\"create\",\"edit\"]");
        ensureMenu(groupId, "consumable-alert", "庫存預警", "/consumable-alert", "ConsumableAlert", "AlertOutlined", 5, "[\"view\",\"edit\"]");

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

    /** 确保菜单存在（按 menu_key 判断，已存在则跳过；存在逻辑删除行时先恢复，避免 uk_menu_key 唯一约束冲突） */
    private void ensureMenu(Long parentId, String menuKey, String name, String path,
                            String component, String icon, int sortOrder, String actions) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_menu WHERE menu_key = ? AND deleted = 0", Integer.class, menuKey);
        if (count != null && count > 0) return;
        // 同 key 菜单被逻辑删除时先恢复（uk_menu_key 唯一约束禁止同键再 INSERT）
        int revived = jdbcTemplate.update(
                "UPDATE sys_menu SET deleted = 0, parent_id = ?, name = ?, path = ?, component = ?, icon = ?, sort_order = ?, actions = ?, status = 1, updated_by = 'system' "
                        + "WHERE menu_key = ? AND deleted = 1",
                parentId, name, path, component, icon, sortOrder, actions, menuKey);
        if (revived > 0) {
            log.info("已恢复逻辑删除菜单: {} ({})", name, menuKey);
            return;
        }
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
                "物資管理-耗材檔案", "HC", "", 6, 1,
                "{prefix} + {n}位數字自增（全局自增，如 HC000001）");
        // 耗材领用单号：HCLY + YYYYMMDD + 4 位自增
        affected += seedRule(BizSeqService.RULE_EAM_CONSUMABLE_CLAIM, "耗材領用單號",
                "物資管理-耗材領用", "HCLY", "YYYYMMDD", 4, 0,
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

        // 方案二：耗材分类/品牌表已并入统一分类库/品牌产品库（biz_eam_category / biz_eam_brand），不再建旧表
        // 计量单位不再建字典表：单位作为产品/耗材记录（biz_eam_model.unit / biz_eam_consumable_item.unit）的文本属性直存

        // 耗材主数据表增加新字段（兼容不支持 ADD COLUMN IF NOT EXISTS 的 MySQL 版本）
        addColumnIfNotExists("biz_eam_consumable_item", "consumable_category_id",
                "BIGINT DEFAULT NULL COMMENT '耗材分类 ID'");
        addColumnIfNotExists("biz_eam_consumable_item", "brand_id",
                "BIGINT DEFAULT NULL COMMENT '耗材品牌 ID'");
        addIndexIfNotExists("biz_eam_consumable_item", "idx_consumable_category",
                "consumable_category_id");
        addIndexIfNotExists("biz_eam_consumable_item", "idx_brand", "brand_id");

        log.info("耗材主数据字段补齐完成（计量单位字典已废弃，不再建表）");
    }

    /* ==================== 6. 二期迁移：种子数据 ==================== */

    private void seedRefactorData() {
        // 计量单位字典已废弃（表已删除），不再灌 10 条系统种子；单位在建产品/耗材档案时直接输入

        // 方案二：耗材分类/品牌种子写入统一表（biz_type=CONSUMABLE）
        seedUnifiedConsumableBasic();
        log.info("耗材基础数据种子数据写入完成");
    }

    /** 方案二：耗材分类/品牌种子写入统一分类库/品牌产品库表（仅当无 CONSUMABLE 数据时） */
    private void seedUnifiedConsumableBasic() {
        Integer catCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM biz_eam_category WHERE biz_type = 'CONSUMABLE' AND deleted = 0", Integer.class);
        if (catCount == null || catCount == 0) {
            String[][] categories = {
                    {"HC01", "辦公文具", "1"}, {"HC02", "辦公設備耗材", "2"},
                    {"HC03", "清潔用品", "3"}, {"HC04", "勞保用品", "4"},
                    {"HC05", "水電物料", "5"}, {"HC06", "其他", "99"}
            };
            for (String[] c : categories) {
                jdbcTemplate.update(
                        "INSERT INTO biz_eam_category (code, name, parent_id, biz_type, status, sort, remark, updated_by, deleted) "
                                + "VALUES (?, ?, 0, 'CONSUMABLE', 'enabled', ?, '', 'system', 0)",
                        c[0], c[1], Integer.parseInt(c[2]));
            }
            log.info("统一分类库耗材分类种子写入：{} 条", categories.length);
        }
        Integer brandCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM biz_eam_brand WHERE biz_type = 'CONSUMABLE' AND deleted = 0", Integer.class);
        if (brandCount == null || brandCount == 0) {
            String[][] brands = {
                    {"CB01", "得力", "Deli"}, {"CB02", "晨光", "M&G"},
                    {"CB03", "真彩", "Truecolor"}, {"CB04", "廣博", "GuangBo"},
                    {"CB05", "齊心", "Comix"}, {"CB06", "惠普", "HP"},
                    {"CB07", "佳能", "Canon"}, {"CB08", "愛普生", "Epson"},
                    {"CB09", "兄弟", "Brother"}, {"CB10", "維達", "Vinda"},
                    {"CB11", "清風", "Breeze"}, {"CB12", "藍月亮", "BlueMoon"},
                    {"CB13", "立白", "Liby"}, {"CB14", "3M", "3M"}
            };
            for (String[] b : brands) {
                jdbcTemplate.update(
                        "INSERT INTO biz_eam_brand (code, category_code, brand_zh, brand_en, brand_logo, biz_type, status, remark, updated_by, deleted) "
                                + "VALUES (?, '', ?, ?, '', 'CONSUMABLE', 'enabled', '', 'system', 0)",
                        b[0], b[1], b[2]);
            }
            log.info("统一品牌产品库耗材品牌种子写入：{} 条", brands.length);
        }
    }

    /** 为所属品牌添加 code 列并填充存量数据（耗材品牌已并入统一表，编码随迁移带出） */
    private void addBrandCodeColumns() {
        // 所属品牌加 code 列
        addColumnIfNotExists("biz_eam_brand", "code", "VARCHAR(32) DEFAULT NULL COMMENT '品牌编码（AB 前缀）'");
        // 填充存量所属品牌编码
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
        log.info("品牌编码列添加完成（所属品牌 AB）");
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

    /** 安全添加唯一索引（幂等） */
    private void addUniqueIndexIfNotExists(String table, String indexName, String columns) {
        Integer cnt = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.STATISTICS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?",
                Integer.class, table, indexName);
        if (cnt != null && cnt == 0) {
            jdbcTemplate.execute("ALTER TABLE " + table + " ADD UNIQUE " + indexName + " (" + columns + ")");
            log.info("已为 {} 表添加唯一索引 {}", table, indexName);
        }
    }

    /* ==================== 7. 品牌/公司改造大迁移 ==================== */

    /**
     * 耗材改造（一次性）：
     *   1. 档案 item 新增所属品牌 + 购买公司
     *   2. 库存 stock 新增归属快照 + 移动加权均价 + 成本金额 + 操作人
     *   3. 流水 txn 新增成本金额 + 归属/部门/领用人快照 + 记账日期 + 幂等键
     *   4. 领用单/明细新增归属快照 + 成本 + 退料数量
     *   5. 新建入库单/入库明细/退料/调整/调拨 5 张单据表
     *   6. 新建购买公司字典 + 种子；新增入库/统计菜单 + 编号规则
     */
    private void migrateBrandCompany() {
        log.info("开始执行耗材改造迁移（所属品牌 + 购买公司 + 成本/归属快照 + 单据表）...");
        addConsumableBrandCompanyColumns();
        createConsumableDocTables();
        createPurchaseCompanyDict();
        seedPurchaseCompanyData();
        seedConsumableDocMenus();
        seedConsumableDocSeqRules();
        log.info("耗材改造迁移完成");
    }

    /** 为现有 5 张表补充归属/成本/快照列（逐列查 information_schema 后再 ADD） */
    private void addConsumableBrandCompanyColumns() {
        // 1. 主数据
        addColumnIfNotExists("biz_eam_consumable_item", "company_brand",
                "BIGINT DEFAULT NULL COMMENT '所属品牌ID（sys_company_brand）'");
        addColumnIfNotExists("biz_eam_consumable_item", "purchase_company_id",
                "BIGINT DEFAULT NULL COMMENT '购买公司ID（sys_purchase_company）'");
        addColumnIfNotExists("biz_eam_consumable_item", "purchase_company",
                "VARCHAR(100) DEFAULT '' COMMENT '购买公司名称快照'");
        addIndexIfNotExists("biz_eam_consumable_item", "idx_company_brand", "company_brand");
        addIndexIfNotExists("biz_eam_consumable_item", "idx_purchase_company", "purchase_company_id");
        // 2. 库存
        addColumnIfNotExists("biz_eam_consumable_stock", "company_brand",
                "BIGINT DEFAULT NULL COMMENT '所属品牌ID快照'");
        addColumnIfNotExists("biz_eam_consumable_stock", "purchase_company_id",
                "BIGINT DEFAULT NULL COMMENT '购买公司ID快照'");
        addColumnIfNotExists("biz_eam_consumable_stock", "purchase_company",
                "VARCHAR(100) DEFAULT '' COMMENT '购买公司名称快照'");
        addColumnIfNotExists("biz_eam_consumable_stock", "avg_cost",
                "DECIMAL(16,6) NOT NULL DEFAULT 0 COMMENT '移动加权平均单位成本'");
        addColumnIfNotExists("biz_eam_consumable_stock", "total_cost",
                "DECIMAL(18,2) NOT NULL DEFAULT 0 COMMENT '库存成本金额'");
        addColumnIfNotExists("biz_eam_consumable_stock", "updated_by",
                "VARCHAR(64) DEFAULT '' COMMENT '库存最后操作人'");
        // 3. 流水
        addColumnIfNotExists("biz_eam_consumable_txn", "amount",
                "DECIMAL(18,2) DEFAULT NULL COMMENT '变动成本金额（入库正/出库负）'");
        addColumnIfNotExists("biz_eam_consumable_txn", "company_brand",
                "BIGINT DEFAULT NULL COMMENT '所属品牌ID快照'");
        addColumnIfNotExists("biz_eam_consumable_txn", "purchase_company_id",
                "BIGINT DEFAULT NULL COMMENT '购买公司ID快照'");
        addColumnIfNotExists("biz_eam_consumable_txn", "department_id",
                "BIGINT DEFAULT NULL COMMENT '承担部门ID'");
        addColumnIfNotExists("biz_eam_consumable_txn", "department",
                "VARCHAR(100) DEFAULT '' COMMENT '承担部门名称快照'");
        addColumnIfNotExists("biz_eam_consumable_txn", "applicant_id",
                "BIGINT DEFAULT NULL COMMENT '领用人ID（sys_user.id）'");
        addColumnIfNotExists("biz_eam_consumable_txn", "applicant_emp_id",
                "VARCHAR(32) DEFAULT '' COMMENT '领用人工号'");
        addColumnIfNotExists("biz_eam_consumable_txn", "applicant_name",
                "VARCHAR(64) DEFAULT '' COMMENT '领用人姓名'");
        addColumnIfNotExists("biz_eam_consumable_txn", "biz_date",
                "DATE DEFAULT NULL COMMENT '业务记账日期'");
        addColumnIfNotExists("biz_eam_consumable_txn", "idempotency_key",
                "VARCHAR(80) DEFAULT NULL COMMENT '幂等键（来源单据行）'");
        addUniqueIndexIfNotExists("biz_eam_consumable_txn", "uk_txn_idem", "idempotency_key");
        addIndexIfNotExists("biz_eam_consumable_txn", "idx_txn_company", "purchase_company_id");
        addIndexIfNotExists("biz_eam_consumable_txn", "idx_txn_dept", "department_id");
        addIndexIfNotExists("biz_eam_consumable_txn", "idx_txn_applicant", "applicant_id");
        // 4. 领用单
        addColumnIfNotExists("biz_eam_consumable_claim", "company_brand",
                "BIGINT DEFAULT NULL COMMENT '所属品牌ID快照'");
        addColumnIfNotExists("biz_eam_consumable_claim", "purchase_company_id",
                "BIGINT DEFAULT NULL COMMENT '购买公司ID快照'");
        addColumnIfNotExists("biz_eam_consumable_claim", "purchase_company",
                "VARCHAR(100) DEFAULT '' COMMENT '购买公司名称快照'");
        addColumnIfNotExists("biz_eam_consumable_claim", "department_id",
                "BIGINT DEFAULT NULL COMMENT '承担部门ID'");
        addColumnIfNotExists("biz_eam_consumable_claim", "cost_amount",
                "DECIMAL(18,2) NOT NULL DEFAULT 0 COMMENT '出库成本合计'");
        // 5. 领用明细
        addColumnIfNotExists("biz_eam_consumable_claim_item", "company_brand",
                "BIGINT DEFAULT NULL COMMENT '所属品牌ID快照'");
        addColumnIfNotExists("biz_eam_consumable_claim_item", "purchase_company_id",
                "BIGINT DEFAULT NULL COMMENT '购买公司ID快照'");
        addColumnIfNotExists("biz_eam_consumable_claim_item", "actual_unit_cost",
                "DECIMAL(16,6) DEFAULT NULL COMMENT '实际出库加权均价'");
        addColumnIfNotExists("biz_eam_consumable_claim_item", "amount",
                "DECIMAL(18,2) DEFAULT NULL COMMENT '出库成本金额'");
        addColumnIfNotExists("biz_eam_consumable_claim_item", "returned_qty",
                "INT NOT NULL DEFAULT 0 COMMENT '已退料数量'");
    }

    /** 新建入库/退料/调整/调拨单据表（与 186 SQL 结构一致） */
    private void createConsumableDocTables() {
        jdbcTemplate.execute(
                "CREATE TABLE IF NOT EXISTS biz_eam_consumable_inbound ("
                + "id BIGINT AUTO_INCREMENT PRIMARY KEY, "
                + "inbound_no VARCHAR(40) NOT NULL COMMENT '入库单号', "
                + "inbound_type VARCHAR(20) NOT NULL DEFAULT 'in_manual' COMMENT 'in_purchase/in_manual/in_init', "
                + "company_brand BIGINT DEFAULT NULL COMMENT '所属品牌ID', "
                + "purchase_company_id BIGINT DEFAULT NULL COMMENT '购买公司ID', "
                + "purchase_company VARCHAR(100) DEFAULT '' COMMENT '购买公司名称快照', "
                + "supplier_id BIGINT DEFAULT NULL COMMENT '供应商ID', "
                + "supplier_name VARCHAR(128) DEFAULT '' COMMENT '供应商名称快照', "
                + "po_id BIGINT DEFAULT NULL COMMENT '采购订单ID', "
                + "po_no VARCHAR(40) DEFAULT '' COMMENT '采购订单号快照', "
                + "source_type VARCHAR(20) DEFAULT '' COMMENT '来源类型', "
                + "source_id BIGINT DEFAULT NULL COMMENT '来源单据ID', "
                + "biz_date DATE DEFAULT NULL COMMENT '入库日期', "
                + "remark VARCHAR(500) DEFAULT '', "
                + "created_by VARCHAR(64) DEFAULT '', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, "
                + "updated_by VARCHAR(64) DEFAULT '', updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, "
                + "deleted TINYINT NOT NULL DEFAULT 0, "
                + "UNIQUE KEY uk_inbound_no (inbound_no), KEY idx_po (po_id), KEY idx_created (created_at)"
                + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='耗材入库单'");

        jdbcTemplate.execute(
                "CREATE TABLE IF NOT EXISTS biz_eam_consumable_inbound_item ("
                + "id BIGINT AUTO_INCREMENT PRIMARY KEY, "
                + "inbound_id BIGINT NOT NULL COMMENT '入库单ID', "
                + "item_id BIGINT NOT NULL COMMENT '耗材ID', "
                + "item_code VARCHAR(32) DEFAULT '', item_name VARCHAR(128) DEFAULT '', "
                + "spec VARCHAR(200) DEFAULT '', unit VARCHAR(32) DEFAULT '', "
                + "location_id BIGINT NOT NULL DEFAULT 0, location_name VARCHAR(200) DEFAULT '', "
                + "qty INT NOT NULL COMMENT '入库数量', "
                + "unit_price DECIMAL(16,6) DEFAULT NULL COMMENT '实际入库单价', "
                + "amount DECIMAL(18,2) DEFAULT NULL COMMENT '入库成本金额', "
                + "source_line_id BIGINT DEFAULT NULL COMMENT '来源验收明细ID（幂等）', "
                + "KEY idx_inbound (inbound_id), KEY idx_item (item_id)"
                + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='耗材入库单明细'");

        jdbcTemplate.execute(
                "CREATE TABLE IF NOT EXISTS biz_eam_consumable_return ("
                + "id BIGINT AUTO_INCREMENT PRIMARY KEY, "
                + "return_no VARCHAR(40) NOT NULL COMMENT '退料单号', "
                + "claim_id BIGINT DEFAULT NULL, claim_item_id BIGINT DEFAULT NULL, "
                + "item_id BIGINT NOT NULL, location_id BIGINT NOT NULL DEFAULT 0, location_name VARCHAR(200) DEFAULT '', "
                + "qty INT NOT NULL, unit_cost DECIMAL(16,6) DEFAULT NULL, amount DECIMAL(18,2) DEFAULT NULL, "
                + "applicant_id BIGINT DEFAULT NULL, applicant_name VARCHAR(64) DEFAULT '', "
                + "department_id BIGINT DEFAULT NULL, department VARCHAR(100) DEFAULT '', "
                + "reason VARCHAR(500) DEFAULT '', operator VARCHAR(64) DEFAULT '', "
                + "created_by VARCHAR(64) DEFAULT '', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, "
                + "deleted TINYINT NOT NULL DEFAULT 0, "
                + "UNIQUE KEY uk_return_no (return_no), KEY idx_claim_item (claim_item_id), KEY idx_item (item_id)"
                + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='耗材退料单'");

        jdbcTemplate.execute(
                "CREATE TABLE IF NOT EXISTS biz_eam_consumable_adjust ("
                + "id BIGINT AUTO_INCREMENT PRIMARY KEY, "
                + "adjust_no VARCHAR(40) NOT NULL COMMENT '调整单号', "
                + "item_id BIGINT NOT NULL, location_id BIGINT NOT NULL DEFAULT 0, location_name VARCHAR(200) DEFAULT '', "
                + "direction VARCHAR(10) NOT NULL COMMENT 'in=盘盈/out=盘亏', qty INT NOT NULL, "
                + "unit_cost DECIMAL(16,6) DEFAULT NULL, amount DECIMAL(18,2) DEFAULT NULL, "
                + "reason VARCHAR(500) NOT NULL DEFAULT '', operator VARCHAR(64) DEFAULT '', "
                + "created_by VARCHAR(64) DEFAULT '', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, "
                + "deleted TINYINT NOT NULL DEFAULT 0, "
                + "UNIQUE KEY uk_adjust_no (adjust_no), KEY idx_item (item_id)"
                + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='耗材库存调整单'");

        jdbcTemplate.execute(
                "CREATE TABLE IF NOT EXISTS biz_eam_consumable_transfer ("
                + "id BIGINT AUTO_INCREMENT PRIMARY KEY, "
                + "transfer_no VARCHAR(40) NOT NULL COMMENT '调拨单号', "
                + "item_id BIGINT NOT NULL, from_location_id BIGINT NOT NULL DEFAULT 0, from_location_name VARCHAR(200) DEFAULT '', "
                + "to_location_id BIGINT NOT NULL DEFAULT 0, to_location_name VARCHAR(200) DEFAULT '', "
                + "qty INT NOT NULL, unit_cost DECIMAL(16,6) DEFAULT NULL, amount DECIMAL(18,2) DEFAULT NULL, "
                + "operator VARCHAR(64) DEFAULT '', created_by VARCHAR(64) DEFAULT '', "
                + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP, deleted TINYINT NOT NULL DEFAULT 0, "
                + "UNIQUE KEY uk_transfer_no (transfer_no), KEY idx_item (item_id)"
                + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='耗材库存调拨单'");
        log.info("耗材单据表（入库/入库明细/退料/调整/调拨）创建完成");
    }

    /** 购买公司字典表 */
    private void createPurchaseCompanyDict() {
        jdbcTemplate.execute(
                "CREATE TABLE IF NOT EXISTS sys_purchase_company ("
                + "id BIGINT AUTO_INCREMENT PRIMARY KEY, "
                + "code VARCHAR(32) NOT NULL COMMENT '公司稳定编码', "
                + "name VARCHAR(128) NOT NULL COMMENT '公司全称', "
                + "short_name VARCHAR(64) DEFAULT '' COMMENT '公司简称', "
                + "status TINYINT NOT NULL DEFAULT 1 COMMENT '1=启用 0=停用', "
                + "sort_order INT NOT NULL DEFAULT 0, "
                + "remark VARCHAR(500) DEFAULT '', "
                + "created_by VARCHAR(64) DEFAULT '', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, "
                + "updated_by VARCHAR(64) DEFAULT '', updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, "
                + "deleted TINYINT NOT NULL DEFAULT 0, "
                + "UNIQUE KEY uk_purchase_company_code (code)"
                + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='购买公司字典'");
    }

    /** 购买公司种子（与资产/员工现有硬编码公司一致，幂等按 code） */
    private void seedPurchaseCompanyData() {
        String[][] companies = {
                {"SFCO", "珠海閃蜂科技有限公司", "閃蜂", "1"},
                {"MFCO", "珠海麥峰科技有限公司", "mFood", "2"}
        };
        for (String[] c : companies) {
            jdbcTemplate.update(
                    "INSERT IGNORE INTO sys_purchase_company (code, name, short_name, status, sort_order, updated_by, deleted) "
                            + "VALUES (?, ?, ?, 1, ?, 'system', 0)",
                    c[0], c[1], c[2], Integer.parseInt(c[3]));
        }
        log.info("购买公司字典种子写入完成");
    }

    /** 新增耗材入库 / 消耗统计菜单，并修正子菜单排序 */
    private void seedConsumableDocMenus() {
        Long groupId = queryLong("SELECT id FROM sys_menu WHERE menu_key = 'consumable-ops' AND deleted = 0 LIMIT 1");
        if (groupId == null) {
            log.warn("未找到 consumable-ops 分组，跳过耗材单据菜单创建");
            return;
        }
        ensureMenu(groupId, "consumable-inbound", "耗材入庫", "/consumable-inbound", "ConsumableInbound",
                "ImportOutlined", 3, "[\"view\",\"create\",\"edit\"]");
        ensureMenu(groupId, "consumable-report", "消耗統計", "/consumable-report", "ConsumableReport",
                "FundOutlined", 8, "[\"view\"]");
        // 子菜单排序（入库紧随档案，领用/库存/流水/预警顺延）
        jdbcTemplate.update("UPDATE sys_menu SET sort_order = 4 WHERE menu_key = 'consumable-claim' AND deleted = 0");
        jdbcTemplate.update("UPDATE sys_menu SET sort_order = 5 WHERE menu_key = 'consumable-stock' AND deleted = 0");
        jdbcTemplate.update("UPDATE sys_menu SET sort_order = 6 WHERE menu_key = 'consumable-stock-txn' AND deleted = 0");
        jdbcTemplate.update("UPDATE sys_menu SET sort_order = 7 WHERE menu_key = 'consumable-alert' AND deleted = 0");
        // 英文名
        jdbcTemplate.update("UPDATE sys_menu SET name_en = 'Consumable Inbound' "
                + "WHERE menu_key = 'consumable-inbound' AND deleted = 0 AND (name_en IS NULL OR name_en = '')");
        jdbcTemplate.update("UPDATE sys_menu SET name_en = 'Consumption Report' "
                + "WHERE menu_key = 'consumable-report' AND deleted = 0 AND (name_en IS NULL OR name_en = '')");
        grantAdminMenu("consumable-inbound", "[\"view\",\"create\",\"edit\"]");
        grantAdminMenu("consumable-report", "[\"view\"]");
        log.info("耗材入库 / 消耗统计菜单创建完成");
    }

    /** admin 角色授权某菜单（INSERT IGNORE + 自愈 actions） */
    private void grantAdminMenu(String menuKey, String actionsJson) {
        Long adminRoleId = queryLong("SELECT id FROM sys_role WHERE code = 'admin' LIMIT 1");
        if (adminRoleId == null) return;
        jdbcTemplate.update(
                "INSERT IGNORE INTO sys_role_menu (role_id, menu_id, actions) "
                        + "SELECT ?, m.id, ? FROM sys_menu m WHERE m.menu_key = ? AND m.deleted = 0",
                adminRoleId, actionsJson, menuKey);
        jdbcTemplate.update(
                "UPDATE sys_role_menu rm JOIN sys_menu m ON rm.menu_id = m.id "
                        + "SET rm.actions = ? WHERE rm.role_id = ? AND m.menu_key = ? AND m.deleted = 0 "
                        + "AND (rm.actions IS NULL OR rm.actions = '')",
                actionsJson, adminRoleId, menuKey);
    }

    /** 入库/退料/调整/调拨单号规则种子 */
    private void seedConsumableDocSeqRules() {
        int affected = 0;
        affected += seedRule("eam_consumable_inbound", "耗材入庫單號", "物資管理-耗材入庫", "HCRK", "YYYYMMDD", 4, 0,
                "{prefix} + YYYYMMDD + {n}位自增序號");
        affected += seedRule("eam_consumable_return", "耗材退料單號", "物資管理-耗材領用", "HCTL", "YYYYMMDD", 4, 0,
                "{prefix} + YYYYMMDD + {n}位自增序號");
        affected += seedRule("eam_consumable_adjust", "耗材調整單號", "物資管理-耗材庫存", "HCTZ", "YYYYMMDD", 4, 0,
                "{prefix} + YYYYMMDD + {n}位自增序號");
        affected += seedRule("eam_consumable_transfer", "耗材調撥單號", "物資管理-耗材庫存", "HCDB", "YYYYMMDD", 4, 0,
                "{prefix} + YYYYMMDD + {n}位自增序號");
        if (affected > 0) {
            bizSeqService.refreshRules();
            log.info("已写入耗材单据编号规则种子（HCRK/HCTL/HCTZ/HCDB）");
        }
    }
}
