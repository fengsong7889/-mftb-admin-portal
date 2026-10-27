package com.mftb.admin.config;

import com.mftb.admin.constant.SystemCode;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 企業 Agent 控制台：一级「企業 Agent」+ 8 个二级菜单。
 *
 * <p>为什么独立成组：控制台是**平台治理面**（分级、端点、预算、提案、运行、评测），
 * 与「AI 助手」的员工使用入口是两个维度；混在同一组会导致权限无法拆分。
 *
 * <p>每个二级菜单独立路由与动作集，发布回滚另立 {@code deploy} 动作，避免「能改应用就能批端点」。
 * 菜单每次启动幂等 upsert（误删可自愈），admin 兜底授权用 INSERT IGNORE；不删除任何旧菜单。
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(31)
public class AgentPlatformMenuInitializer implements CommandLineRunner {

    private static final String VERSION_KEY = "ai:agent-platform-menu-v1.0";
    /** v1.1：端点批准拆成独立 approve 动作，历史 edit 授权需要一次性补齐。 */
    static final String VERSION_KEY_APPROVE = "ai:agent-platform-menu-v1.1";
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String GROUP_KEY = "agent-platform";
    private static final String MENU_PREFIX = "agent-";

    private record MenuDef(String key, String name, String nameEn, String path, String icon, int sort, String actions) { }

    private static final List<MenuDef> CHILDREN = List.of(
            new MenuDef("agent-overview", "平台總覽", "Platform Overview", "/agent-overview",
                    "DashboardOutlined", 0, "[\"view\"]"),
            new MenuDef("agent-apps", "應用與版本", "Applications & Versions", "/agent-apps",
                    "AppstoreOutlined", 1, "[\"view\",\"edit\"]"),
            new MenuDef("agent-budget", "預算與配額", "Budget & Quota", "/agent-budget",
                    "ThunderboltOutlined", 2, "[\"view\",\"edit\"]"),
            new MenuDef("agent-actions", "動作提案", "Action Proposals", "/agent-actions",
                    "SafetyCertificateOutlined", 3, "[\"view\",\"approve\",\"execute\"]"),
            new MenuDef("agent-knowledge", "知識授權", "Knowledge ACL", "/agent-knowledge",
                    "ReadOutlined", 4, "[\"view\",\"edit\"]"),
            new MenuDef("agent-data", "數據與端點", "Data & Endpoints", "/agent-data",
                    "DatabaseOutlined", 5, "[\"view\",\"edit\",\"approve\"]"),
            new MenuDef("agent-runs", "運行中心", "Runs", "/agent-runs",
                    "PlayCircleOutlined", 6, "[\"view\"]"),
            new MenuDef("agent-evaluation", "評測與發布", "Evaluation & Release", "/agent-evaluation",
                    "ExperimentOutlined", 7, "[\"view\",\"deploy\"]"));

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;

    @Override
    public void run(String... args) {
        ensureGroup();
        Long groupId = jdbcTemplate.queryForObject(
                "SELECT id FROM sys_menu WHERE menu_key = ? AND deleted = 0 LIMIT 1", Long.class, GROUP_KEY);
        if (groupId == null) throw new IllegalStateException("企業 Agent 分组菜单未就绪: " + GROUP_KEY);
        for (MenuDef child : CHILDREN) ensureChild(groupId, child);
        versionTracker.applyOnce(VERSION_KEY, this::grantAdmin, this::verify);
        versionTracker.applyOnce(VERSION_KEY_APPROVE, this::inheritApproveForEditHolders);
        // 每次启动都校验：verify 只在首次应用时执行，不能当回归闸门
        assertGrouped(groupId);
    }

    private void ensureGroup() {
        jdbcTemplate.update(
                "INSERT INTO sys_menu (parent_id, menu_key, name, name_en, path, component, icon, type, "
                        + "sort_order, actions, status, system_code, updated_by, deleted) "
                        + "VALUES (NULL, ?, '企業 Agent', 'Agent Console', NULL, NULL, 'ControlOutlined', 2, "
                        + "3, NULL, 1, ?, 'system', 0) "
                        + "ON DUPLICATE KEY UPDATE name = VALUES(name), name_en = VALUES(name_en), "
                        + "parent_id = NULL, path = NULL, component = NULL, icon = VALUES(icon), type = 2, "
                        + "sort_order = VALUES(sort_order), actions = NULL, status = 1, "
                        + "system_code = VALUES(system_code), deleted = 0, updated_by = 'system'",
                GROUP_KEY, SystemCode.AI.code());
    }

    private void ensureChild(Long groupId, MenuDef child) {
        jdbcTemplate.update(
                "INSERT INTO sys_menu (parent_id, menu_key, name, name_en, path, component, icon, type, "
                        + "sort_order, actions, status, system_code, updated_by, deleted) "
                        + "VALUES (?, ?, ?, ?, ?, NULL, ?, 2, ?, ?, 1, ?, 'system', 0) "
                        + "ON DUPLICATE KEY UPDATE name = VALUES(name), name_en = VALUES(name_en), "
                        + "parent_id = VALUES(parent_id), path = VALUES(path), component = NULL, "
                        + "icon = VALUES(icon), type = 2, sort_order = VALUES(sort_order), "
                        + "actions = VALUES(actions), status = 1, system_code = VALUES(system_code), "
                        + "deleted = 0, updated_by = 'system'",
                groupId, child.key(), child.name(), child.nameEn(), child.path(),
                child.icon(), child.sort(), child.actions(), SystemCode.AI.code());
    }

    /** 仅给 admin 角色兜底，避免把治理权限默认铺给所有角色；其他角色由管理员在授权中心勾选。 */
    private void grantAdmin() {
        int roles = jdbcTemplate.update(
                "INSERT IGNORE INTO sys_role_menu (role_id, menu_id, actions) "
                        + "SELECT r.id, m.id, m.actions FROM sys_role r JOIN sys_menu m "
                        + "ON m.menu_key LIKE 'agent-%' AND m.deleted = 0 AND m.status = 1 "
                        + "WHERE r.code = 'admin' AND r.status = 1");
        log.info("企業 Agent 控制台已就绪：{} 个子菜单，admin 授权 {} 行", CHILDREN.size(), roles);
    }

    /**
     * 历史角色只被授予 view+edit：菜单 actions 会随种子升级，但角色授权是快照不会自动补，
     * 不补的话升级后除 admin 外任何人都点不了「批准端點」。这里做一次性幂等补齐。
     */
    private void inheritApproveForEditHolders() {
        Long menuId = jdbcTemplate.queryForObject(
                "SELECT id FROM sys_menu WHERE menu_key = 'agent-data' AND deleted = 0 LIMIT 1", Long.class);
        if (menuId == null) return;
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT role_id, actions FROM sys_role_menu WHERE menu_id = ?", menuId);
        int updated = 0;
        for (Map<String, Object> row : rows) {
            List<String> actions = readActions(row.get("actions"));
            if (!actions.contains("edit") || actions.contains("approve")) continue;
            List<String> next = new ArrayList<>(actions);
            next.add("approve");
            jdbcTemplate.update("UPDATE sys_role_menu SET actions = ? WHERE role_id = ? AND menu_id = ?",
                    writeActions(next), ((Number) row.get("role_id")).longValue(), menuId);
            updated++;
        }
        log.info("數據與端點已拆出 approve 動作，歷史 edit 授權補齊 {} 條", updated);
    }

    private static List<String> readActions(Object raw) {
        if (raw == null) return List.of();
        try {
            return JSON.readValue(String.valueOf(raw), new TypeReference<List<String>>() { });
        } catch (Exception e) {
            log.warn("角色授權 actions 解析失敗，跳過該行: {}", raw);
            return List.of();
        }
    }

    private static String writeActions(List<String> actions) {
        try {
            return JSON.writeValueAsString(actions);
        } catch (Exception e) {
            return "[\"view\",\"edit\",\"approve\"]";
        }
    }

    private void verify() {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_menu WHERE menu_key LIKE ? AND deleted = 0 AND status = 1",
                Integer.class, MENU_PREFIX + "%");
        if (count == null || count < CHILDREN.size()) {
            throw new IllegalStateException("企業 Agent 子菜单未就绪: " + count);
        }
    }

    private void assertGrouped(Long groupId) {
        Integer detached = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_menu WHERE menu_key LIKE ? AND menu_key <> ? "
                        + "AND deleted = 0 AND (parent_id IS NULL OR parent_id <> ?)",
                Integer.class, MENU_PREFIX + "%", GROUP_KEY, groupId);
        if (detached != null && detached > 0) {
            throw new IllegalStateException("企業 Agent 子菜单未挂到分组: " + detached);
        }
    }
}
