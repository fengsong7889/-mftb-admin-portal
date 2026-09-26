package com.mftb.admin.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.PermissionDeniedException;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.MenuVO;
import com.mftb.admin.dto.PortalSystemVO;
import com.mftb.admin.entity.SysSystem;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.SysSystemMapper;
import com.mftb.admin.service.MenuService;
import com.mftb.admin.service.PermissionService;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.BeanUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 统一门户接口。
 * <p>
 * 提供当前登录用户可进入的业务系统列表（按 sys_system.sort_order 排序），供前端门户页渲染卡片；
 * 无权限系统不返回，前端不做二次过滤。所有业务系统均隐含通过 {@link PermissionService#hasSystemAccess}
 * 判定，本接口一次性返回集合，避免前端逐系统探测。
 */
@RestController
@RequestMapping("/api/portal")
@RequiredArgsConstructor
public class PortalController {

    private final PermissionService permissionService;
    private final SysSystemMapper sysSystemMapper;
    private final OperatorResolver operatorResolver;
    private final MenuService menuService;

    /**
     * 返回当前用户可进入的系统清单。
     * <p>超管返回全部启用系统；普通用户返回角色 ∪ 部门可进入的系统；不返回哨兵 {@code portal}。
     */
    @GetMapping("/context")
    public Result<Map<String, Object>> context() {
        SysUser user = operatorResolver.currentUser();
        List<String> codes = permissionService.listAccessibleSystems(user);
        Map<String, PortalSystemVO> dict = loadSystemsByCodes();
        List<PortalSystemVO> systems = new ArrayList<>(codes.size());
        for (String code : codes) {
            PortalSystemVO vo = dict.get(code);
            if (vo != null) {
                systems.add(vo);
            }
        }
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("systems", systems);
        data.put("superAdmin", user != null && "admin".equalsIgnoreCase(user.getRole()));
        return Result.success(data);
    }

    /** 一次性读取全部启用系统并按 code 建索引（保留 sort 序由上层 codes 决定）。 */
    private Map<String, PortalSystemVO> loadSystemsByCodes() {
        List<SysSystem> all = sysSystemMapper.selectList(
                new LambdaQueryWrapper<SysSystem>()
                        .eq(SysSystem::getStatus, 1)
                        .orderByAsc(SysSystem::getSort));
        Map<String, PortalSystemVO> map = new LinkedHashMap<>();
        for (SysSystem s : all) {
            map.put(s.getCode(), PortalSystemVO.from(s));
        }
        return map;
    }

    /**
     * 读取单个启用系统。不存在或未启用 → 404；无系统准入 → 403。
     * <p>前端顶栏/侧栏展示系统名时优先读当前 context 缓存，本接口作为补充存在。
     */
    @GetMapping("/systems/{code}")
    public Result<PortalSystemVO> systemDetail(@PathVariable String code) {
        SysUser user = operatorResolver.currentUser();
        requireSystemAccess(user, code);
        SysSystem system = sysSystemMapper.selectById(code);
        if (system == null || system.getStatus() == null || system.getStatus() != 1) {
            return Result.error(404, "系统不存在或已停用");
        }
        return Result.success(PortalSystemVO.from(system));
    }

    /**
     * 获取当前用户在指定系统内可访问的菜单树（包含 actions）。
     * <p>无系统准入 → 403；未启用菜单不返回；菜单不存在 → 返回空 children 但不抛错。
     */
    @GetMapping("/systems/{code}/navigation")
    public Result<List<MenuVO>> navigation(@PathVariable String code) {
        SysUser user = operatorResolver.currentUser();
        requireSystemAccess(user, code);
        List<MenuVO> fullTree = menuService.tree();
        List<MenuVO> scoped = filterBySystemAndPermission(fullTree, code, user, null);
        return Result.success(scoped);
    }

    /** 无权限时抛 {@link PermissionDeniedException}，交由全局异常处理器统一返回 403，确保行为一致。 */
    private void requireSystemAccess(SysUser user, String code) {
        if (user == null || !permissionService.hasSystemAccess(user, code)) {
            throw new PermissionDeniedException("system-" + code, "view");
        }
    }

    /**
     * 保留顶级菜单中 systemCode 命中当前系统的子树，递归剪枝：
     * 叶子菜单需同时满足 “启用 + 当前用户具有 view 动作”；目录保留只要子级非空。
     * 超管在 hasPermission 中已直通，无需额外分支。
     */
    private List<MenuVO> filterBySystemAndPermission(
            List<MenuVO> nodes, String systemCode, SysUser user, String inheritedSystem) {
        List<MenuVO> result = new ArrayList<>();
        for (MenuVO node : nodes) {
            if (node.getStatus() == null || node.getStatus() != 1) {
                continue;
            }
            String owner = node.getSystemCode() == null ? inheritedSystem : node.getSystemCode();
            List<MenuVO> children = node.getChildren() == null ? List.of() : node.getChildren();
            List<MenuVO> filteredChildren = filterBySystemAndPermission(children, systemCode, user, owner);
            // 菜单配置等节点可物理挂在其他系统下，按显式归属提升，不能混入外层系统。
            if (!systemCode.equals(owner)) {
                result.addAll(filteredChildren);
                continue;
            }
            boolean isLeaf = children.isEmpty();
            if (isLeaf) {
                // 叶子菜单：有 view 权限才保留（目录 type=1 不要求权限，自身不参与 @RequirePermission）
                boolean permitted = node.getType() != null && node.getType() == 2
                        && permissionService.hasPermission(user, node.getMenuKey(), "view");
                if (permitted) {
                    result.add(node);
                }
            } else if (!filteredChildren.isEmpty()) {
                // 不修改全量菜单树，避免一次系统剪枝污染后续系统导航。
                MenuVO scoped = new MenuVO();
                BeanUtils.copyProperties(node, scoped);
                scoped.setChildren(filteredChildren);
                result.add(scoped);
            }
        }
        return result;
    }
}
