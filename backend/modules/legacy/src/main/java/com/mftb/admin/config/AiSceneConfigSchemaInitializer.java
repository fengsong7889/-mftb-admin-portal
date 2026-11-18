package com.mftb.admin.config;

import com.mftb.admin.constant.CpmConstants;
import com.mftb.admin.constant.MeetingConstants;
import com.mftb.admin.util.JsonUtils;
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
 * 业务 AI 场景开关表与试点菜单动作（会议 AI 整理纪要）。
 *
 * <p>两步迁移：
 * <ol>
 *   <li>{@code ai:scene-config-v1.0}：建 {@code ai_scene_config} 表并登记默认关闭的 meeting_minutes 行；</li>
 *   <li>{@code ai:scene-menu-actions-v1.0}：给三个会议菜单的 {@code sys_menu.actions} 追加
 *       {@code ai_minutes} 动作，让授权中心能勾到——只改菜单定义，不动任何角色/部门授权行，
 *       因此默认无人获得该动作，重启也不会自动扩发。</li>
 * </ol>
 *
 * <p>顺序取 32：晚于会议菜单种子（28/29）与权限注解校验（30），确保菜单行已存在才追加动作。
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(32)
public class AiSceneConfigSchemaInitializer implements CommandLineRunner {

    private static final String VERSION_TABLE = "ai:scene-config-v1.0";
    private static final String VERSION_MENU_ACTIONS = "ai:scene-menu-actions-v1.0";
    /** cpm 场景行登记（晚于 cpm:schema:v1.0 建表；默认关闭，迁移不会自动开放 AI） */
    private static final String VERSION_CPM_SCENE = "ai:cpm-scene-v1.0";
    private static final String SCRIPT = "319_ai_scene_config.sql";
    private static final String SCENE_ROW = "meeting_minutes";
    private static final String MENU_AI_OPERATION_AUTH = "ai-operation-auth";
    /** 管理会议 AI 开关 / 诊断指定员工的独立动作（挂在 ai-operation-auth 菜单上）。 */
    private static final String ACTION_MEETING_AI_MANAGE = "meeting_ai_manage";
    private static final String ACTION_MEETING_AI_DIAGNOSE = "meeting_ai_diagnose";
    /** 持续绩效场景同职责动作：能管会议 AI 不等于能管 cpm AI（预算与出域内容不同）。 */
    static final String ACTION_CPM_AI_MANAGE = "cpm_ai_manage";
    static final String ACTION_CPM_AI_DIAGNOSE = "cpm_ai_diagnose";
    /** 菜单 → 需追加的动作。只改 sys_menu.actions，不动任何授权行。 */
    private static final Map<String, List<String>> ACTIONS_TO_APPEND = Map.of(
            MeetingConstants.MENU_MY, List.of(MeetingConstants.ACTION_AI_MINUTES),
            MeetingConstants.MENU_BOOKING, List.of(MeetingConstants.ACTION_AI_MINUTES),
            MeetingConstants.MENU_RECORD, List.of(MeetingConstants.ACTION_AI_MINUTES),
            MENU_AI_OPERATION_AUTH, List.of(ACTION_MEETING_AI_MANAGE, ACTION_MEETING_AI_DIAGNOSE));

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;

    @Override
    public void run(String... args) {
        versionTracker.applyOnce(VERSION_TABLE, this::createTable, this::verifyTable);
        versionTracker.applyOnce(VERSION_MENU_ACTIONS, this::appendAiMinutesAction, this::verifyAiMinutesAction);
        versionTracker.applyOnce(VERSION_CPM_SCENE, this::seedCpmScene, this::verifyCpmScene);
    }

    /**
     * 持續績效 AI 场景行 + 治理动作：INSERT IGNORE 幂等，已有行不覆盖（管理员在场景面板开过的开关不能被重放顶回）。
     * <p>动作码 ai_cpm 不在此追加——cpm-my/cpm-report 的 sys_menu.actions 由 CpmSchemaMigrationInitializer
     * 一次性种子写好（view,edit,ai_cpm）；这里给 ai-operation-auth 追加 cpm 场景的「管理/诊断」动作，
     * 让授权中心能把 cpm_report 场景的治理面板授予非超管管理员——只改菜单定义，不动任何授权行。
     */
    private void seedCpmScene() {
        jdbcTemplate.update(
                "INSERT IGNORE INTO ai_scene_config (scene_key, enabled, version, created_by, updated_by) "
                        + "VALUES (?, 0, 0, NULL, NULL)",
                CpmConstants.SCENE_CPM_REPORT);
        appendActions(MENU_AI_OPERATION_AUTH,
                List.of(ACTION_CPM_AI_MANAGE, ACTION_CPM_AI_DIAGNOSE));
        log.info("AI 場景已登記 cpm_report（默認關閉，需管理員在場景面板显式开启）");
    }

    private void verifyCpmScene() {
        Integer seeded = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM ai_scene_config WHERE scene_key = ?", Integer.class,
                CpmConstants.SCENE_CPM_REPORT);
        if (seeded == null || seeded == 0) {
            throw new IllegalStateException("ai_scene_config 未登記 cpm_report 場景行");
        }
    }

    private void createTable() {
        for (String statement : readStatements()) {
            jdbcTemplate.execute(statement);
        }
        log.info("AI 场景开关表建表脚本已执行: {}（{}）", SCENE_ROW, SCRIPT);
    }

    private void verifyTable() {
        if (!tableExists("ai_scene_config")) {
            throw new IllegalStateException("ai_scene_config 表未就绪，业务 AI 场景开关无法读写");
        }
        Integer seeded = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM ai_scene_config WHERE scene_key = ?", Integer.class, SCENE_ROW);
        if (seeded == null || seeded == 0) {
            throw new IllegalStateException("ai_scene_config 试点场景行未登记: " + SCENE_ROW);
        }
    }

    /** 只给 sys_menu.actions 追加动作，绝不改 sys_role_menu / sys_department_menu 授权行。 */
    private void appendAiMinutesAction() {
        for (Map.Entry<String, List<String>> entry : ACTIONS_TO_APPEND.entrySet()) {
            appendActions(entry.getKey(), entry.getValue());
        }
    }

    /** 给一个菜单追加动作集合（逐条字面量调用之外的通用实现，幂等：已含则跳过）。 */
    private void appendActions(String menuKey, List<String> toAdd) {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT id, actions FROM sys_menu WHERE menu_key = ? AND deleted = 0", menuKey);
        for (Map<String, Object> row : rows) {
            List<String> actions = JsonUtils.parseStringList((String) row.get("actions"));
            actions = actions.isEmpty() ? new ArrayList<>(List.of("view")) : new ArrayList<>(actions);
            boolean changed = false;
            for (String add : toAdd) {
                if (!actions.contains(add)) {
                    actions.add(add);
                    changed = true;
                }
            }
            if (changed) {
                jdbcTemplate.update("UPDATE sys_menu SET actions = ? WHERE id = ?",
                        JsonUtils.toJson(actions), row.get("id"));
                log.info("菜单 {} 已登记动作 {}（不自动授予任何角色/部门）", menuKey, toAdd);
            }
        }
    }

    private void verifyAiMinutesAction() {
        for (Map.Entry<String, List<String>> entry : ACTIONS_TO_APPEND.entrySet()) {
            for (String action : entry.getValue()) {
                Integer has = jdbcTemplate.queryForObject(
                        "SELECT COUNT(*) FROM sys_menu WHERE menu_key = ? AND deleted = 0 "
                                + "AND JSON_CONTAINS(actions, JSON_QUOTE(?))",
                        Integer.class, entry.getKey(), action);
                if (has == null || has == 0) {
                    throw new IllegalStateException("菜单 " + entry.getKey() + " 未登记动作 " + action);
                }
            }
        }
    }

    private List<String> readStatements() {
        String raw = MeetingMinutesSchema.raw(SCRIPT);
        String stripped = raw.replaceAll("(?m)^\\s*--.*$", "");
        List<String> out = new ArrayList<>();
        for (String part : stripped.split(";")) {
            String trimmed = part.trim();
            if (!trimmed.isEmpty()) {
                out.add(trimmed);
            }
        }
        return out;
    }

    private boolean tableExists(String table) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?", Integer.class, table);
        return count != null && count > 0;
    }
}
