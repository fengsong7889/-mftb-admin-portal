package com.mftb.admin.config;

import com.mftb.admin.constant.DocConstants;
import com.mftb.admin.constant.SystemCode;
import com.mftb.admin.service.PermissionService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.util.StreamUtils;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * 文檔中心（doc）迁移：3 張索引表 + 空間種子 + 菜單種子。
 *
 * <p>DDL 只在 classpath 腳本 {@code 233_doc_center_tables.sql} 存一份
 * （{@code backend/sql/} 下同名文件為參考副本），避免 Java 與 SQL 雙份漂移。
 *
 * <p>版本键分工（按应用顺序）：
 * <ul>
 *   <li>{@code doc:schema:v1.0}：索引三表建表 + 後置校驗（表存在、關鍵列就緒）；</li>
 *   <li>{@code doc:learning:v1.0}：學習路徑兩表（新人入職包/培訓清單）；</li>
 *   <li>{@code doc:seed:v1.0}：5 個默認知識空間（需求/人事/行政/制度/培訓）——只在空表時種入，
 *       管理員刪過空間的庫不復種；</li>
 *   <li>{@code doc:menu:v1.0}：文檔庫/空間管理/閱讀統計/學習路徑四個頂級菜單 + admin 授權 + 系統准入反推，
 *       每次啟動重放自癒結構對齊；</li>
 *   <li>{@code doc:menu:v1.1}：存量庫拍平——解除歷史分組「文檔中心」，葉子升為頂級；</li>
 *   <li>{@code doc:menu:v1.2}：新增閱讀統計看板菜單；</li>
 *   <li>{@code doc:menu:v1.3}：新增學習路徑菜單。</li>
 * </ul>
 *
 * <p><b>啟動順序</b>：取 27，必須早於 {@code PermissionAnnotationValidator(@Order 30)}
 * （否則 DocController 上的 doc-* 菜單還沒入庫，會誤報「接口對非超管全部拒絕」），
 * 並晚於 {@code SystemPortalSchemaInitializer(@Order 15)}。
 *
 * <p><b>菜單歸屬</b>：{@code system_code} 顯式寫 {@code doc}；{@code propagateSystemToDescendants}
 * 只在門戶底座遷移那一次運行，晚於本初始化器插入的菜單留 NULL 會讓門戶導航剪枝丟樹。
 */
@Slf4j
@Component
@Order(27)
@RequiredArgsConstructor
public class DocSchemaMigrationInitializer implements CommandLineRunner {

    static final String VERSION_SCHEMA = "doc:schema:v1.0";
    static final String VERSION_SEED = "doc:seed:v1.0";
    static final String VERSION_MENU = "doc:menu:v1.0";
    /**
     * 菜單拍平：系統視圖已按 system_code 剪枝，一級分組沒有運行時職責只多一次展開；
     * 兩個葉子直接作為 doc 系統的頂級菜單存在（對齊 rdm「菜單已拍平為一級」形態）。
     * 必須單獨一個版本鍵：v1.0 已落庫的開發庫不會重跑 task，只改 v1.0 聲明真實環境永遠不出現拍平；
     * v1.0 任務體同步改為扁平形態，供全新庫首次執行直接使用。
     */
    static final String VERSION_MENU_V11 = "doc:menu:v1.1";
    /**
     * P2 閱讀統計看板菜單：新增唯讀頂級菜單「閱讀統計」（/doc-stats）。
     * 單獨版本鍵的理由與 v1.1 同：v1.0/v1.1 已落庫的環境不重跑 task，
     * 只改舊聲明真實環境永遠看不到新菜單；v1.0 任務體同步加菜單供全新庫使用。
     */
    static final String VERSION_MENU_V12 = "doc:menu:v1.2";
    /**
     * P2 學習路徑（新人入職包/培訓清單）：doc_learning_path + doc_learning_path_item 兩表。
     * 口徑：路徑 = 有序的文檔清單；「已讀」由 doc_view_log 推導，不另建進度表。
     */
    static final String VERSION_LEARNING = "doc:learning:v1.0";
    /** 學習路徑入口菜單（頂級「學習路徑」/doc-learning）；單獨版本鍵理由同 v1.1/v1.2 */
    static final String VERSION_MENU_V13 = "doc:menu:v1.3";

    private static final String SCHEMA_SCRIPT = "233_doc_center_tables.sql";
    private static final String SCHEMA_SCRIPT_LEARNING = "234_doc_learning_path.sql";

    private static final String SYSTEM_CODE = SystemCode.DOC.code();
    private static final String ADMIN_ROLE_CODE = DocConstants.ADMIN_ROLE_CODE;
    private static final int MENU_TYPE_LEAF = 2;

    private static final String[] TABLES = {"doc_space", "doc_node", "doc_view_log"};

    /** 學習路徑兩表（單獨一組：v1.0 校驗必須能在 234 腳本之前獨立通過） */
    private static final String[] LEARNING_TABLES = {"doc_learning_path", "doc_learning_path_item"};

    /** 實體依賴列必驗：缺列時 MyBatis-Plus 按字段拼 SELECT 會報 bad SQL grammar */
    private static final String[][] REQUIRED_COLUMNS = {
            {"doc_node", "tencent_file_id"},
            {"doc_node", "biz_type"},
            {"doc_node", "summary"},
            {"doc_view_log", "duration_sec"},
            {"doc_space", "icon"},
    };

    /** 默認知識空間：{名稱, 圖標, 排序, 說明} */
    private static final String[][] SEED_SPACES = {
            {"需求文檔", "📋", "1", "PRD、評審紀要、需求池評估"},
            {"人事", "👥", "2", "入職指引、人事制度說明"},
            {"行政", "🏢", "3", "行政流程與辦事指南"},
            {"公司制度", "📜", "4", "員工手冊與紅線制度"},
            {"培訓中心", "🎓", "5", "新人培訓與系統操作課程"},
    };

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;
    private final PermissionService permissionService;

    @Override
    public void run(String... args) {
        versionTracker.applyOnce(VERSION_SCHEMA, this::doSchemaMigrate, this::verifySchema);
        versionTracker.applyOnce(VERSION_LEARNING, this::doLearningSchema, this::verifyLearningSchema);
        versionTracker.applyOnce(VERSION_SEED, this::doSeedSpaces, this::verifySpaces);
        // 菜單與會話域同口徑：版本已落地的庫仍重放 task，保持結構自癒
        if (!versionTracker.applyOnce(VERSION_MENU, this::doMenuMigrate, this::verifyMenus)) {
            doMenuMigrate();
        }
        // v1.1 拍平存量庫：葉子升頂級、解除歷史分組及其 admin 授權；條件化寫入，重放無害
        if (!versionTracker.applyOnce(VERSION_MENU_V11, this::doMenuFlatten, this::verifyMenuFlatten)) {
            doMenuFlatten();
        }
        // v1.2 新增閱讀統計看板菜單；任務冪等，重放無害
        if (!versionTracker.applyOnce(VERSION_MENU_V12, this::doMenuMigrate, this::verifyMenus)) {
            doMenuMigrate();
        }
        // v1.3 新增學習路徑菜單；任務冪等，重放無害
        if (!versionTracker.applyOnce(VERSION_MENU_V13, this::doMenuMigrate, this::verifyMenus)) {
            doMenuMigrate();
        }
    }

    /* ==================== 1. 表結構 ==================== */

    private void doSchemaMigrate() {
        int executed = executeScript(SCHEMA_SCRIPT);
        log.info("文檔中心建表腳本已執行: {} 條語句（{}）", executed, SCHEMA_SCRIPT);
    }

    private void doLearningSchema() {
        int executed = executeScript(SCHEMA_SCRIPT_LEARNING);
        log.info("學習路徑建表腳本已執行: {} 條語句（{}）", executed, SCHEMA_SCRIPT_LEARNING);
    }

    private void verifyLearningSchema() {
        for (String table : LEARNING_TABLES) {
            if (!tableExists(table)) {
                throw new IllegalStateException(table + " 表未就緒，學習路徑無法寫入");
            }
        }
        if (!columnExists("doc_learning_path", "status") || !columnExists("doc_learning_path_item", "path_id")) {
            throw new IllegalStateException("學習路徑實體依賴列缺失（status / path_id）");
        }
    }

    private void verifySchema() {
        for (String table : TABLES) {
            if (!tableExists(table)) {
                throw new IllegalStateException(table + " 表未就緒，文檔中心無法寫入");
            }
        }
        for (String[] col : REQUIRED_COLUMNS) {
            if (!columnExists(col[0], col[1])) {
                throw new IllegalStateException(col[0] + "." + col[1] + " 列缺失");
            }
        }
    }

    /* ==================== 2. 空間種子 ==================== */

    /** 只在空表時種入：管理員刪過空間的庫不復種，避免啟動重放「复活」被刪數據 */
    private void doSeedSpaces() {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM doc_space WHERE deleted = 0", Integer.class);
        if (count != null && count > 0) {
            log.info("doc_space 已有 {} 行，跳過默認空間種子", count);
            return;
        }
        for (String[] s : SEED_SPACES) {
            jdbcTemplate.update(
                    "INSERT INTO doc_space (name, icon, sort_order, description, created_by, updated_by, deleted) "
                            + "VALUES (?, ?, ?, ?, 'system', 'system', 0)",
                    s[0], s[1], Integer.parseInt(s[2]), s[3]);
        }
        log.info("已種入 {} 個默認知識空間", SEED_SPACES.length);
    }

    private void verifySpaces() {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM doc_space WHERE deleted = 0", Integer.class);
        if (count == null || count < SEED_SPACES.length) {
            throw new IllegalStateException("默認知識空間未就緒: 實際 " + count + "，期望 >= " + SEED_SPACES.length);
        }
    }

    /* ==================== 3. 菜單種子 ==================== */

    private void doMenuMigrate() {
        // 扁平形態（v1.1 定稿）：葉子直接掛 doc 系統頂級，不再創建分組。
        // 字面量逐條調用：scripts/check-menu-consistency.mjs 的正則只識別 ensureMenu 字面量形態
        ensureMenu(null, DocConstants.MENU_LIBRARY, "文檔庫", "/doc-center",
                "DocCenter", "FileTextOutlined", 1, DocConstants.ACTIONS_VIEW_EDIT, "Document Library");
        ensureMenu(null, DocConstants.MENU_SPACE, "空間管理", "/doc-space",
                "DocSpaceManage", "AppstoreAddOutlined", 2, DocConstants.ACTIONS_VIEW_EDIT, "Space Management");
        ensureMenu(null, DocConstants.MENU_STATS, "閱讀統計", "/doc-stats",
                "DocStats", "BarChartOutlined", 3, DocConstants.ACTIONS_VIEW, "Reading Statistics");
        ensureMenu(null, DocConstants.MENU_LEARNING, "學習路徑", "/doc-learning",
                "DocLearning", "FlagOutlined", 4, DocConstants.ACTIONS_VIEW_EDIT, "Learning Paths");

        grantAdmin();
        deriveSystemAccess();
        permissionService.evictAll();
        log.info("文檔中心菜單已就緒（4 個頂級菜單，system_code={}）", SYSTEM_CODE);
    }

    /** v1.1：存量庫拍平——葉子升頂級，解除歷史分組及其 admin 授權（條件化寫入，重放無害） */
    private void doMenuFlatten() {
        int moved = jdbcTemplate.update(
                "UPDATE sys_menu SET parent_id = NULL, updated_by = 'system' "
                        + "WHERE menu_key IN (?, ?) AND deleted = 0 AND parent_id IS NOT NULL",
                DocConstants.MENU_LIBRARY, DocConstants.MENU_SPACE);
        Long legacyId = queryMenuId(DocConstants.LEGACY_MENU_GROUP);
        if (legacyId != null) {
            jdbcTemplate.update("DELETE FROM sys_role_menu WHERE menu_id = ?", legacyId);
            jdbcTemplate.update("UPDATE sys_menu SET deleted = 1, updated_by = 'system' WHERE id = ?", legacyId);
        }
        permissionService.evictAll();
        if (moved > 0 || legacyId != null) {
            log.info("文檔中心菜單拍平完成：{} 個葉子升頂級，歷史分組解除={}", moved, legacyId != null);
        }
    }

    /**
     * 新增或對齊葉子菜單。方法名與參數序刻意與 Attendance/Meeting 初始化器一致：
     * check-menu-consistency.mjs 按這個簽名反射掃描菜單聲明並逐項要求前端登記對齊。
     */
    private Long ensureMenu(Long parentId, String menuKey, String name, String path,
                            String component, String icon, int sortOrder, String actions,
                            String nameEn) {
        Long id = queryMenuId(menuKey);
        if (id == null) {
            jdbcTemplate.update("DELETE FROM sys_menu WHERE menu_key = ? AND deleted = 1", menuKey);
            jdbcTemplate.update(
                    "INSERT INTO sys_menu (parent_id, menu_key, name, name_en, path, component, icon, type, "
                            + "sort_order, actions, status, system_code, updated_by, deleted) "
                            + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 'system', 0)",
                    parentId, menuKey, name, nameEn, path, component, icon,
                    MENU_TYPE_LEAF, sortOrder, actions, SYSTEM_CODE);
            log.info("已創建文檔中心菜單: {} ({})", name, menuKey);
            return queryMenuId(menuKey);
        }
        jdbcTemplate.update(
                "UPDATE sys_menu SET parent_id = ?, path = ?, component = ?, icon = ?, system_code = ?, "
                        + "sort_order = ?, status = 1, deleted = 0, updated_by = 'system' WHERE id = ?",
                parentId, path, component, icon, SYSTEM_CODE, sortOrder, id);
        jdbcTemplate.update("UPDATE sys_menu SET name_en = ? WHERE id = ? AND (name_en IS NULL OR name_en = '')",
                nameEn, id);
        return id;
    }

    /** admin 授權：actions 為空時前端受控菜單會整項隱藏，超管也看不到入口 */
    private void grantAdmin() {
        Long adminRoleId = queryAdminRoleId();
        if (adminRoleId == null) {
            log.warn("admin 角色不存在，跳過文檔中心菜單授權");
            return;
        }
        upsertGrant(adminRoleId, DocConstants.MENU_LIBRARY, DocConstants.ACTIONS_VIEW_EDIT);
        upsertGrant(adminRoleId, DocConstants.MENU_SPACE, DocConstants.ACTIONS_VIEW_EDIT);
        upsertGrant(adminRoleId, DocConstants.MENU_STATS, DocConstants.ACTIONS_VIEW);
        upsertGrant(adminRoleId, DocConstants.MENU_LEARNING, DocConstants.ACTIONS_VIEW_EDIT);
    }

    /** 兩步寫（INSERT IGNORE + 補空 UPDATE）：MySQL 8 的 INSERT...SELECT + ON DUPLICATE 會報 1052 */
    private void upsertGrant(Long roleId, String menuKey, String actions) {
        Long menuId = queryMenuId(menuKey);
        if (menuId == null) {
            throw new IllegalStateException("菜單落地後仍查不到 menu_key=" + menuKey);
        }
        jdbcTemplate.update(
                "INSERT IGNORE INTO sys_role_menu (role_id, menu_id, actions) VALUES (?, ?, ?)",
                roleId, menuId, actions);
        jdbcTemplate.update(
                "UPDATE sys_role_menu SET actions = ? WHERE role_id = ? AND menu_id = ? "
                        + "AND (actions IS NULL OR actions = '' OR actions = '[]')",
                actions, roleId, menuId);
    }

    /** 菜單授權與系統准入是兩條線：缺系統準入門戶剪枝會丟整棵子樹 */
    private void deriveSystemAccess() {
        jdbcTemplate.update(
                "INSERT IGNORE INTO sys_role_system (role_id, system_code) "
                        + "SELECT DISTINCT rm.role_id, ? FROM sys_role_menu rm "
                        + "JOIN sys_menu m ON m.id = rm.menu_id AND m.deleted = 0 AND m.system_code = ? "
                        + "JOIN sys_role r ON r.id = rm.role_id AND r.deleted = 0 AND r.status = 1 "
                        + "WHERE r.code <> ?",
                SYSTEM_CODE, SYSTEM_CODE, ADMIN_ROLE_CODE);
        jdbcTemplate.update(
                "INSERT IGNORE INTO sys_department_system (dept_id, system_code) "
                        + "SELECT DISTINCT dm.dept_id, ? FROM sys_department_menu dm "
                        + "JOIN sys_menu m ON m.id = dm.menu_id AND m.deleted = 0 AND m.system_code = ?",
                SYSTEM_CODE, SYSTEM_CODE);
    }

    private void verifyMenus() {
        List<String> missing = new ArrayList<>();
        for (String key : List.of(DocConstants.MENU_LIBRARY, DocConstants.MENU_SPACE,
                DocConstants.MENU_STATS, DocConstants.MENU_LEARNING)) {
            Integer ok = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM sys_menu WHERE menu_key = ? AND deleted = 0 AND status = 1 "
                            + "AND system_code = ? AND parent_id IS NULL AND type = ?",
                    Integer.class, key, SYSTEM_CODE, MENU_TYPE_LEAF);
            if (ok == null || ok == 0) {
                missing.add(key);
            }
        }
        if (!missing.isEmpty()) {
            throw new IllegalStateException("文檔中心菜單未就緒（缺失/頂級/歸屬/啟用態不符）: " + missing);
        }
        Integer grants = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_role_menu rm JOIN sys_role r ON r.id = rm.role_id AND r.code = ? "
                        + "JOIN sys_menu m ON m.id = rm.menu_id AND m.system_code = ? AND m.deleted = 0",
                Integer.class, ADMIN_ROLE_CODE, SYSTEM_CODE);
        if (grants == null || grants < 4) {
            throw new IllegalStateException("admin 角色未補齊文檔中心菜單授權: 實際 " + grants + " 條，期望 >= 4");
        }
    }

    private void verifyMenuFlatten() {
        verifyMenus();
        Integer legacy = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_menu WHERE menu_key = ? AND deleted = 0",
                Integer.class, DocConstants.LEGACY_MENU_GROUP);
        if (legacy != null && legacy > 0) {
            throw new IllegalStateException("歷史分組 doc-center-management 未解除，側邊欄會多出空殼目錄");
        }
    }

    /* ==================== 通用工具 ==================== */

    /** 逐條執行 classpath 腳本；讀不到或執行失敗一律拋出，交 applyOnce 記失敗並在下次啟動重試 */
    private int executeScript(String script) {
        ClassPathResource resource = new ClassPathResource(script);
        if (!resource.exists()) {
            throw new IllegalStateException("找不到建表腳本 " + script + "，文檔中心表無法創建");
        }
        String raw;
        try (InputStream is = resource.getInputStream()) {
            raw = StreamUtils.copyToString(is, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new IllegalStateException("讀取建表腳本失敗 " + script + ": " + e.getMessage(), e);
        }
        int executed = 0;
        for (String stmt : raw.replaceAll("(?m)^\\s*--.*$", "").split(";")) {
            String trimmed = stmt.trim();
            if (!trimmed.isEmpty()) {
                jdbcTemplate.execute(trimmed);
                executed++;
            }
        }
        return executed;
    }

    private boolean tableExists(String table) {
        Integer n = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.TABLES "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?", Integer.class, table);
        return n != null && n > 0;
    }

    private boolean columnExists(String table, String column) {
        Integer n = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.COLUMNS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
                Integer.class, table, column);
        return n != null && n > 0;
    }

    private Long queryMenuId(String menuKey) {
        return jdbcTemplate.queryForList(
                        "SELECT id FROM sys_menu WHERE menu_key = ? AND deleted = 0 LIMIT 1", Long.class, menuKey)
                .stream().findFirst().orElse(null);
    }

    private Long queryAdminRoleId() {
        return jdbcTemplate.queryForList(
                        "SELECT id FROM sys_role WHERE code = ? AND deleted = 0 LIMIT 1", Long.class, ADMIN_ROLE_CODE)
                .stream().findFirst().orElse(null);
    }
}
