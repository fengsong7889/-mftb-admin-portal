package com.mftb.admin.config;

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
 * RDM 全员基线授权：让全公司各部门员工都能在门户里看到并进入「產研協同」提需求。
 * <p>
 * 只铺四张<b>自数据范围</b>菜单：工作台 / 提交需求 / 我的需求 / 需求驗收。
 * 授到<strong>所有启用角色</strong>而非只授員工自助基底角色——现有员工大多已绑业务角色，
 * 只授基底角色等于全公司只有新人能提需求，不符合「需求线上化」的第一目标。
 * <p>
 * 安全边界不靠菜单卡：<b>服务端一律将非管理视角的查询收敛到「与自己相关」的需求</b>
 * （提出人 / 產品經理 / 研發負責人 / 驗收人），见
 * {@code RdmRequirementServiceImpl#canSeeAll}。因此多授一张菜单不会让员工看到别部门的需求。
 * <p>
 * 刻意<b>不</b>自动授予的：需求池分配、產品需求處理、需求看板的导出、全部需求、需求配置
 * —— 产研职能与跨部门可见性必须由管理员在「授權中心 · 功能授權」按角色勾选，
 * 避免用角色名猜测匹配造成越权。
 * <p>
 * 版本键 {@code rdm:access-grant:v1.0}；每次启动重放自愈（幂等 ON DUPLICATE KEY UPDATE）。
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(25)
public class RdmAccessGrantInitializer implements CommandLineRunner {

    private static final String VERSION_KEY = "rdm:access-grant:v1.0";
    /** 全员基线菜单：key → 动作（仅自我数据范围的四张） */
    private static final Map<String, String> BASELINE_MENUS = Map.of(
            "rdm-workbench", "[\"view\"]",
            "rdm-submit", "[\"view\",\"create\"]",
            "rdm-requirement", "[\"view\"]",
            "rdm-acceptance", "[\"view\",\"create\"]");

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;
    private final PermissionService permissionService;

    @Override
    public void run(String... args) {
        // 版本已应用时仍每次启动重放：菜单与授权可能被权限中心改动，基线必须稳定
        if (!versionTracker.applyOnce(VERSION_KEY, this::migrate, this::verify)) {
            migrate();
        }
    }

    private void migrate() {
        // 基线菜单的 menuId 必须先存在（菜单种子已在前一阶段执行）
        Map<String, Long> menuIds = new LinkedHashMap<>();
        for (String menuKey : BASELINE_MENUS.keySet()) {
            Long menuId = jdbcTemplate.queryForList(
                            "SELECT id FROM sys_menu WHERE menu_key = ? AND deleted = 0 AND status = 1 LIMIT 1",
                            Long.class, menuKey)
                    .stream().findFirst().orElse(null);
            if (menuId == null) {
                throw new IllegalStateException("RDM 菜单未就绪，无法授权: " + menuKey);
            }
            menuIds.put(menuKey, menuId);
        }
        List<Long> roleIds = jdbcTemplate.queryForList(
                "SELECT id FROM sys_role WHERE deleted = 0 AND status = 1", Long.class);
        if (roleIds.isEmpty()) {
            log.warn("无任何启用角色，跳过 RDM 基线授权");
            return;
        }
        int granted = 0;
        for (Long roleId : roleIds) {
            for (Map.Entry<String, Long> entry : menuIds.entrySet()) {
                jdbcTemplate.update(
                        "INSERT INTO sys_role_menu (role_id, menu_id, actions) VALUES (?, ?, ?) "
                                + "ON DUPLICATE KEY UPDATE actions = VALUES(actions)",
                        roleId, entry.getValue(), BASELINE_MENUS.get(entry.getKey()));
                granted++;
            }
            // 系统准入：基线角色也要有 rdm，否则严管模式下菜单会被系统级判定拦下
            jdbcTemplate.update("INSERT IGNORE INTO sys_role_system (role_id, system_code) VALUES (?, ?)",
                    roleId, SystemCode.RDM.code());
        }
        permissionService.evictAll();
        log.info("RDM 基線授權完成: roles={}, 菜单授权={} 条, menus={}",
                roleIds.size(), granted, BASELINE_MENUS.keySet());
    }

    private void verify() {
        List<Long> roleIds = jdbcTemplate.queryForList(
                "SELECT id FROM sys_role WHERE deleted = 0 AND status = 1", Long.class);
        if (roleIds.isEmpty()) {
            return;
        }
        for (String menuKey : BASELINE_MENUS.keySet()) {
            Integer missing = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM sys_role r WHERE r.deleted = 0 AND r.status = 1 AND NOT EXISTS ("
                            + "SELECT 1 FROM sys_role_menu rm JOIN sys_menu m ON m.id = rm.menu_id "
                            + "WHERE rm.role_id = r.id AND m.menu_key = ? AND m.deleted = 0)",
                    Integer.class, menuKey);
            if (missing != null && missing > 0) {
                throw new IllegalStateException(menuKey + " 尚有 " + missing + " 个启用角色未获得基线授权");
            }
        }
        Integer noAccess = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_role r WHERE r.deleted = 0 AND r.status = 1 AND NOT EXISTS ("
                        + "SELECT 1 FROM sys_role_system rs WHERE rs.role_id = r.id AND rs.system_code = ?)",
                Integer.class, SystemCode.RDM.code());
        if (noAccess != null && noAccess > 0) {
            throw new IllegalStateException("尚有 " + noAccess + " 个启用角色缺少 rdm 系统准入");
        }
    }

    /** 供权限中心文案引用（避免魔法字符串散落） */
    public static List<String> baselineMenuKeys() {
        return List.copyOf(BASELINE_MENUS.keySet());
    }
}
