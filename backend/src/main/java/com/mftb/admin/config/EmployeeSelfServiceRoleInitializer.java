package com.mftb.admin.config;

import com.mftb.admin.constant.SystemCode;
import com.mftb.admin.service.PermissionService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 员工自助角色初始化（Round 6）。
 * <p>
 * 目的：让"没有绑定任何功能角色"的员工也拥有 OA 系统准入 + 流程事项/流程中心 只读菜单，
 * 避免统一门户 Round 3 引入系统准入后，普通员工"能登录但看不到任何系统卡片"的断链。
 * <p>
 * 语义与 {@code EmployeeServiceImpl.create} 的新员工默认绑定协同：
 * <ul>
 *   <li>本 initializer 只保证角色 + 菜单 + 系统准入存在，且幂等；</li>
 *   <li>新员工创建时如果 functionRoleIds 为空，自动绑定本角色；已绑其他角色的不覆盖；</li>
 *   <li>已存在的员工不被批量回填本角色（避免误授予本来"无系统"的账号），
 *       由业务/HR 按需在权限中心调整绑定。</li>
 * </ul>
 * 版本键 {@code iam:employee-self-service-role:v1.0}。
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(18)
public class EmployeeSelfServiceRoleInitializer implements CommandLineRunner {

    private static final String VERSION_KEY = "iam:employee-self-service-role:v1.0";
    /** 内置角色编码：EmployeeServiceImpl.create 通过该编码定位并默认绑定 */
    public static final String ROLE_CODE = "employee_self_service";
    private static final String ROLE_NAME = "員工自助";
    private static final String ROLE_DESC = "统一门户默认基底角色：仅授予 OA 系统准入与流程事项/流程中心只读；新员工创建时若无其他角色则自动绑定。";

    /** 授予只读的菜单清单（未来扩充只需追加此处，不需要新 versionKey；仅当需要 bump 语义时递增版本） */
    private static final List<String> READONLY_MENU_KEYS = List.of(
            "oa-requests",
            "process-center"
    );

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;
    private final PermissionService permissionService;

    @Override
    public void run(String... args) {
        versionTracker.applyOnce(VERSION_KEY, this::doMigrate, this::verifyMigration);
    }

    private void doMigrate() {
        // 1. 角色（幂等：按 code 查询，缺失则插入；存在则对齐 name/description/status）
        Long roleId = queryRoleIdByCode(ROLE_CODE);
        if (roleId == null) {
            jdbcTemplate.update(
                    "INSERT INTO sys_role (code, name, description, status, updated_by, deleted) "
                            + "VALUES (?, ?, ?, 1, 'system', 0)",
                    ROLE_CODE, ROLE_NAME, ROLE_DESC);
            roleId = queryRoleIdByCode(ROLE_CODE);
        } else {
            jdbcTemplate.update(
                    "UPDATE sys_role SET name = ?, description = ?, status = 1, deleted = 0 WHERE id = ?",
                    ROLE_NAME, ROLE_DESC, roleId);
        }
        if (roleId == null) {
            throw new IllegalStateException("员工自助角色创建失败: code=" + ROLE_CODE);
        }

        // 2. 系统准入：仅 OA
        jdbcTemplate.update(
                "INSERT IGNORE INTO sys_role_system (role_id, system_code) VALUES (?, ?)",
                roleId, SystemCode.OA.code());

        // 3. 菜单授权：READONLY_MENU_KEYS 中每个存在的菜单授予 view
        for (String menuKey : READONLY_MENU_KEYS) {
            Long menuId = queryMenuIdByKey(menuKey);
            if (menuId == null) {
                log.warn("员工自助角色跳过菜单授权（菜单不存在）: {}", menuKey);
                continue;
            }
            jdbcTemplate.update(
                    "INSERT INTO sys_role_menu (role_id, menu_id, actions) VALUES (?, ?, ?) "
                            + "ON DUPLICATE KEY UPDATE actions = VALUES(actions)",
                    roleId, menuId, "[\"view\"]");
        }
        // 4. 菜单/角色/授权变更 → 递增 revision
        permissionService.evictAll();
        log.info("员工自助角色已就绪: code={}, roleId={}, system={}, menus={}",
                ROLE_CODE, roleId, SystemCode.OA.code(), READONLY_MENU_KEYS);
    }

    private void verifyMigration() {
        Long roleId = queryRoleIdByCode(ROLE_CODE);
        if (roleId == null) {
            throw new IllegalStateException("员工自助角色未落地: code=" + ROLE_CODE);
        }
        Integer accessCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_role_system WHERE role_id = ? AND system_code = ?",
                Integer.class, roleId, SystemCode.OA.code());
        if (accessCount == null || accessCount == 0) {
            throw new IllegalStateException("员工自助角色未绑定 OA 系统准入");
        }
    }

    private Long queryRoleIdByCode(String code) {
        List<Long> ids = jdbcTemplate.queryForList(
                "SELECT id FROM sys_role WHERE code = ? AND deleted = 0 LIMIT 1",
                Long.class, code);
        return ids.isEmpty() ? null : ids.get(0);
    }

    private Long queryMenuIdByKey(String key) {
        List<Long> ids = jdbcTemplate.queryForList(
                "SELECT id FROM sys_menu WHERE menu_key = ? AND deleted = 0 LIMIT 1",
                Long.class, key);
        return ids.isEmpty() ? null : ids.get(0);
    }
}
