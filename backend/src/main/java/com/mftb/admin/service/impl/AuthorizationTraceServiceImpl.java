package com.mftb.admin.service.impl;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.EmpPermissionTraceVO;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.AuthorizationTraceService;
import com.mftb.admin.util.JsonUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowCallbackHandler;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 员工权限透视实现（只读诊断，不复用 PermissionServiceImpl 的缓存快照，
 * 以便逐条还原"来源"）。生效规则与运行时一致：启用角色 ∪ 有效部门，仅启用菜单。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AuthorizationTraceServiceImpl implements AuthorizationTraceService {

    private static final String SUPER_ADMIN_ROLE = "admin";
    /** 来源标签前缀：与授权中心前端页面繁体文案风格对齐（前端按「角色」前缀区分颜色） */
    private static final String SOURCE_PREFIX_ROLE = "角色:";
    private static final String SOURCE_PREFIX_DEPT = "部門:";

    private final JdbcTemplate jdbcTemplate;
    private final SysUserMapper sysUserMapper;

    @Override
    public EmpPermissionTraceVO trace(Long userId) {
        if (userId == null) {
            throw new BusinessException("員工 ID 不能為空");
        }
        SysUser user = sysUserMapper.selectById(userId);
        if (user == null) {
            throw new BusinessException("員工不存在: " + userId);
        }
        EmpPermissionTraceVO vo = new EmpPermissionTraceVO();
        vo.setUserId(user.getId());
        vo.setUsername(user.getUsername());
        vo.setName(user.getName());
        vo.setDepartmentName(user.getDepartment());

        final boolean builtinAdmin = SUPER_ADMIN_ROLE.equalsIgnoreCase(user.getRole());

        // 绑定角色摘要
        List<Long> roleIds = JsonUtils.parseLongList(user.getFunctionRoles());
        List<EmpPermissionTraceVO.TraceRole> roles = new ArrayList<>();
        if (!roleIds.isEmpty()) {
            String in = inClause(roleIds);
            roles = jdbcTemplate.query(
                    "SELECT id, name, code, status FROM sys_role WHERE id IN (" + in + ") AND deleted = 0 ORDER BY id",
                    (rs, n) -> {
                        EmpPermissionTraceVO.TraceRole r = new EmpPermissionTraceVO.TraceRole();
                        r.setId(rs.getLong("id"));
                        r.setName(rs.getString("name"));
                        r.setCode(rs.getString("code"));
                        r.setStatus(rs.getInt("status"));
                        return r;
                    });
        }
        // 绑定启用的 admin 角色 → 超管直通（与 PermissionServiceImpl 判定一致）
        boolean adminRoleBound = roles.stream().anyMatch(r ->
                SUPER_ADMIN_ROLE.equalsIgnoreCase(r.getCode()) && Integer.valueOf(1).equals(r.getStatus()));
        boolean superAdmin = builtinAdmin || adminRoleBound;
        vo.setRoles(roles);
        vo.setSuperAdmin(superAdmin);
        if (superAdmin) {
            // 超管拥有全部权限，明细不逐项展开（前端按超管提示展示）
            vo.setSystems(List.of());
            vo.setMenus(List.of());
            return vo;
        }

        // 菜单动作并集（menuKey → TraceMenu，保序）
        Map<String, EmpPermissionTraceVO.TraceMenu> menuMap = new LinkedHashMap<>();
        // 系统准入并集（code → TraceSystem，保序）
        Map<String, EmpPermissionTraceVO.TraceSystem> systemMap = new LinkedHashMap<>();

        // 角色通道
        collectRoleMenus(roleIds, menuMap);
        collectRoleSystems(roleIds, systemMap);
        // 部门通道
        collectDeptMenus(user.getDepartmentId(), menuMap);
        collectDeptSystems(user.getDepartmentId(), systemMap);

        vo.setMenus(sortMenus(menuMap.values()));
        vo.setSystems(new ArrayList<>(systemMap.values()));
        return vo;
    }

    private void collectRoleMenus(List<Long> roleIds, Map<String, EmpPermissionTraceVO.TraceMenu> menuMap) {
        if (roleIds.isEmpty()) {
            return;
        }
        String in = inClause(roleIds);
        jdbcTemplate.query(
                "SELECT r.name AS role_name, m.menu_key, m.name AS menu_name, m.name_en, "
                        + "m.system_code, m.sort_order, rm.actions "
                        + "FROM sys_role_menu rm "
                        + "JOIN sys_role r ON rm.role_id = r.id AND r.deleted = 0 AND r.status = 1 "
                        + "JOIN sys_menu m ON rm.menu_id = m.id AND m.deleted = 0 AND m.status = 1 "
                        + "WHERE rm.role_id IN (" + in + ")",
                rs -> {
                    mergeMenu(menuMap, rs.getString("menu_key"), rs.getString("menu_name"),
                            rs.getString("name_en"), rs.getString("system_code"), rs.getInt("sort_order"),
                            rs.getString("actions"), SOURCE_PREFIX_ROLE + rs.getString("role_name"));
                });
    }

    private void collectDeptMenus(Long deptId, Map<String, EmpPermissionTraceVO.TraceMenu> menuMap) {
        if (deptId == null) {
            return;
        }
        jdbcTemplate.query(
                "SELECT d.name AS dept_name, m.menu_key, m.name AS menu_name, m.name_en, "
                        + "m.system_code, m.sort_order, dm.actions "
                        + "FROM sys_department_menu dm "
                        + "JOIN sys_department d ON dm.dept_id = d.id AND d.deleted = 0 AND d.status = 1 "
                        + "JOIN sys_menu m ON dm.menu_id = m.id AND m.deleted = 0 AND m.status = 1 "
                        + "WHERE dm.dept_id = ?",
                rs -> {
                    mergeMenu(menuMap, rs.getString("menu_key"), rs.getString("menu_name"),
                            rs.getString("name_en"), rs.getString("system_code"), rs.getInt("sort_order"),
                            rs.getString("actions"), SOURCE_PREFIX_DEPT + rs.getString("dept_name"));
                },
                deptId);
    }

    private void mergeMenu(Map<String, EmpPermissionTraceVO.TraceMenu> menuMap, String menuKey,
                           String menuName, String menuNameEn, String systemCode, int sort,
                           String actionsJson, String source) {
        if (!StringUtils.hasText(menuKey)) {
            return;
        }
        EmpPermissionTraceVO.TraceMenu menu = menuMap.computeIfAbsent(menuKey, k -> {
            EmpPermissionTraceVO.TraceMenu m = new EmpPermissionTraceVO.TraceMenu();
            m.setMenuKey(k);
            m.setMenuName(menuName);
            m.setMenuNameEn(menuNameEn);
            m.setSystemCode(systemCode);
            m.setSort(sort);
            m.setActions(new ArrayList<>());
            m.setSources(new ArrayList<>());
            return m;
        });
        Set<String> actions = new LinkedHashSet<>(menu.getActions());
        List<String> incoming = JsonUtils.parseStringList(actionsJson);
        actions.addAll(incoming.isEmpty() ? List.of("view") : incoming);
        menu.setActions(new ArrayList<>(actions));
        Set<String> sources = new LinkedHashSet<>(menu.getSources());
        sources.add(source);
        menu.setSources(new ArrayList<>(sources));
    }

    private List<EmpPermissionTraceVO.TraceMenu> sortMenus(Iterable<EmpPermissionTraceVO.TraceMenu> menus) {
        List<EmpPermissionTraceVO.TraceMenu> list = new ArrayList<>();
        menus.forEach(list::add);
        // systemCode 空值排最后，其次按 sort，再按 menuKey 稳定排序
        list.sort((a, b) -> {
            int cmp = compareNullableStr(a.getSystemCode(), b.getSystemCode());
            if (cmp != 0) {
                return cmp;
            }
            int sa = a.getSort() == null ? 0 : a.getSort();
            int sb = b.getSort() == null ? 0 : b.getSort();
            if (sa != sb) {
                return Integer.compare(sa, sb);
            }
            return a.getMenuKey().compareTo(b.getMenuKey());
        });
        return list;
    }

    private void collectRoleSystems(List<Long> roleIds, Map<String, EmpPermissionTraceVO.TraceSystem> systemMap) {
        if (roleIds.isEmpty()) {
            return;
        }
        String in = inClause(roleIds);
        jdbcTemplate.query(
                "SELECT r.name AS role_name, s.code, s.name, s.sort_order FROM sys_role_system rs "
                        + "JOIN sys_role r ON rs.role_id = r.id AND r.deleted = 0 AND r.status = 1 "
                        + "JOIN sys_system s ON s.code = rs.system_code AND s.deleted = 0 AND s.status = 1 "
                        + "WHERE rs.role_id IN (" + in + ") ORDER BY s.sort_order, s.code",
                new RowCallbackHandler() {
                    @Override
                    public void processRow(java.sql.ResultSet rs) throws java.sql.SQLException {
                        mergeSystem(systemMap, rs.getString("code"), rs.getString("name"),
                                SOURCE_PREFIX_ROLE + rs.getString("role_name"));
                    }
                });
    }

    private void collectDeptSystems(Long deptId, Map<String, EmpPermissionTraceVO.TraceSystem> systemMap) {
        if (deptId == null) {
            return;
        }
        jdbcTemplate.query(
                "SELECT d.name AS dept_name, s.code, s.name, s.sort_order FROM sys_department_system ds "
                        + "JOIN sys_department d ON ds.dept_id = d.id AND d.deleted = 0 AND d.status = 1 "
                        + "JOIN sys_system s ON s.code = ds.system_code AND s.deleted = 0 AND s.status = 1 "
                        + "WHERE ds.dept_id = ? ORDER BY s.sort_order, s.code",
                new RowCallbackHandler() {
                    @Override
                    public void processRow(java.sql.ResultSet rs) throws java.sql.SQLException {
                        mergeSystem(systemMap, rs.getString("code"), rs.getString("name"),
                                SOURCE_PREFIX_DEPT + rs.getString("dept_name"));
                    }
                },
                deptId);
    }

    private void mergeSystem(Map<String, EmpPermissionTraceVO.TraceSystem> map,
                             String code, String name, String source) {
        EmpPermissionTraceVO.TraceSystem sys = map.computeIfAbsent(code, k -> {
            EmpPermissionTraceVO.TraceSystem s = new EmpPermissionTraceVO.TraceSystem();
            s.setCode(k);
            s.setName(name);
            s.setSources(new ArrayList<>());
            return s;
        });
        Set<String> sources = new LinkedHashSet<>(sys.getSources());
        sources.add(source);
        sys.setSources(new ArrayList<>(sources));
    }

    private int compareNullableStr(String a, String b) {
        if (a == null && b == null) {
            return 0;
        }
        if (a == null) {
            return 1;
        }
        if (b == null) {
            return -1;
        }
        return a.compareTo(b);
    }

    private String inClause(List<Long> ids) {
        return ids.stream().map(String::valueOf).collect(Collectors.joining(","));
    }
}
