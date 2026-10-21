package com.mftb.admin.config;

import com.mftb.admin.service.PermissionService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * HR 入转调离菜单初始化：在「入轉調離」分组下新增 入職管理/轉正管理/調動管理/離職管理 四个二级菜单。
 * <p>
 * 使用 JdbcTemplate 直接操作（与 {@link AiAccessRequestMenuDataInitializer} 同法），幂等：
 * 菜单已存在则跳过插入；admin 角色授权与 system_code 归属每次启动兜底补齐。
 * 排序/图标/英文名由 DataInitializer.reconcileMenuMasterData 每次启动统一自愈。
 * <p>
 * <b>父级不是 hr</b>：v45 已把一级包装目录 {@code hr} 物理退役、子菜单提升为一级，
 * 入轉調離 分组 {@code hr-lifecycle} 成为顶级；旧库（v44 之前）仍是挂在 {@code hr} 下。
 * 因此父级按候选顺序解析，两者都不在时不再直接抛错死循环：菜单的创建与挂载本就由
 * DataInitializer 的菜单种子负责，这里只补建/补授权，缺分组时留给后置校验判定。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class HrLifecycleMenuInitializer implements CommandLineRunner {

    private static final String VERSION_KEY = "hr:lifecycle-menu:v1.0";

    /** admin 角色默认全量动作 */
    private static final String DEFAULT_ACTIONS = "[\"view\",\"create\",\"edit\",\"delete\",\"export\"]";

    /**
     * 父级菜单候选，按顺序取第一个存在的：
     * <ul>
     *   <li>{@code hr-lifecycle}：v45 之后的一级分组「入轉調離」（正常路径）</li>
     *   <li>{@code hr}：v44 之前的「集團人事(HR)」包装目录（存量库兼容）</li>
     * </ul>
     */
    private static final String[] PARENT_MENU_KEYS = {"hr-lifecycle", "hr"};

    /** menuKey → {中文名, 图标, 英文名} */
    private static final String[][] MENUS = {
            {"hr-onboarding", "入職管理", "UserAddOutlined", "Onboarding"},
            {"hr-regularization", "轉正管理", "CheckCircleOutlined", "Regularization"},
            {"hr-transfer", "調動管理", "SwapOutlined", "Transfer"},
            {"hr-dimission", "離職管理", "UserDeleteOutlined", "Dimission"},
    };

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;
    private final PermissionService permissionService;

    @Override
    public void run(String... args) {
        try {
            versionTracker.applyOnce(VERSION_KEY, this::migrate, this::verify);
        } catch (Exception e) {
            log.error("HR入轉調離菜單初始化失敗: {}", e.getMessage(), e);
        }
    }

    private void migrate() {
        Long parentId = resolveParentMenuId();
        if (parentId == null) {
            // 不抛错： hr 已退役是既定结构，缺分组说明菜单种子也没跑起来，
            // 此时抛错只会让版本永不记录、每次启动刷一条 ERROR，掩盖真正的问题。
            log.warn("未找到入轉調離分組(hr-lifecycle)或舊一級目錄(hr)，本次跳過菜單掛載，由菜單種子與後置校驗判定");
        } else {
            for (String[] m : MENUS) {
                Integer exists = jdbcTemplate.queryForObject(
                        "SELECT COUNT(*) FROM sys_menu WHERE menu_key = ? AND deleted = 0", Integer.class, m[0]);
                if (exists != null && exists > 0) {
                    continue;
                }
                // 清理同 key 软删残留，避免唯一键冲突
                jdbcTemplate.update("DELETE FROM sys_menu WHERE menu_key = ? AND deleted = 1", m[0]);
                jdbcTemplate.update(
                        "INSERT INTO sys_menu (parent_id, menu_key, name, icon, type, sort_order, status, deleted) "
                                + "VALUES (?, ?, ?, ?, 2, 99, 1, 0)",
                        parentId, m[0], m[1], m[2]);
                // 英文名仅补空，菜单配置页自定义不覆盖
                jdbcTemplate.update("UPDATE sys_menu SET name_en = ? WHERE menu_key = ?", m[3], m[0]);
                log.info("已創建 HR 入轉調離菜單: {}", m[0]);
            }
        }
        grantAdmin();
        // 菜单/授权落地后 bump revision 并清缓存，保证跨实例菜单快照与新入口同步生效
        permissionService.evictAll();
    }

    /** 按候选顺序解析父级菜单 id；两者都不存在时返回 null */
    private Long resolveParentMenuId() {
        for (String key : PARENT_MENU_KEYS) {
            Long id = jdbcTemplate.queryForList(
                    "SELECT id FROM sys_menu WHERE menu_key = ? AND deleted = 0 LIMIT 1", Long.class, key)
                    .stream().findFirst().orElse(null);
            if (id != null) {
                return id;
            }
        }
        return null;
    }

    /** admin 角色补授全量动作（幂等，每次迁移执行） */
    private void grantAdmin() {
        Long adminRoleId = jdbcTemplate.queryForList(
                "SELECT id FROM sys_role WHERE code = 'admin' LIMIT 1", Long.class)
                .stream().findFirst().orElse(null);
        if (adminRoleId == null) {
            return;
        }
        for (String[] m : MENUS) {
            // 拆为两步：INSERT ... SELECT + ON DUPLICATE 的 VALUES(actions) 在 MySQL 8 仍会报
            // 1052 Column 'actions' in field list is ambiguous（目标表与派生表同列名）。
            // 1) 建关联（已存在则忽略）；2) 仅当 actions 缺失时回填全量动作，不覆盖人工配置
            jdbcTemplate.update(
                    "INSERT IGNORE INTO sys_role_menu (role_id, menu_id, actions) "
                            + "SELECT r.id, m.id, ? FROM sys_role r JOIN sys_menu m ON m.menu_key = ? AND m.deleted = 0 "
                            + "WHERE r.code = 'admin'",
                    DEFAULT_ACTIONS, m[0]);
            // 回填用单表 UPDATE + IN 子查询：MySQL 多表 UPDATE ... JOIN ... SET 在 H2(MODE=MySQL)
            // 下不解析，会让这个初始化器没法用隔离内存库验证父级行为
            jdbcTemplate.update(
                    "UPDATE sys_role_menu SET actions = ? "
                            + "WHERE role_id IN (SELECT id FROM sys_role WHERE code = 'admin') "
                            + "AND menu_id IN (SELECT id FROM sys_menu WHERE menu_key = ? AND deleted = 0) "
                            + "AND (actions IS NULL OR actions = '' OR actions = '[]')",
                    DEFAULT_ACTIONS, m[0]);
        }
    }

    /** 后置校验：四个菜单均已存在；能解析到分组时还必须挂在该分组下 */
    private void verify() {
        Long parentId = resolveParentMenuId();
        for (String[] m : MENUS) {
            Integer count = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM sys_menu WHERE menu_key = ? AND deleted = 0",
                    Integer.class, m[0]);
            if (count == null || count == 0) {
                throw new IllegalStateException("菜單未就緒: " + m[0]);
            }
            if (parentId == null) {
                continue;
            }
            Integer mounted = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM sys_menu WHERE menu_key = ? AND parent_id = ? AND deleted = 0",
                    Integer.class, m[0], parentId);
            if (mounted == null || mounted == 0) {
                throw new IllegalStateException("菜單未掛在入轉調離分組下: " + m[0]);
            }
        }
    }
}
