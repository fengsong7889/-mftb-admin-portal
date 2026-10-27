package com.mftb.admin.config;

import com.mftb.admin.constant.HrCertificateConstants;
import com.mftb.admin.constant.HrLeaveConstants;
import com.mftb.admin.service.PermissionService;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;


/**
 * 證明開具·人事开具台账迁移（P1 ESS 第二块）：
 * <p>
 * {@code hr:certificate-issue:v1.0} —— 为 hr_certificate_request 增加开具登记 4 列
 * （cert_no/issue_date/pickup_type/issued_by），新建人事侧台账菜单 hr-certificate
 * （挂 hr-profile 下，与請假管理/假期額度同级），并把历史「审批通过即 completed」的
 * 单据回退为 approved（待開具）—— 因为它们并没有真实证明编号，保留 completed 等于
 * 对外宣称一张不存在的证明。
 * <p>
 * MySQL 8 无 ADD COLUMN IF NOT EXISTS，逐列查 INFORMATION_SCHEMA 后再 ADD；
 * applyOnce 带后置校验，任务或校验失败都不记版本（下次启动重试），不吞异常。
 * 参考 SQL: backend/sql/201_hr_certificate.sql
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class HrCertificateIssueSchemaInitializer implements CommandLineRunner {

    private static final String VERSION = "hr:certificate-issue:v1.0";

    /** {列名, DDL 片段} */
    private static final String[][] COLUMNS = {
            {"cert_no", "VARCHAR(64) DEFAULT NULL COMMENT '证明编号(人事开具时登记)'"},
            {"issue_date", "DATE DEFAULT NULL COMMENT '开具日期'"},
            {"pickup_type", "VARCHAR(16) DEFAULT NULL COMMENT '领取方式: SELF/DELIVERY/ELECTRONIC'"},
            {"issued_by", "VARCHAR(64) DEFAULT NULL COMMENT '开具办理人'"},
    };

    private static final String ADMIN_ACTIONS = "[\"view\",\"create\",\"edit\",\"delete\",\"export\"]";
    private static final String HR_ACTIONS = "[\"view\",\"edit\"]";

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;
    private final PermissionService permissionService;

    @Override
    public void run(String... args) {
        try {
            versionTracker.applyOnce(VERSION, this::migrate, this::verify);
        } catch (Exception e) {
            log.error("HR 證明開具台賬遷移失敗: {}", e.getMessage(), e);
        }
    }

    private void migrate() {
        for (String[] col : COLUMNS) {
            if (columnExists(col[0])) {
                continue;
            }
            jdbcTemplate.update("ALTER TABLE hr_certificate_request ADD COLUMN " + col[0] + " " + col[1]);
            log.info("hr_certificate_request 已加列: {}", col[0]);
        }
        // 证明编号唯一性由服务层校验（历史数据可能含软删行，且 MySQL 唯一索引会连软删一起判），此处只加查询索引
        if (!indexExists("idx_certificate_cert_no")) {
            jdbcTemplate.execute("CREATE INDEX idx_certificate_cert_no ON hr_certificate_request (cert_no)");
        }
        backfillLegacyCompleted();
        createLedgerMenu();
        permissionService.evictAll();
    }

    /**
     * 旧语义回填：审批通过曾被直接当作 completed，但那些单据没有证明编号。
     * 回退为 approved（待開具）让人事仍能在台账上把流程走完，避免死数据。
     */
    private void backfillLegacyCompleted() {
        int reverted = jdbcTemplate.update(
                "UPDATE hr_certificate_request SET status = ?, result_remark = ?, updated_by = 'system' "
                        + "WHERE deleted = 0 AND status = ? AND (cert_no IS NULL OR cert_no = '')",
                HrCertificateConstants.STATUS_APPROVED, HrCertificateConstants.APPROVED_REMARK,
                HrCertificateConstants.STATUS_COMPLETED);
        if (reverted > 0) {
            log.info("證明開具语义回填：{} 条无编号的旧 completed 单据回退为待开具", reverted);
        }
    }

    private void createLedgerMenu() {
        Long parentId = queryMenuId(HrLeaveConstants.MENU_PARENT);
        if (parentId == null) {
            throw new IllegalStateException("父级菜单 hr-profile 不存在，无法挂载证明开具台账");
        }
        if (queryMenuId(HrCertificateConstants.MENU_LEDGER) == null) {
            jdbcTemplate.update("DELETE FROM sys_menu WHERE menu_key = ? AND deleted = 1",
                    HrCertificateConstants.MENU_LEDGER);
            jdbcTemplate.update(
                    "INSERT INTO sys_menu (parent_id, menu_key, name, icon, type, sort_order, status, deleted, system_code) "
                            + "VALUES (?, ?, '證明開具', 'PrinterOutlined', 2, 5, 1, 0, ?)",
                    parentId, HrCertificateConstants.MENU_LEDGER, systemCodeOf(parentId));
            jdbcTemplate.update("UPDATE sys_menu SET name_en = 'Certificate Issuance' WHERE menu_key = ?",
                    HrCertificateConstants.MENU_LEDGER);
            log.info("已創建人事證明開具台賬菜單: {}", HrCertificateConstants.MENU_LEDGER);
        }
        grantRole("admin", ADMIN_ACTIONS);
        // 人事审批角色默认可查看台账并登记开具；其余角色由权限中心按需授予
        grantRole("FIN_BIZ_APPROVER", HR_ACTIONS);
    }

    private String systemCodeOf(Long menuId) {
        return jdbcTemplate.queryForList("SELECT system_code FROM sys_menu WHERE id = ?", String.class, menuId)
                .stream().findFirst().orElse("hr");
    }

    /** 两步式授权（INSERT...SELECT + ON DUPLICATE 在 MySQL 8 会因同名列报 1052 歧义） */
    private void grantRole(String roleCode, String actions) {
        Long roleId = jdbcTemplate.queryForList(
                        "SELECT id FROM sys_role WHERE code = ? LIMIT 1", Long.class, roleCode)
                .stream().findFirst().orElse(null);
        Long menuId = queryMenuId(HrCertificateConstants.MENU_LEDGER);
        if (roleId == null || menuId == null) {
            return;
        }
        jdbcTemplate.update("INSERT IGNORE INTO sys_role_menu (role_id, menu_id, actions) VALUES (?, ?, ?)",
                roleId, menuId, actions);
        jdbcTemplate.update("UPDATE sys_role_menu SET actions = ? WHERE role_id = ? AND menu_id = ? "
                        + "AND (actions IS NULL OR actions = '' OR actions = '[]')", actions, roleId, menuId);
    }

    private void verify() {
        for (String[] col : COLUMNS) {
            if (!columnExists(col[0])) {
                throw new IllegalStateException("hr_certificate_request 列未就绪: " + col[0]);
            }
        }
        Integer menu = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_menu WHERE menu_key = ? AND deleted = 0",
                Integer.class, HrCertificateConstants.MENU_LEDGER);
        if (menu == null || menu == 0) {
            throw new IllegalStateException("人事台账菜单未就绪: " + HrCertificateConstants.MENU_LEDGER);
        }
        Integer stranded = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM hr_certificate_request WHERE deleted = 0 AND status = ? "
                        + "AND (cert_no IS NULL OR cert_no = '')",
                Integer.class, HrCertificateConstants.STATUS_COMPLETED);
        if (stranded != null && stranded > 0) {
            throw new IllegalStateException("仍有 " + stranded + " 条无编号的已开具单据未回退");
        }
    }

    private boolean columnExists(String column) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.COLUMNS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_certificate_request' "
                        + "AND COLUMN_NAME = ?", Integer.class, column);
        return count != null && count > 0;
    }

    private boolean indexExists(String index) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.STATISTICS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_certificate_request' "
                        + "AND INDEX_NAME = ?", Integer.class, index);
        return count != null && count > 0;
    }

    private Long queryMenuId(String menuKey) {
        return jdbcTemplate.queryForList(
                        "SELECT id FROM sys_menu WHERE menu_key = ? AND deleted = 0 LIMIT 1", Long.class, menuKey)
                .stream().findFirst().orElse(null);
    }
}
