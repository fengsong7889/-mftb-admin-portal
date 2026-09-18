package com.mftb.admin.config;

import com.mftb.admin.util.BizSeqService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

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

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;
    private final BizSeqService bizSeqService;

    @Override
    public void run(String... args) {
        versionTracker.applyOnce(V_CONSUMABLE_SCHEMA, this::migrate);
        // 每次启动均修正排序（applyOnce 仅首次执行 migrate，后续启动需独立 UPDATE）
        jdbcTemplate.update("UPDATE sys_menu SET sort_order = 4 WHERE menu_key = 'consumable-ops' AND deleted = 0 AND sort_order != 4");
    }

    private void migrate() {
        createTables();
        seedMenus();
        seedSeqRules();
        log.info("耗材管理（消耗品）初始化完成：建表 + 菜单 + 编号规则");
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
        Long adminRoleId = queryLong("SELECT id FROM sys_role WHERE code = 'admin' LIMIT 1");
        if (adminRoleId != null) {
            String[] keys = {"consumable-ops", "consumable-dashboard", "consumable-item",
                    "consumable-claim", "consumable-stock", "consumable-alert"};
            for (String mk : keys) {
                jdbcTemplate.update(
                        "INSERT IGNORE INTO sys_role_menu (role_id, menu_id) "
                                + "SELECT ?, m.id FROM sys_menu m WHERE m.menu_key = ? AND m.deleted = 0",
                        adminRoleId, mk);
            }
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
}
