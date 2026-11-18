/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.config;

import com.mftb.admin.constant.CpmConstants;
import com.mftb.admin.constant.SystemCode;
import com.mftb.admin.service.PermissionService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 持續績效（cpm）使用侧全员基线授权：让普通员工进得了系统、记得了自己的工作。
 *
 * <p>为什么必须做：菜单种子（{@code cpm:menu:v1.0}）只把五个菜单授给内置 admin 角色，
 * 而本系统的主体是全员——没有基线授权时，员工点开门户卡片就是 403/空白。
 * 做法与 {@code MeetingAccessGrantInitializer}/{@code RdmAccessGrantInitializer} 同法：
 * 授到<b>所有启用角色 + 所有有效部门</b>，而不是只授 {@code employee_self_service} 基底角色
 * （存量员工多数没绑功能角色，他们的权限来自部门授权那条线，只授基底角色等于只有新人能用）。
 *
 * <p><b>只铺使用侧两张</b>：{@code cpm-my} / {@code cpm-report}。治理侧
 * （{@code cpm-team}/{@code cpm-template}/{@code cpm-rule}）一律不自动授——
 * 团队汇报是跨人可见性、模板影响全员词表、规则决定全公司催办，必须由管理员在
 * 「授權中心 · 功能授權」按角色显式勾选。
 *
 * <p><b>使用侧为什么敢给 edit + ai_cpm</b>：写入口都有服务端资源级守卫——
 * 条目/汇报的读写一律硬约束 user_id=登录人（与 ESS 同法），ai_cpm 走 AiSceneService
 * 的场景就绪评估（默认拒绝）。多授不会让员工碰到别人的数据，只会让他记得了自己的活。
 *
 * <p><b>不扩权、只补空</b>：已存在且非空的授权集一律不动；行不存在时补整行基线（误删自愈）。
 * 基线菜单被退役时跳过不阻断启动（真实事故先例见 MeetingAccessGrantInitializer 注释）。
 *
 * <p><b>启动顺序</b>：取 29，必须晚于 {@code CpmSchemaMigrationInitializer(@Order 26)}
 * ——菜单行没落地就授权等于往不存在的 menu_id 写行；并早于
 * {@code PermissionAnnotationValidator(@Order 30)}。
 *
 * <p>版本键 {@code cpm:access-grant:v1.0}；与其他基线初始化器一样每次启动重放自愈。
 */
@Slf4j
@Component
@Order(29)
@RequiredArgsConstructor
public class CpmAccessGrantInitializer implements CommandLineRunner {

    static final String VERSION_KEY = "cpm:access-grant:v1.0";

    private static final String SYSTEM_CODE = SystemCode.CPM.code();

    /** 全员基线菜单：menu_key → 动作集（仅使用侧两张） */
    private static final Map<String, String> BASELINE_MENUS = new LinkedHashMap<>();

    static {
        BASELINE_MENUS.put(CpmConstants.MENU_MY, CpmConstants.ACTIONS_USAGE);
        BASELINE_MENUS.put(CpmConstants.MENU_REPORT, CpmConstants.ACTIONS_USAGE);
    }

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;
    private final PermissionService permissionService;

    @Override
    public void run(String... args) {
        // 版本已记录时仍每次启动重放：新增角色/新增部门/授权中心整行误删都靠这一步自愈
        if (!versionTracker.applyOnce(VERSION_KEY, this::migrate, this::verify)) {
            migrate();
        }
    }

    private void migrate() {
        Map<String, Long> menuIds = resolveActiveBaselineMenus();
        if (menuIds.isEmpty()) {
            log.warn("CPM 使用側基線菜單均已退役，跳過本次基線授權: baseline={}", BASELINE_MENUS.keySet());
            return;
        }

        List<Long> roleIds = jdbcTemplate.queryForList(
                "SELECT id FROM sys_role WHERE deleted = 0 AND status = 1", Long.class);
        List<Long> deptIds = jdbcTemplate.queryForList(
                "SELECT id FROM sys_department WHERE deleted = 0 AND status = 1", Long.class);
        if (roleIds.isEmpty() && deptIds.isEmpty()) {
            log.warn("無任何啟用角色與有效部門，跳過 CPM 基線授權");
            return;
        }

        int granted = 0;
        int filled = 0;
        for (Long roleId : roleIds) {
            granted += grantTargets("sys_role_menu", "role_id", roleId, menuIds);
            filled += fillBlankActions("sys_role_menu", "role_id", roleId, menuIds);
            // 系统准入与菜单授权分两次写：INSERT IGNORE 只在缺行时补，
            // 管理员关掉整个系统的准入不会被重放顶回去（那是有意的停用动作）
            jdbcTemplate.update("INSERT IGNORE INTO sys_role_system (role_id, system_code) VALUES (?, ?)",
                    roleId, SYSTEM_CODE);
        }
        for (Long deptId : deptIds) {
            granted += grantTargets("sys_department_menu", "dept_id", deptId, menuIds);
            filled += fillBlankActions("sys_department_menu", "dept_id", deptId, menuIds);
            jdbcTemplate.update("INSERT IGNORE INTO sys_department_system (dept_id, system_code) VALUES (?, ?)",
                    deptId, SYSTEM_CODE);
        }
        permissionService.evictAll();
        log.info("CPM 使用側基線授權完成: roles={}, departments={}, 新建={} 條, 補空動作={} 條, menus={}",
                roleIds.size(), deptIds.size(), granted, filled, BASELINE_MENUS.keySet());
    }

    /**
     * 取基线中「当前仍然启用」的菜单：退役跳过并留日志，真缺行才 fail-closed。
     * <p>区分口径与 MeetingAccessGrantInitializer 完全一致：行存在但 deleted=1/status=0
     * 是管理员一次有意的治理动作，跳过即可；查无此行才是种子未落地。
     */
    private Map<String, Long> resolveActiveBaselineMenus() {
        Map<String, Long> active = new LinkedHashMap<>();
        for (String menuKey : BASELINE_MENUS.keySet()) {
            List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                    "SELECT id, deleted, status FROM sys_menu WHERE menu_key = ? LIMIT 1", menuKey);
            if (rows.isEmpty()) {
                throw new IllegalStateException("CPM 菜單未就緒，無法授權: " + menuKey);
            }
            Map<String, Object> row = rows.get(0);
            Object deleted = row.get("deleted");
            Object status = row.get("status");
            boolean retired = (deleted instanceof Number deletedFlag && deletedFlag.intValue() != 0)
                    || (status instanceof Number statusFlag && statusFlag.intValue() == 0);
            if (retired) {
                log.info("CPM 基線菜單已退役，跳過授權: menuKey={}, deleted={}, status={}",
                        menuKey, deleted, status);
                continue;
            }
            active.put(menuKey, ((Number) row.get("id")).longValue());
        }
        return active;
    }

    private int grantTargets(String table, String idColumn, long targetId, Map<String, Long> menuIds) {
        int granted = 0;
        for (Map.Entry<String, Long> entry : menuIds.entrySet()) {
            Integer exists = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM " + table + " WHERE " + idColumn + " = ? AND menu_id = ?",
                    Integer.class, targetId, entry.getValue());
            if (exists != null && exists == 0) {
                jdbcTemplate.update("INSERT INTO " + table + " (" + idColumn + ", menu_id, actions) VALUES (?, ?, ?)",
                        targetId, entry.getValue(), BASELINE_MENUS.get(entry.getKey()));
                granted++;
            }
        }
        return granted;
    }

    /** 动作集为空的授权行填基线默认值；非空一律不动（那可能是管理员主动收窄，扩回就是静默扩权） */
    private int fillBlankActions(String table, String idColumn, long targetId, Map<String, Long> menuIds) {
        int filled = 0;
        for (Map.Entry<String, Long> entry : menuIds.entrySet()) {
            filled += jdbcTemplate.update(
                    "UPDATE " + table + " SET actions = ? WHERE " + idColumn + " = ? AND menu_id = ? "
                            + "AND (actions IS NULL OR actions = '' OR actions = '[]')",
                    BASELINE_MENUS.get(entry.getKey()), targetId, entry.getValue());
        }
        return filled;
    }

    private void verify() {
        // 后置校验与 migrate 同一口径：只校当前启用的基线菜单，退役的不复算缺失
        Map<String, Long> activeMenus = resolveActiveBaselineMenus();
        if (activeMenus.isEmpty()) {
            log.warn("CPM 使用側基線菜單均已退役，跳過基線授權校驗");
            return;
        }
        for (String menuKey : activeMenus.keySet()) {
            Integer missingRoles = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM sys_role r WHERE r.deleted = 0 AND r.status = 1 AND NOT EXISTS ("
                            + "SELECT 1 FROM sys_role_menu rm JOIN sys_menu m ON m.id = rm.menu_id "
                            + "WHERE rm.role_id = r.id AND m.menu_key = ? AND m.deleted = 0)",
                    Integer.class, menuKey);
            if (missingRoles != null && missingRoles > 0) {
                throw new IllegalStateException(menuKey + " 尚有 " + missingRoles + " 個啟用角色未獲得使用側基線授權");
            }
            Integer missingDepts = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM sys_department d WHERE d.deleted = 0 AND d.status = 1 AND NOT EXISTS ("
                            + "SELECT 1 FROM sys_department_menu dm JOIN sys_menu m ON m.id = dm.menu_id "
                            + "WHERE dm.dept_id = d.id AND m.menu_key = ? AND m.deleted = 0)",
                    Integer.class, menuKey);
            if (missingDepts != null && missingDepts > 0) {
                throw new IllegalStateException(menuKey + " 尚有 " + missingDepts + " 個有效部門未獲得使用側基線授權");
            }
        }
        Integer noRoleAccess = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_role r WHERE r.deleted = 0 AND r.status = 1 AND NOT EXISTS ("
                        + "SELECT 1 FROM sys_role_system rs WHERE rs.role_id = r.id AND rs.system_code = ?)",
                Integer.class, SYSTEM_CODE);
        if (noRoleAccess != null && noRoleAccess > 0) {
            throw new IllegalStateException("尚有 " + noRoleAccess + " 個啟用角色缺少 cpm 系統准入");
        }
        Integer noDeptAccess = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_department d WHERE d.deleted = 0 AND d.status = 1 AND NOT EXISTS ("
                        + "SELECT 1 FROM sys_department_system ds WHERE ds.dept_id = d.id AND ds.system_code = ?)",
                Integer.class, SYSTEM_CODE);
        if (noDeptAccess != null && noDeptAccess > 0) {
            throw new IllegalStateException("尚有 " + noDeptAccess + " 個有效部門缺少 cpm 系統准入");
        }
        // 治理侧三张菜单「没有被铺给全员」由单测钉死，不做运行时断言（管理员有权把治理菜单
        // 授给自建的综合岗位角色，那是合法配置，不该打死启动）。
    }
}
