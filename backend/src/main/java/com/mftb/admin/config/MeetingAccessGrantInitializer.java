package com.mftb.admin.config;

import com.mftb.admin.constant.MeetingConstants;
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
 * 会议管理「使用侧」全员基线授权：让普通员工在统一门户里进得了會議管理系統、
 * 能看到自己的会并预约会议室。
 *
 * <p>为什么必须做：菜单种子（{@code meeting:menu:*}）只把五个菜单授给内置 admin 角色，
 * 而会议系统的真实主体是全员 —— 没有基线授权时，25 名员工点开门户卡片就是 403/空白，
 * 「数据配置到业务跑通」断在权限这一环。做法与 {@code RdmAccessGrantInitializer} 同法：
 * 授到<b>所有启用角色 + 所有有效部门</b>，而不是只授 {@code employee_self_service} 基底角色
 * （存量员工多数没有绑功能角色，他们的权限来自部门授权那条线，只授基底角色等于只有新人能用）。
 *
 * <p><b>只铺使用侧三张</b>：{@code meeting-management}（會議中心分组）/ {@code meeting-my} /
 * {@code meeting-booking}。治理侧的 {@code meeting-room}、{@code meeting-record}、
 * {@code meeting-config} 一律不自动授 —— 会议室档案影响所有房间、预约规则影响全站口径、
 * 预约记录是跨人可见性，这些必须由管理员在「授權中心 · 功能授權」按角色勾选。
 *
 * <p><b>使用侧为什么敢给 edit</b>：写入口都有服务端资源级守卫，不是靠菜单动作兜底 ——
 * {@code MeetingAccessGuard} 把非行政视野的列表一律收敛到与自己相关的单，
 * 变更/取消要求「组织者或行政」，详情按相关人校验（IDOR 拒绝），
 * 因此多授一个 edit 不会让员工改到别人的会，只会让他能订自己的会。
 *
 * <p><b>不扩权、只补空</b>：已存在且非空的授权集一律不动（哪怕它比基线窄）。管理员在
 * 授权中心把某角色的 meeting-booking 收成只 view，是一次“这个角色不能自己订会”的
 * 主动决策，启动重放把它扩回 edit 就是静默扩权。行不存在时补整行基线（误删自愈），
 * actions 为 NULL/空串/空数组时填默认值（授权中心建了行但没选动作的中间态）；
 * 基线将来真要往上加动作，另开一个版本键做定向补齐（考勤日报动作集 v1.1 同法）。
 * 拿掉一个角色对会议系统的使用权，请关系统准入或行级授权，不是改动作集。
 *
 * <p>菜单授权与系统准入是两条独立线：只有菜单没有 {@code sys_role_system} /
 * {@code sys_department_system} 时，门户导航剪枝会整棵子树丢掉（菜单静默消失比报错更难查）。
 *
 * <p><b>启动顺序</b>：取 29，必须晚于 {@code MeetingSchemaMigrationInitializer(@Order 28)}
 * —— 菜单行没落地就授权等于往不存在的 menu_id 写行。
 *
 * <p>版本键 {@code meeting:access-grant:v1.0}；与其他基线初始化器一样每次启动重放自愈
 * （新建部门、新建角色、授权中心误删都能在下一次启动补回），代价是管理员若想
 * <b>长期</b>禁止某角色使用会议系统，必须停用该系统准入而不是删菜单行。
 */
@Slf4j
@Component
@Order(29)
@RequiredArgsConstructor
public class MeetingAccessGrantInitializer implements CommandLineRunner {

    static final String VERSION_KEY = "meeting:access-grant:v1.0";

    private static final String SYSTEM_CODE = SystemCode.MEETING.code();

    /**
     * 使用侧分组 menu_key。
     * <p>分组行由 {@code meeting:menu:v1.0} 建立、{@code meeting:menu:v1.2} 更名为「會議中心」，
     * 刻意复用同一行不换新 key：换 key 等于换 menu_id，已授权的角色/部门全都要重铺一遍。
     */
    private static final String MENU_GROUP_USAGE = "meeting-management";

    /**
     * 全员基线菜单：menu_key → 动作集。
     * <p>meeting-my 带 edit 是「接受/拒绝邀约」与「签到」的入口（控制器标的是 MY:edit），
     * meeting-booking 带 edit 是「新建/变更/取消预约」的入口（BOOKING:edit）。
     */
    private static final Map<String, String> BASELINE_MENUS = new LinkedHashMap<>();

    static {
        BASELINE_MENUS.put(MENU_GROUP_USAGE, "[\"view\"]");
        BASELINE_MENUS.put(MeetingConstants.MENU_MY, "[\"view\",\"edit\"]");
        BASELINE_MENUS.put(MeetingConstants.MENU_BOOKING, "[\"view\",\"edit\"]");
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
        Map<String, Long> menuIds = new LinkedHashMap<>();
        for (String menuKey : BASELINE_MENUS.keySet()) {
            Long menuId = jdbcTemplate.queryForList(
                            "SELECT id FROM sys_menu WHERE menu_key = ? AND deleted = 0 AND status = 1 LIMIT 1",
                            Long.class, menuKey)
                    .stream().findFirst().orElse(null);
            if (menuId == null) {
                throw new IllegalStateException("會議菜單未就緒，無法授權: " + menuKey);
            }
            menuIds.put(menuKey, menuId);
        }

        List<Long> roleIds = jdbcTemplate.queryForList(
                "SELECT id FROM sys_role WHERE deleted = 0 AND status = 1", Long.class);
        List<Long> deptIds = jdbcTemplate.queryForList(
                "SELECT id FROM sys_department WHERE deleted = 0 AND status = 1", Long.class);
        if (roleIds.isEmpty() && deptIds.isEmpty()) {
            log.warn("無任何啟用角色與有效部門，跳過會議基線授權");
            return;
        }

        int granted = 0;
        int filled = 0;
        for (Long roleId : roleIds) {
            granted += grantTargets("sys_role_menu", "role_id", roleId, menuIds);
            filled += fillBlankActions("sys_role_menu", "role_id", roleId, menuIds);
            // 系统准入与菜单授权分两次写：INSERT IGNORE 只在缺行时补，
            // 管理员在门户里关掉整个系统的准入不会被重放顶回去（那是有意的停用动作）
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
        log.info("會議使用側基線授權完成: roles={}, departments={}, 新建={} 條, 補空動作={} 條, menus={}",
                roleIds.size(), deptIds.size(), granted, filled, BASELINE_MENUS.keySet());
    }

    /**
     * 给一个授权目标（角色或部门）补写缺失的基线授权行。
     *
     * @return 新建行数
     */
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

    /**
     * 动作集为空的授权行填上基线默认值（与 AttendanceMenuInitializer 同法）。
     * <p>非空一律不动：那可能是管理员主动收窄的结果，把它扩回基线就是静默扩权。
     *
     * @return 填默认值的行数
     */
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
        for (Map.Entry<String, String> entry : BASELINE_MENUS.entrySet()) {
            String menuKey = entry.getKey();
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
            throw new IllegalStateException("尚有 " + noRoleAccess + " 個啟用角色缺少 meeting 系統准入");
        }
        Integer noDeptAccess = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_department d WHERE d.deleted = 0 AND d.status = 1 AND NOT EXISTS ("
                        + "SELECT 1 FROM sys_department_system ds WHERE ds.dept_id = d.id AND ds.system_code = ?)",
                Integer.class, SYSTEM_CODE);
        if (noDeptAccess != null && noDeptAccess > 0) {
            throw new IllegalStateException("尚有 " + noDeptAccess + " 個有效部門缺少 meeting 系統准入");
        }
        // 治理侧三张菜单「没有被铺给全员」这条不变量放在单测里钉，不做运行时断言：
        // 管理员完全有权把「會議室檔案」授给自建的综合岗位角色，
        // 那样一次正常配置会让后续全新环境在启动期直接崩掉（比漏授权更难查）。
    }
}
