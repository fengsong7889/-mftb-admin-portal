package com.mftb.admin.config;

import com.mftb.admin.constant.SystemCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.util.StreamUtils;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;

/**
 * AI 助手配置中心：一级分组 + 11 个二级菜单。
 *
 * <p>拆分原因：原单页 6 个 tab 共用同一个 view/edit 权限，运营看板、知识库、合规护栏
 * 与提示词配置无法分开授权；拆成独立页面后每页有独立路由、搜索与权限锚点。
 *
 * <p>菜单每次启动幂等 upsert（被误删可自愈）；旧菜单授权迁移只执行一次（版本键控制），
 * 先搬授权再软删旧菜单，避免存量角色静默失权。
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(16)
public class AiAssistantConfigMenuInitializer implements CommandLineRunner {

    private static final String VERSION_KEY = "ai:assistant-menu-split-v2.1";
    private static final String SCRIPT = "275_ai_assistant_menu_split.sql";
    /**
     * v2.2：275 的授权清单只覆盖 8 个菜单，快捷提問/推送模板/記憶策略
     * 三个菜单在存量库（v2.1 已登记）与全新建库上都没有任何授权行，只能另起版本补授。
     */
    private static final String VERSION_KEY_EXTRA_GRANTS = "ai:assistant-menu-split-v2.2";
    private static final String SCRIPT_EXTRA_GRANTS = "279_ai_assistant_extra_menu_grants.sql";
    private static final List<String> EXTRA_MENU_KEYS = List.of(
            "ai-assistant-quick-prompt", "ai-assistant-push-template", "ai-assistant-memory");
    private static final String GROUP_KEY = "ai-assistant-group";
    /**
     * v45 已退役的一级包装目录 key，禁止复用：DataInitializer.retireSystemWrapperDirectories()
     * 每次启动会把它物理删除并把子菜单提升为一级，导致侧栏「全部平铺」。
     */
    private static final String RETIRED_GROUP_KEY = "ai-assistant";
    private static final String LEGACY_KEY = "ai-assistant-config";

    private record MenuDef(String key, String name, String nameEn, String path,
                           String component, String icon, int sort, String actions) {
    }

    private static final List<MenuDef> CHILDREN = List.of(
            new MenuDef("ai-assistant-overview", "助手概覽", "Assistant Overview",
                    "/ai-assistant", "AiAssistantOverview", "DashboardOutlined", 0, "[\"view\"]"),
            new MenuDef("ai-assistant-capability", "能力清單", "Capabilities",
                    "/ai-assistant/capability", "AiAssistantCapability", "AppstoreOutlined", 1, "[\"view\",\"edit\"]"),
            new MenuDef("ai-assistant-profile", "回答骨架", "Answer Skeleton",
                    "/ai-assistant/profile", "AiAssistantProfile", "FileTextOutlined", 2, "[\"view\",\"edit\"]"),
            new MenuDef("ai-assistant-glossary", "術語與口徑", "Glossary",
                    "/ai-assistant/glossary", "AiAssistantGlossary", "BookOutlined", 3, "[\"view\",\"edit\"]"),
            new MenuDef("ai-assistant-knowledge", "知識庫", "Knowledge Base",
                    "/ai-assistant/knowledge", "AiAssistantKnowledge", "ReadOutlined", 4, "[\"view\",\"edit\"]"),
            new MenuDef("ai-assistant-guardrail", "合規護欄", "Guardrails",
                    "/ai-assistant/guardrail", "AiAssistantGuardrail", "SafetyCertificateOutlined", 5, "[\"view\",\"edit\"]"),
            new MenuDef("ai-assistant-quick-prompt", "快捷提問", "Quick Prompts",
                    "/ai-assistant/quick-prompt", "AiAssistantQuickPrompt", "ThunderboltOutlined", 6, "[\"view\",\"edit\"]"),
            new MenuDef("ai-assistant-push-template", "推送模板", "Push Templates",
                    "/ai-assistant/push-template", "AiAssistantPushTemplate", "SendOutlined", 7, "[\"view\",\"edit\"]"),
            new MenuDef("ai-assistant-memory", "記憶策略", "Memory Policy",
                    "/ai-assistant/memory", "AiAssistantMemory", "BulbOutlined", 8, "[\"view\",\"edit\"]"),
            new MenuDef("ai-assistant-feedback", "回答質量", "Answer Quality",
                    "/ai-assistant/feedback", "AiAssistantFeedback", "MessageOutlined", 9, "[\"view\"]"),
            new MenuDef("ai-assistant-audit", "變更審計", "Config Audit",
                    "/ai-assistant/audit", "AiAssistantAudit", "AuditOutlined", 10, "[\"view\"]")
    );

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;

    @Override
    public void run(String... args) {
        cleanupRetiredGroupKey();
        ensureGroup();
        Long groupId = jdbcTemplate.queryForObject(
                "SELECT id FROM sys_menu WHERE menu_key = ? LIMIT 1", Long.class, GROUP_KEY);
        for (MenuDef child : CHILDREN) {
            ensureChild(groupId, child);
        }
        softDeleteLegacy();
        backfillOverviewGrants();
        versionTracker.applyOnce(VERSION_KEY, this::migrateLegacyGrants, this::verify);
        versionTracker.applyOnce(VERSION_KEY_EXTRA_GRANTS, this::migrateExtraMenuGrants,
                this::verifyExtraMenuGrants);
        // 每次启动都校验（verify 只在首次应用时执行，不能拿它当回归闸门）
        assertGrouped();
    }

    /**
     * 启动断言：子菜单必须挂在分组下。
     * <p>parent_id 为空会让侧栏把 11 个页面平铺成一级菜单，而分组本身被退役目录清理掉时
     * 没有任何报错，只能靠重启后的侧栏发现；这里把它变成启动期失败，避免带病运行。
     */
    private void assertGrouped() {
        Long groupId = jdbcTemplate.queryForObject(
                "SELECT id FROM sys_menu WHERE menu_key = ? AND deleted = 0 LIMIT 1",
                Long.class, GROUP_KEY);
        if (groupId == null) {
            throw new IllegalStateException("AI 助手分组菜单未就绪: " + GROUP_KEY);
        }
        Integer detached = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_menu WHERE menu_key LIKE 'ai-assistant-%' "
                        + "AND menu_key <> ? AND deleted = 0 AND (parent_id IS NULL OR parent_id <> ?)",
                Integer.class, GROUP_KEY, groupId);
        if (detached != null && detached > 0) {
            throw new IllegalStateException("AI 助手子菜单未挂到分组: " + detached);
        }
    }

    /**
     * 概览入口自愈：只要角色/部门能看任一子页，就补上概览 view。
     *
     * <p>背景：新建角色时若只勾子页（能力/知识库等），侧栏没有“助手概览”入口，
     * 管理页反而少了一个总览入口。这里每次启动幂等补齐，不新增授权语义。
     */
    private void backfillOverviewGrants() {
        // 不用 String.format：SQL 里的 LIKE 'ai-assistant-%' 会被当成格式符（% 后接引号）直接抛异常
        backfillRoleGrants();
        backfillDeptGrants();
    }

    private void backfillRoleGrants() {
        String sql = "INSERT IGNORE INTO sys_role_menu (role_id, menu_id, actions) "
                + "SELECT DISTINCT x.role_id, ov.id, '[\"view\"]' "
                + "FROM sys_role_menu x "
                + "JOIN sys_menu child ON child.id = x.menu_id "
                + "AND child.menu_key LIKE 'ai-assistant-%' AND child.menu_key <> 'ai-assistant-overview' "
                + "JOIN sys_menu ov ON ov.menu_key = 'ai-assistant-overview' AND ov.deleted = 0 "
                + "WHERE JSON_VALID(x.actions) AND JSON_CONTAINS(x.actions, '\"view\"')";
        try {
            int rows = jdbcTemplate.update(sql);
            if (rows > 0) {
                log.info("AI 助手概览授权已补齐（角色）: {} 行", rows);
            }
        } catch (Exception e) {
            log.warn("AI 助手概览授权补齐失败（角色，不阻断启动）: {}", e.getMessage());
        }
    }

    private void backfillDeptGrants() {
        String sql = "INSERT IGNORE INTO sys_department_menu (dept_id, menu_id, actions) "
                + "SELECT DISTINCT x.dept_id, ov.id, '[\"view\"]' "
                + "FROM sys_department_menu x "
                + "JOIN sys_menu child ON child.id = x.menu_id "
                + "AND child.menu_key LIKE 'ai-assistant-%' AND child.menu_key <> 'ai-assistant-overview' "
                + "JOIN sys_menu ov ON ov.menu_key = 'ai-assistant-overview' AND ov.deleted = 0 "
                + "WHERE JSON_VALID(x.actions) AND JSON_CONTAINS(x.actions, '\"view\"')";
        try {
            int rows = jdbcTemplate.update(sql);
            if (rows > 0) {
                log.info("AI 助手概览授权已补齐（部门）: {} 行", rows);
            }
        } catch (Exception e) {
            // 部门授权表在部分历史库不存在；缺失不应阻断菜单初始化
            log.warn("AI 助手概览授权补齐失败（部门，不阻断启动）: {}", e.getMessage());
        }
    }

    /**
     * 清理与退役目录同名的旧分组行（含授权）。
     *
     * <p>历史原因：本初始化器曾用 {@code ai-assistant} 作分组 key，而该 key 同时在
     * {@code DataInitializer.RETIRED_SYSTEM_WRAPPERS} 里，每次启动会被物理删除、
     * 子菜单被提升为一级。这里做一次性善后，确保不会残留两个同名分组。
     */
    private void cleanupRetiredGroupKey() {
        try {
            jdbcTemplate.update("DELETE FROM sys_role_menu WHERE menu_id IN "
                    + "(SELECT id FROM sys_menu WHERE menu_key = ?)", RETIRED_GROUP_KEY);
            jdbcTemplate.update("DELETE FROM sys_department_menu WHERE menu_id IN "
                    + "(SELECT id FROM sys_menu WHERE menu_key = ?)", RETIRED_GROUP_KEY);
        } catch (Exception e) {
            log.warn("清理旧 AI 助手分组授权失败（不阻断）: {}", e.getMessage());
        }
        int removed = jdbcTemplate.update("DELETE FROM sys_menu WHERE menu_key = ?", RETIRED_GROUP_KEY);
        if (removed > 0) {
            log.info("已清理与退役目录同名的旧 AI 助手分组行: {}", RETIRED_GROUP_KEY);
        }
    }

    private void ensureGroup() {
        jdbcTemplate.update(
                "INSERT INTO sys_menu (parent_id, menu_key, name, name_en, path, component, icon, type, "
                        + "sort_order, actions, status, system_code, updated_by, deleted) "
                        + "VALUES (NULL, ?, 'AI 助手', 'AI Assistant', NULL, NULL, 'RobotOutlined', 2, "
                        + "11, NULL, 1, ?, 'system', 0) "
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
                        + "VALUES (?, ?, ?, ?, ?, ?, ?, 2, ?, ?, 1, ?, 'system', 0) "
                        + "ON DUPLICATE KEY UPDATE name = VALUES(name), name_en = VALUES(name_en), "
                        + "parent_id = VALUES(parent_id), path = VALUES(path), component = VALUES(component), "
                        + "icon = VALUES(icon), type = 2, sort_order = VALUES(sort_order), "
                        + "actions = VALUES(actions), status = 1, system_code = VALUES(system_code), "
                        + "deleted = 0, updated_by = 'system'",
                groupId, child.key(), child.name(), child.nameEn(), child.path(), child.component(),
                child.icon(), child.sort(), child.actions(), SystemCode.AI.code());
    }

    /** 旧菜单先软删；授权关系仍保留在 sys_role_menu，迁移脚本按 menu_id 读取。 */
    private void softDeleteLegacy() {
        int rows = jdbcTemplate.update(
                "UPDATE sys_menu SET deleted = 1, status = 0 WHERE menu_key = ? AND deleted = 0", LEGACY_KEY);
        if (rows > 0) {
            log.info("AI 助手旧菜单已软删: {}", LEGACY_KEY);
        }
    }

    private void migrateLegacyGrants() {
        runScript(SCRIPT);
        log.info("AI 助手菜单授权迁移完成");
    }

    private void migrateExtraMenuGrants() {
        runScript(SCRIPT_EXTRA_GRANTS);
        log.info("AI 助手补充菜单授权迁移完成");
    }

    /** 按分号切分执行 classpath 脚本（去掉 -- 注释行）；失败直接抛出，避免误记已迁移版本。 */
    private void runScript(String script) {
        ClassPathResource resource = new ClassPathResource(script);
        if (!resource.exists()) {
            throw new IllegalStateException("未找到 AI 助手菜单授权迁移脚本: " + script);
        }
        try (InputStream is = resource.getInputStream()) {
            String raw = StreamUtils.copyToString(is, StandardCharsets.UTF_8);
            String noComment = raw.replaceAll("(?m)^\\s*--.*$", "");
            for (String stmt : noComment.split(";")) {
                String trimmed = stmt.trim();
                if (!trimmed.isEmpty()) {
                    jdbcTemplate.execute(trimmed);
                }
            }
        } catch (Exception e) {
            throw new IllegalStateException("执行 AI 助手菜单授权迁移失败: " + script, e);
        }
    }

    /**
     * v2.2 后置校验：三个补充菜单必须挂在分组下、启用、动作集含 view/edit，且至少有一条角色授权。
     * <p>只校验“有没有”，不校验具体是哪些角色：授权可以后续在功能授权里调整，属正常运维。
     */
    private void verifyExtraMenuGrants() {
        Long groupId = jdbcTemplate.queryForObject(
                "SELECT id FROM sys_menu WHERE menu_key = ? AND deleted = 0 LIMIT 1",
                Long.class, GROUP_KEY);
        if (groupId == null) {
            throw new IllegalStateException("AI 助手分组菜单未就绪");
        }
        for (String key : EXTRA_MENU_KEYS) {
            Integer ready = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM sys_menu WHERE menu_key = ? AND parent_id = ? "
                            + "AND deleted = 0 AND status = 1 "
                            + "AND actions LIKE '%view%' AND actions LIKE '%edit%'",
                    Integer.class, key, groupId);
            if (ready == null || ready == 0) {
                throw new IllegalStateException("AI 助手补充菜单未就绪: " + key);
            }
            Integer grants = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM sys_role_menu rm JOIN sys_menu m ON m.id = rm.menu_id "
                            + "WHERE m.menu_key = ?",
                    Integer.class, key);
            if (grants == null || grants == 0) {
                throw new IllegalStateException("AI 助手补充菜单未授权: " + key);
            }
        }
    }

    private void verify() {
        Long groupId = jdbcTemplate.queryForObject(
                "SELECT id FROM sys_menu WHERE menu_key = ? AND deleted = 0 LIMIT 1",
                Long.class, GROUP_KEY);
        if (groupId == null) {
            throw new IllegalStateException("AI 助手分组菜单未就绪");
        }
        Integer children = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_menu WHERE parent_id = ? AND deleted = 0 AND status = 1",
                Integer.class, groupId);
        if (children == null || children < CHILDREN.size()) {
            throw new IllegalStateException("AI 助手子菜单未全部就绪: " + children);
        }
        // 防回归：子菜单必须挂在分组下；parent_id 为空会让侧栏把 11 个页面平铺成一级菜单
        Integer detached = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_menu WHERE menu_key LIKE 'ai-assistant-%' "
                        + "AND menu_key <> ? AND deleted = 0 AND (parent_id IS NULL OR parent_id <> ?)",
                Integer.class, GROUP_KEY, groupId);
        if (detached != null && detached > 0) {
            throw new IllegalStateException("AI 助手子菜单未挂到分组: " + detached);
        }
        Integer legacy = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_menu WHERE menu_key = ? AND deleted = 0 AND status = 1",
                Integer.class, LEGACY_KEY);
        if (legacy != null && legacy > 0) {
            throw new IllegalStateException("旧 AI 助手菜单未软删");
        }
        String actions = jdbcTemplate.queryForObject(
                "SELECT actions FROM sys_menu WHERE menu_key = 'ai-assistant-guardrail' LIMIT 1",
                String.class);
        if (actions == null || !actions.contains("view") || !actions.contains("edit")) {
            throw new IllegalStateException("AI 助手子菜单动作集缺少 view/edit: " + actions);
        }
    }
}
