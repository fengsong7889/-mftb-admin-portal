package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.DepartmentRequest;
import com.mftb.admin.dto.DepartmentVO;
import com.mftb.admin.dto.MenuPermissionDTO;
import com.mftb.admin.entity.SysDepartment;
import com.mftb.admin.entity.SysDepartmentMenu;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.SysDepartmentMapper;
import com.mftb.admin.mapper.SysDepartmentMenuMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.DepartmentService;
import com.mftb.admin.service.PermissionService;
import com.mftb.admin.service.TranslationService;
import com.mftb.admin.util.JsonUtils;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.CollectionUtils;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

/**
 * 集团组织架构-部门服务实现
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DepartmentServiceImpl implements DepartmentService {

    private final SysDepartmentMapper sysDepartmentMapper;
    private final SysDepartmentMenuMapper sysDepartmentMenuMapper;
    private final SysUserMapper sysUserMapper;
    private final OperatorResolver operatorResolver;
    private final JdbcTemplate jdbcTemplate;
    private final PermissionService permissionService;
    private final TranslationService translationService;

    /** 部门编码前缀: MT + 5位自增序号 */
    private static final String DEPT_CODE_PREFIX = "MT";

    @Override
    public List<DepartmentVO> list() {
        List<SysDepartment> departments = sysDepartmentMapper.selectList(
                new LambdaQueryWrapper<SysDepartment>()
                        .orderByAsc(SysDepartment::getSort)
                        .orderByAsc(SysDepartment::getId));
        // 上级部门名称映射
        Map<Long, String> nameMap = new HashMap<>();
        departments.forEach(d -> nameMap.put(d.getId(), d.getName()));
        // 各部门在编人数
        Map<Long, Long> countMap = new HashMap<>();
        for (SysUser user : sysUserMapper.selectList(null)) {
            if (user.getDepartmentId() != null) {
                countMap.merge(user.getDepartmentId(), 1L, Long::sum);
            }
        }
        Map<Long, List<MenuPermissionDTO>> permissionsMap = loadPermissionsMap(
                departments.stream().map(SysDepartment::getId).toList());
        return departments.stream()
                .map(d -> DepartmentVO.from(d, nameMap.get(d.getParentId()),
                        countMap.getOrDefault(d.getId(), 0L),
                        permissionsMap.getOrDefault(d.getId(), List.of())))
                .toList();
    }

    @Override
    public DepartmentVO create(DepartmentRequest request) {
        // 部门编码由系统自动生成 (MT + 5位自增), 不接受前端传入
        String code = generateDeptCode();
        if (request.getParentId() != null) {
            requireDept(request.getParentId());
        }
        SysDepartment dept = new SysDepartment();
        dept.setCode(code);
        dept.setName(request.getName().trim());
        dept.setNameEn(request.getNameEn() != null ? request.getNameEn().trim() : null);
        dept.setParentId(request.getParentId());
        dept.setLeader(request.getLeader());
        dept.setPermissions("[]");
        dept.setStatus(1);
        dept.setSort(request.getSort() == null ? 0 : request.getSort());
        dept.setDeleted(0);
        dept.setUpdatedBy(operatorResolver.currentOperatorName());
        sysDepartmentMapper.insert(dept);
        return DepartmentVO.from(dept, null, 0L, List.of());
    }

    @Override
    public DepartmentVO update(Long id, DepartmentRequest request) {
        SysDepartment dept = requireDept(id);
        // 部门编码由系统生成, 不可修改
        // 上级部门不能选择自身或其下级 (防止形成环)
        if (request.getParentId() != null) {
            Long cursor = request.getParentId();
            while (cursor != null) {
                if (Objects.equals(cursor, id)) {
                    throw new BusinessException("上级部门不能选择自身或其下级部门");
                }
                SysDepartment parent = sysDepartmentMapper.selectById(cursor);
                cursor = parent == null ? null : parent.getParentId();
            }
        }
        dept.setName(request.getName().trim());
        dept.setNameEn(request.getNameEn() != null ? request.getNameEn().trim() : null);
        dept.setParentId(request.getParentId());
        dept.setLeader(request.getLeader());
        if (request.getSort() != null) {
            dept.setSort(request.getSort());
        }
        dept.setUpdatedBy(operatorResolver.currentOperatorName());
        sysDepartmentMapper.updateById(dept);
        // 同步更新该部门下员工的部门名称快照
        syncUserDepartmentName(id, dept.getName(), dept.getNameEn());
        return DepartmentVO.from(dept, null, null, loadPermissions(dept.getId()));
    }

    @Override
    public void updateStatus(Long id, Integer status) {
        SysDepartment dept = requireDept(id);
        dept.setStatus(status);
        dept.setUpdatedBy(operatorResolver.currentOperatorName());
        sysDepartmentMapper.updateById(dept);
        permissionService.evictAll();
    }

    @Override
    @Transactional
    public void updatePermissions(Long id, List<MenuPermissionDTO> permissions) {
        requireDept(id);
        saveDeptMenus(id, permissions);
        permissionService.evictAll();
    }

    @Override
    @Transactional
    public void delete(Long id) {
        requireDept(id);
        Long childCount = sysDepartmentMapper.selectCount(
                new LambdaQueryWrapper<SysDepartment>().eq(SysDepartment::getParentId, id));
        if (childCount != null && childCount > 0) {
            throw new BusinessException("该部门存在下级部门，请先删除下级部门");
        }
        sysDepartmentMapper.deleteById(id);
        // 清理部门菜单关联
        sysDepartmentMenuMapper.delete(
                new LambdaQueryWrapper<SysDepartmentMenu>().eq(SysDepartmentMenu::getDeptId, id));
        // 解绑该部门下的员工
        List<SysUser> users = sysUserMapper.selectList(
                new LambdaQueryWrapper<SysUser>().eq(SysUser::getDepartmentId, id));
        for (SysUser user : users) {
            user.setDepartmentId(null);
            user.setDepartment(null);
            sysUserMapper.updateById(user);
        }
        permissionService.evictAll();
    }

    @Override
    public List<MenuPermissionDTO> permissionsOf(Long deptId) {
        if (deptId == null) {
            return List.of();
        }
        SysDepartment dept = sysDepartmentMapper.selectById(deptId);
        if (dept == null || dept.getStatus() == null || dept.getStatus() != 1) {
            return List.of();
        }
        return loadPermissions(deptId);
    }

    /**
     * 生成下一个部门编码: 取当前最大 MT 序号 + 1 (原生 SQL 包含逻辑删除记录, 避免复用已删除部门的编码)
     */
    private String generateDeptCode() {
        Integer maxSeq = jdbcTemplate.queryForObject(
                "SELECT IFNULL(MAX(CAST(SUBSTRING(code, 3) AS UNSIGNED)), 0) FROM sys_department "
                        + "WHERE code REGEXP '^MT[0-9]+$'",
                Integer.class);
        return String.format("%s%05d", DEPT_CODE_PREFIX, (maxSeq == null ? 0 : maxSeq) + 1);
    }

    /** 保存部门菜单权限: 先清空再批量写入 */
    private void saveDeptMenus(Long deptId, List<MenuPermissionDTO> permissions) {
        sysDepartmentMenuMapper.delete(
                new LambdaQueryWrapper<SysDepartmentMenu>().eq(SysDepartmentMenu::getDeptId, deptId));
        if (CollectionUtils.isEmpty(permissions)) {
            return;
        }
        for (MenuPermissionDTO perm : permissions) {
            if (!StringUtils.hasText(perm.getMenuKey())) {
                continue;
            }
            Long menuId = resolveMenuId(perm.getMenuKey().trim());
            if (menuId == null) {
                continue;
            }
            SysDepartmentMenu relation = new SysDepartmentMenu();
            relation.setDeptId(deptId);
            relation.setMenuId(menuId);
            relation.setActions(JsonUtils.toJson(perm.getActions()));
            sysDepartmentMenuMapper.insert(relation);
        }
    }

    /** 根据 menuKey 获取菜单ID, 不存在时自动创建占位菜单 */
    private Long resolveMenuId(String menuKey) {
        List<Long> ids = jdbcTemplate.queryForList(
                "SELECT id FROM sys_menu WHERE menu_key = ? AND deleted = 0 LIMIT 1",
                Long.class, menuKey);
        if (!ids.isEmpty()) {
            return ids.get(0);
        }
        jdbcTemplate.update(
                "INSERT INTO sys_menu (parent_id, menu_key, name, type, status, deleted, sort_order) "
                        + "VALUES (NULL, ?, ?, 2, 1, 0, 0)",
                menuKey, menuKey);
        Long menuId = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
        log.warn("部门权限保存时发现菜单 [{}] 不存在, 已自动创建占位菜单 (id={})", menuKey, menuId);
        return menuId;
    }

    /** 从 sys_department_menu + sys_menu 加载部门权限 */
    private List<MenuPermissionDTO> loadPermissions(Long deptId) {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT m.menu_key, dm.actions "
                        + "FROM sys_department_menu dm "
                        + "JOIN sys_menu m ON dm.menu_id = m.id "
                        + "WHERE dm.dept_id = ? AND m.deleted = 0",
                deptId);
        List<MenuPermissionDTO> result = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            MenuPermissionDTO dto = new MenuPermissionDTO();
            dto.setMenuKey((String) row.get("menu_key"));
            dto.setActions(JsonUtils.parseStringList((String) row.get("actions")));
            result.add(dto);
        }
        return result;
    }

    /** 批量加载多个部门权限, 按 deptId 分组 */
    private Map<Long, List<MenuPermissionDTO>> loadPermissionsMap(List<Long> deptIds) {
        Map<Long, List<MenuPermissionDTO>> result = new HashMap<>();
        if (CollectionUtils.isEmpty(deptIds)) {
            return result;
        }
        String inClause = deptIds.stream().map(String::valueOf).collect(Collectors.joining(","));
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT dm.dept_id, m.menu_key, dm.actions "
                        + "FROM sys_department_menu dm "
                        + "JOIN sys_menu m ON dm.menu_id = m.id "
                        + "WHERE dm.dept_id IN (" + inClause + ") AND m.deleted = 0");
        for (Map<String, Object> row : rows) {
            Long deptId = ((Number) row.get("dept_id")).longValue();
            MenuPermissionDTO dto = new MenuPermissionDTO();
            dto.setMenuKey((String) row.get("menu_key"));
            dto.setActions(JsonUtils.parseStringList((String) row.get("actions")));
            result.computeIfAbsent(deptId, k -> new ArrayList<>()).add(dto);
        }
        return result;
    }

    @Override
    @Transactional
    public int translateNames() {
        // 查询所有 nameEn 为空的部门
        List<SysDepartment> depts = sysDepartmentMapper.selectList(
                new LambdaQueryWrapper<SysDepartment>()
                        .isNotNull(SysDepartment::getName)
                        .and(w -> w.isNull(SysDepartment::getNameEn).or().eq(SysDepartment::getNameEn, "")));
        int count = 0;
        for (SysDepartment dept : depts) {
            String name = dept.getName();
            if (!StringUtils.hasText(name)) continue;
            String translated = translationService.translateText(name, "en");
            if (StringUtils.hasText(translated)) {
                dept.setNameEn(translated);
                sysDepartmentMapper.updateById(dept);
                // 同步更新该部门下员工的 departmentEn 快照
                syncUserDepartmentName(dept.getId(), dept.getName(), translated);
                count++;
            }
        }
        log.info("批量翻译部门名称完成: 共翻译 {} 个部门", count);
        return count;
    }

    /** 部门名称变更后同步员工表的部门名称快照 */
    private void syncUserDepartmentName(Long deptId, String deptName, String deptNameEn) {
        List<SysUser> users = sysUserMapper.selectList(
                new LambdaQueryWrapper<SysUser>().eq(SysUser::getDepartmentId, deptId));
        for (SysUser user : users) {
            user.setDepartment(deptName);
            user.setDepartmentEn(deptNameEn);
            sysUserMapper.updateById(user);
        }
    }

    private SysDepartment requireDept(Long id) {
        SysDepartment dept = sysDepartmentMapper.selectById(id);
        if (dept == null) {
            throw new BusinessException("部门不存在");
        }
        return dept;
    }
}
