package com.mftb.admin.config;

import com.mftb.admin.constant.HrLeaveConstants;
import com.mftb.admin.service.PermissionService;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * HR 假期域初始化器（P0 假期额度 + 请假申请）：
 * <p>
 * {@code hr:leave-schema:v1.0} —— 建 hr_leave_balance / hr_leave_request 两张表，
 *       种子假期类型字典 {@code LEAVE_TYPE} 与请假单编号规则 {@code hr_leave_request}(LQ)。
 * 假期相关菜单待前端页面就绪后由后续迁移创建（避免出现点开无页面的死菜单）。
 * 均遵循迁移治理：{@code applyOnce(versionKey, task, verify)}，建表/种子与后置校验都成功才记版本，
 * 失败不吞异常（写失败审计后下次启动重试）。表结构另登记 {@code ContractRegistry} 契约启动自愈。
 * 参考 SQL: backend/sql/197_hr_leave.sql
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class HrLeaveSchemaInitializer implements CommandLineRunner {

    private static final String VERSION_SCHEMA = "hr:leave-schema:v1.0";
    private static final String VERSION_MENU = "hr:leave-menu:v1.0";

    private static final String CREATE_BALANCE_SQL =
            "CREATE TABLE IF NOT EXISTS hr_leave_balance ("
                    + "id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID', "
                    + "user_id BIGINT NOT NULL COMMENT '关联 sys_user.id', "
                    + "emp_no VARCHAR(32) DEFAULT NULL COMMENT '员工工号快照', "
                    + "year INT NOT NULL COMMENT '额度过期年度(自然年)', "
                    + "leave_type VARCHAR(32) NOT NULL COMMENT '假期类型(HR字典 LEAVE_TYPE 的 code)', "
                    + "total_days DECIMAL(5,1) NOT NULL DEFAULT 0 COMMENT '年度授予天数', "
                    + "carried_days DECIMAL(5,1) NOT NULL DEFAULT 0 COMMENT '上年结转天数', "
                    + "used_days DECIMAL(5,1) NOT NULL DEFAULT 0 COMMENT '已使用天数(审批通过的请假累计)', "
                    + "remark VARCHAR(255) DEFAULT NULL COMMENT '备注', "
                    + "created_by VARCHAR(64) DEFAULT NULL COMMENT '创建人', "
                    + "updated_by VARCHAR(64) DEFAULT NULL COMMENT '最后更新人', "
                    + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间', "
                    + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间', "
                    + "deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除', "
                    + "UNIQUE KEY uk_leave_balance_user_year_type (user_id, year, leave_type), "
                    + "KEY idx_leave_balance_year_type (year, leave_type)"
                    + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR假期额度台账'";

    private static final String CREATE_REQUEST_SQL =
            "CREATE TABLE IF NOT EXISTS hr_leave_request ("
                    + "id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID', "
                    + "req_no VARCHAR(32) NOT NULL COMMENT '请假单编号(LQ+YYYYMMDD+4位序号)', "
                    + "user_id BIGINT NOT NULL COMMENT '请假人 sys_user.id', "
                    + "emp_name VARCHAR(64) NOT NULL COMMENT '请假人姓名快照', "
                    + "emp_no VARCHAR(32) DEFAULT NULL COMMENT '请假人工号快照', "
                    + "dept_name VARCHAR(128) DEFAULT NULL COMMENT '部门名称快照', "
                    + "year INT NOT NULL COMMENT '所属年度(按开始日期)', "
                    + "leave_type VARCHAR(32) NOT NULL COMMENT '假期类型(HR字典 LEAVE_TYPE code)', "
                    + "start_date DATE NOT NULL COMMENT '请假开始日期', "
                    + "end_date DATE NOT NULL COMMENT '请假结束日期', "
                    + "days DECIMAL(4,1) NOT NULL COMMENT '请假天数(自然日,含首尾)', "
                    + "reason VARCHAR(512) DEFAULT NULL COMMENT '请假事由', "
                    + "status VARCHAR(16) NOT NULL DEFAULT 'draft' COMMENT '状态: draft/pending/approved/rejected/cancelled/completed', "
                    + "flow_no VARCHAR(64) DEFAULT NULL COMMENT '关联OA流程编号', "
                    + "remark VARCHAR(512) DEFAULT NULL COMMENT '备注/办理结果', "
                    + "created_by VARCHAR(64) DEFAULT NULL COMMENT '创建人', "
                    + "updated_by VARCHAR(64) DEFAULT NULL COMMENT '最后更新人', "
                    + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间', "
                    + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间', "
                    + "deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除', "
                    + "UNIQUE KEY uk_leave_request_req_no (req_no), "
                    + "KEY idx_leave_request_user (user_id, year), "
                    + "KEY idx_leave_request_status (status, leave_type), "
                    + "KEY idx_leave_request_flow (flow_no)"
                    + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR请假申请单据'";

    /** 假期类型字典种子：{code, 名称, 英文名, 排序} */
    private static final String[][] LEAVE_TYPES = {
            {"ANNUAL", "年假", "Annual Leave", "1"},
            {"PERSONAL", "事假", "Personal Leave", "2"},
            {"SICK", "病假", "Sick Leave", "3"},
            {"MARRIAGE", "婚假", "Marriage Leave", "4"},
            {"MATERNITY", "产假", "Maternity Leave", "5"},
            {"BEREAVEMENT", "丧假", "Bereavement Leave", "6"},
            {"COMPENSATORY", "调休", "Compensatory Leave", "7"},
    };

    /** 请假菜单：menuKey → {中文名, 图标, 英文名} */
    private static final String[][] MENUS = {
            {HrLeaveConstants.MENU_LEAVE, "請假管理", "CalendarOutlined", "Leave Requests"},
            {HrLeaveConstants.MENU_QUOTA, "假期額度", "HourglassOutlined", "Leave Balances"},
    };

    /** admin 角色默认全量动作 */
    private static final String ADMIN_ACTIONS = "[\"view\",\"create\",\"edit\",\"delete\",\"export\"]";

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;
    private final PermissionService permissionService;

    @Override
    public void run(String... args) {
        try {
            versionTracker.applyOnce(VERSION_SCHEMA, this::migrateSchema, this::verifySchema);
        } catch (Exception e) {
            log.error("HR 假期建表/種子失敗: {}", e.getMessage(), e);
        }
        try {
            versionTracker.applyOnce(VERSION_MENU, this::migrateMenus, this::verifyMenus);
        } catch (Exception e) {
            log.error("HR 假期菜單初始化失敗: {}", e.getMessage(), e);
        }
    }

    /**
     * 菜单迁移：在「員工檔案」分组下新增 請假管理 / 假期額度。
     * 与表迁移分开登记（MENU_SEED 阶段），因为菜单必须晚于 hr-profile 分组存在。
     */
    private void migrateMenus() {
        Long parentId = queryMenuId(HrLeaveConstants.MENU_PARENT);
        if (parentId == null) {
            parentId = queryMenuId("hr");
        }
        if (parentId == null) {
            throw new IllegalStateException("父级菜单 hr-profile / hr 均不存在，无法挂载假期菜单");
        }
        int sort = 2;
        for (String[] m : MENUS) {
            if (queryMenuId(m[0]) == null) {
                jdbcTemplate.update("DELETE FROM sys_menu WHERE menu_key = ? AND deleted = 1", m[0]);
                jdbcTemplate.update(
                        "INSERT INTO sys_menu (parent_id, menu_key, name, icon, type, sort_order, status, deleted) "
                                + "VALUES (?, ?, ?, ?, 2, ?, 1, 0)",
                        parentId, m[0], m[1], m[2], sort);
                jdbcTemplate.update("UPDATE sys_menu SET name_en = ? WHERE menu_key = ?", m[3], m[0]);
                log.info("已創建 HR 假期菜單: {}", m[0]);
            }
            sort++;
        }
        grantAdmin();
        // 菜单/授权落地后 bump revision，保证跨实例菜单快照与新页面入口同步生效
        permissionService.evictAll();
    }

    private void grantAdmin() {
        Long adminRoleId = jdbcTemplate.queryForList(
                "SELECT id FROM sys_role WHERE code = 'admin' LIMIT 1", Long.class)
                .stream().findFirst().orElse(null);
        if (adminRoleId == null) {
            return;
        }
        for (String[] m : MENUS) {
            // 不用 INSERT...SELECT + ON DUPLICATE：同名列在 MySQL 8 会报 1052 歧义，拆两步幂等
            jdbcTemplate.update(
                    "INSERT IGNORE INTO sys_role_menu (role_id, menu_id, actions) "
                            + "SELECT r.id, m.id, ? FROM sys_role r JOIN sys_menu m ON m.menu_key = ? AND m.deleted = 0 "
                            + "WHERE r.code = 'admin'", ADMIN_ACTIONS, m[0]);
            jdbcTemplate.update(
                    "UPDATE sys_role_menu rm JOIN sys_menu m ON rm.menu_id = m.id JOIN sys_role r ON r.id = rm.role_id "
                            + "SET rm.actions = ? WHERE r.code = 'admin' AND m.menu_key = ? AND m.deleted = 0 "
                            + "AND (rm.actions IS NULL OR rm.actions = '' OR rm.actions = '[]')",
                    ADMIN_ACTIONS, m[0]);
        }
    }

    private void verifyMenus() {
        for (String[] m : MENUS) {
            Integer exists = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM sys_menu WHERE menu_key = ? AND deleted = 0", Integer.class, m[0]);
            if (exists == null || exists == 0) {
                throw new IllegalStateException("菜單未就緒: " + m[0]);
            }
        }
    }

    private Long queryMenuId(String menuKey) {
        return jdbcTemplate.queryForList(
                        "SELECT id FROM sys_menu WHERE menu_key = ? AND deleted = 0 LIMIT 1", Long.class, menuKey)
                .stream().findFirst().orElse(null);
    }

    // ==================== 表结构与种子 ====================

    private void migrateSchema() {
        jdbcTemplate.execute(CREATE_BALANCE_SQL);
        jdbcTemplate.execute(CREATE_REQUEST_SQL);
        String dictSql = "INSERT IGNORE INTO sys_hr_dict "
                + "(dict_type, code, name, name_en, sort_order, status, created_by, updated_by) "
                + "VALUES ('LEAVE_TYPE', ?, ?, ?, ?, 1, 'SYSTEM', 'SYSTEM')";
        for (String[] t : LEAVE_TYPES) {
            jdbcTemplate.update(dictSql, t[0], t[1], t[2], Integer.parseInt(t[3]));
        }
        jdbcTemplate.update(
                "INSERT IGNORE INTO sys_biz_seq_rule "
                        + "(rule_key, rule_name, biz_menu, prefix, date_format, seq_length, seq_start, status, remark) "
                        + "VALUES ('hr_leave_request', '請假單編號', '集團人事', 'LQ', 'YYYYMMDD', 4, 1, 1, ?)",
                "{prefix} + YYYYMMDD + {n}位自增序號");
    }

    private void verifySchema() {
        for (String table : new String[]{"hr_leave_balance", "hr_leave_request"}) {
            Integer exists = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM information_schema.TABLES "
                            + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
                    Integer.class, table);
            if (exists == null || exists == 0) {
                throw new IllegalStateException(table + " 表未就绪");
            }
        }
        Integer types = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_hr_dict WHERE dict_type = 'LEAVE_TYPE' AND deleted = 0", Integer.class);
        if (types == null || types < LEAVE_TYPES.length) {
            throw new IllegalStateException("LEAVE_TYPE 字典种子未就绪");
        }
        Integer rule = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_biz_seq_rule WHERE rule_key = 'hr_leave_request'", Integer.class);
        if (rule == null || rule == 0) {
            throw new IllegalStateException("请假单编号规则种子未就绪");
        }
    }

}
