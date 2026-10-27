package com.mftb.admin.config;

import com.mftb.admin.constant.HrCertificateConstants;
import com.mftb.admin.constant.HrEssConstants;
import com.mftb.admin.service.PermissionService;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 證明開具（ESS 员工自助）初始化器：
 * <p>
 * {@code hr:certificate-schema:v1.0} —— 建 hr_certificate_request 表，种子证明类型字典
 * {@code CERT_TYPE}、申请单编号规则 {@code hr_certificate_request}(ZM) 与 OA 流程定义
 * {@code hr_certificate}；
 * {@code hr:certificate-menu:v1.0} —— 在一级域 ess-center 下新增 {@code ess-certificate}
 * 菜单并授权 admin 与 employee_self_service（ESS 的系统准入 hr 已由 hr:ess-menu:v1.1 建立）。
 * <p>
 * 遵循迁移治理：{@code applyOnce(versionKey, task, verify)}，任务与后置校验都成功才记版本；
 * 失败不吞异常（写失败审计后下次启动重试）。参考 SQL: backend/sql/201_hr_certificate.sql
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class HrCertificateSchemaInitializer implements CommandLineRunner {

    private static final String VERSION_SCHEMA = "hr:certificate-schema:v1.0";
    private static final String VERSION_MENU = "hr:certificate-menu:v1.0";

    private static final String ESS_ROLE_CODE = "employee_self_service";

    private static final String CREATE_SQL =
            "CREATE TABLE IF NOT EXISTS hr_certificate_request ("
                    + "id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID', "
                    + "req_no VARCHAR(32) NOT NULL COMMENT '证明申请单编号(ZM+YYYYMMDD+4位序号)', "
                    + "user_id BIGINT NOT NULL COMMENT '申请人 sys_user.id', "
                    + "emp_name VARCHAR(64) NOT NULL COMMENT '申请人姓名快照', "
                    + "emp_no VARCHAR(32) DEFAULT NULL COMMENT '申请人工号快照', "
                    + "dept_name VARCHAR(128) DEFAULT NULL COMMENT '部门名称快照', "
                    + "cert_type VARCHAR(32) NOT NULL COMMENT '证明类型(HR字典 CERT_TYPE code)', "
                    + "purpose VARCHAR(200) NOT NULL COMMENT '证明用途', "
                    + "recipient VARCHAR(200) DEFAULT NULL COMMENT '证明抬头(致XX单位)', "
                    + "language VARCHAR(8) NOT NULL DEFAULT 'ZH' COMMENT '语种: ZH/EN/BOTH', "
                    + "copies INT NOT NULL DEFAULT 1 COMMENT '需要份数', "
                    + "expect_date DATE DEFAULT NULL COMMENT '期望取得日期', "
                    + "remark VARCHAR(500) DEFAULT NULL COMMENT '补充说明(申请人填写)', "
                    + "status VARCHAR(16) NOT NULL DEFAULT 'draft' COMMENT '状态: draft/pending/approved/rejected/cancelled/completed', "
                    + "flow_no VARCHAR(64) DEFAULT NULL COMMENT '关联OA流程编号', "
                    + "result_remark VARCHAR(500) DEFAULT NULL COMMENT '办理结果(审批通过后写入领取指引)', "
                    + "created_by VARCHAR(64) DEFAULT NULL COMMENT '创建人', "
                    + "updated_by VARCHAR(64) DEFAULT NULL COMMENT '最后更新人', "
                    + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间', "
                    + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间', "
                    + "deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除', "
                    + "UNIQUE KEY uk_certificate_req_no (req_no), "
                    + "KEY idx_certificate_user (user_id, status), "
                    + "KEY idx_certificate_flow (flow_no)"
                    + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR证明开具申请单'";

    /** 证明类型字典种子：{code, 名称, 英文名, 排序} */
    private static final String[][] CERT_TYPES = {
            {"EMPLOYMENT", "在職證明", "Employment Certificate", "1"},
            {"INCOME", "收入證明", "Income Certificate", "2"},
            {"RESIGNATION", "離職證明", "Separation Certificate", "3"},
            {"OTHER", "其他證明", "Other Certificate", "4"},
    };

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;
    private final PermissionService permissionService;

    @Override
    public void run(String... args) {
        try {
            versionTracker.applyOnce(VERSION_SCHEMA, this::migrateSchema, this::verifySchema);
        } catch (Exception e) {
            log.error("HR 證明開具建表/種子失敗: {}", e.getMessage(), e);
        }
        try {
            versionTracker.applyOnce(VERSION_MENU, this::migrateMenu, this::verifyMenu);
        } catch (Exception e) {
            log.error("HR 證明開具菜單初始化失敗: {}", e.getMessage(), e);
        }
    }

    // ==================== 表结构与种子 ====================

    private void migrateSchema() {
        jdbcTemplate.execute(CREATE_SQL);
        String dictSql = "INSERT IGNORE INTO sys_hr_dict "
                + "(dict_type, code, name, name_en, sort_order, status, created_by, updated_by) "
                + "VALUES ('CERT_TYPE', ?, ?, ?, ?, 1, 'SYSTEM', 'SYSTEM')";
        for (String[] t : CERT_TYPES) {
            jdbcTemplate.update(dictSql, t[0], t[1], t[2], Integer.parseInt(t[3]));
        }
        jdbcTemplate.update(
                "INSERT IGNORE INTO sys_biz_seq_rule "
                        + "(rule_key, rule_name, biz_menu, prefix, date_format, seq_length, seq_start, status, remark) "
                        + "VALUES ('hr_certificate_request', '證明申請單編號', '集團人事', 'ZM', 'YYYYMMDD', 4, 1, 1, ?)",
                "{prefix} + YYYYMMDD + {n}位自增序號");
        // 流程定义挂 oa_general 默认节点，可在「流程配置」单独编排审批链
        jdbcTemplate.update(
                "INSERT IGNORE INTO biz_oa_process "
                        + "(process_code, process_name, category, icon, description, workflow_type, sort_order, status) "
                        + "VALUES ('hr_certificate', '證明開具', 'hr', 'FileProtectOutlined', "
                        + "'員工自助申請在職/收入等證明，審批通過後由人事線下開具', 'oa_general', 16, 1)");
    }

    private void verifySchema() {
        Integer table = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.TABLES "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_certificate_request'",
                Integer.class);
        if (table == null || table == 0) {
            throw new IllegalStateException("hr_certificate_request 表未就绪");
        }
        Integer types = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_hr_dict WHERE dict_type = 'CERT_TYPE' AND deleted = 0", Integer.class);
        if (types == null || types < CERT_TYPES.length) {
            throw new IllegalStateException("CERT_TYPE 字典种子未就绪");
        }
        for (String check : new String[]{
                "SELECT COUNT(*) FROM sys_biz_seq_rule WHERE rule_key = 'hr_certificate_request'",
                "SELECT COUNT(*) FROM biz_oa_process WHERE process_code = 'hr_certificate'"}) {
            Integer n = jdbcTemplate.queryForObject(check, Integer.class);
            if (n == null || n == 0) {
                throw new IllegalStateException("证明开具种子未就绪: " + check);
            }
        }
    }

    // ==================== 菜单 ====================

    private void migrateMenu() {
        Long parentId = queryMenuId(HrEssConstants.MENU_DOMAIN);
        if (parentId == null) {
            throw new IllegalStateException("父级菜单 ess-center 不存在，无法挂载证明开具菜单");
        }
        if (queryMenuId(HrCertificateConstants.MENU) == null) {
            jdbcTemplate.update("DELETE FROM sys_menu WHERE menu_key = ? AND deleted = 1", HrCertificateConstants.MENU);
            jdbcTemplate.update(
                    "INSERT INTO sys_menu (parent_id, menu_key, name, icon, type, sort_order, status, deleted, system_code) "
                            + "VALUES (?, ?, '證明開具', 'FileProtectOutlined', 2, 4, 1, 0, ?)",
                    parentId, HrCertificateConstants.MENU, systemCodeOf(parentId));
            jdbcTemplate.update("UPDATE sys_menu SET name_en = 'Certificates' WHERE menu_key = ?",
                    HrCertificateConstants.MENU);
            log.info("已創建 ESS 證明開具菜單: {}", HrCertificateConstants.MENU);
        }
        grant("admin", "[\"view\",\"create\",\"edit\",\"delete\",\"export\"]");
        grant(ESS_ROLE_CODE, "[\"view\",\"create\",\"edit\",\"delete\"]");
        permissionService.evictAll();
    }

    /** 子菜单沿用父域门户归属，否则会被系统导航剪枝丢弃 */
    private String systemCodeOf(Long menuId) {
        return jdbcTemplate.queryForList(
                        "SELECT system_code FROM sys_menu WHERE id = ?", String.class, menuId)
                .stream().findFirst().orElse("hr");
    }

    /** 两步式授权：INSERT...SELECT + ON DUPLICATE 在 MySQL 8 会因同名列报 1052 歧义 */
    private void grant(String roleCode, String actions) {
        Long roleId = jdbcTemplate.queryForList(
                        "SELECT id FROM sys_role WHERE code = ? LIMIT 1", Long.class, roleCode)
                .stream().findFirst().orElse(null);
        Long menuId = queryMenuId(HrCertificateConstants.MENU);
        if (roleId == null || menuId == null) {
            return;
        }
        jdbcTemplate.update("INSERT IGNORE INTO sys_role_menu (role_id, menu_id, actions) VALUES (?, ?, ?)",
                roleId, menuId, actions);
        jdbcTemplate.update("UPDATE sys_role_menu SET actions = ? WHERE role_id = ? AND menu_id = ? "
                        + "AND (actions IS NULL OR actions = '' OR actions = '[]')",
                actions, roleId, menuId);
    }

    private void verifyMenu() {
        Integer exists = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_menu WHERE menu_key = ? AND deleted = 0",
                Integer.class, HrCertificateConstants.MENU);
        if (exists == null || exists == 0) {
            throw new IllegalStateException("菜單未就緒: " + HrCertificateConstants.MENU);
        }
    }

    private Long queryMenuId(String menuKey) {
        return jdbcTemplate.queryForList(
                        "SELECT id FROM sys_menu WHERE menu_key = ? AND deleted = 0 LIMIT 1", Long.class, menuKey)
                .stream().findFirst().orElse(null);
    }
}
