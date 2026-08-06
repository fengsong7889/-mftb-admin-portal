package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.MenuRequest;
import com.mftb.admin.dto.MenuVO;
import com.mftb.admin.entity.SysMenu;
import com.mftb.admin.mapper.SysMenuMapper;
import com.mftb.admin.service.MenuService;
import com.mftb.admin.util.JsonUtils;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.CollectionUtils;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

/**
 * 系统菜单配置服务实现
 */
@Service
@RequiredArgsConstructor
public class MenuServiceImpl implements MenuService {

    private final SysMenuMapper sysMenuMapper;
    private final OperatorResolver operatorResolver;

    @Override
    public List<MenuVO> list() {
        List<SysMenu> menus = sysMenuMapper.selectList(
                new LambdaQueryWrapper<SysMenu>()
                        .orderByAsc(SysMenu::getSort)
                        .orderByAsc(SysMenu::getId));
        Map<Long, String> nameMap = new HashMap<>();
        menus.forEach(m -> nameMap.put(m.getId(), m.getName()));
        return menus.stream()
                .map(m -> MenuVO.from(m, nameMap.get(m.getParentId())))
                .toList();
    }

    @Override
    public List<MenuVO> tree() {
        List<SysMenu> menus = sysMenuMapper.selectList(
                new LambdaQueryWrapper<SysMenu>()
                        .orderByAsc(SysMenu::getSort)
                        .orderByAsc(SysMenu::getId));
        return buildTree(menus);
    }

    @Override
    public MenuVO detail(Long id) {
        SysMenu menu = requireMenu(id);
        String parentName = null;
        if (menu.getParentId() != null) {
            SysMenu parent = sysMenuMapper.selectById(menu.getParentId());
            parentName = parent == null ? null : parent.getName();
        }
        return MenuVO.from(menu, parentName);
    }

    @Override
    @Transactional
    public MenuVO create(MenuRequest request) {
        validateParent(request.getParentId(), null);
        requireMenuKeyUnique(request.getMenuKey(), null);
        SysMenu menu = new SysMenu();
        menu.setParentId(normalizeParentId(request.getParentId()));
        menu.setMenuKey(request.getMenuKey().trim());
        menu.setName(request.getName().trim());
        menu.setPath(StringUtils.hasText(request.getPath()) ? request.getPath().trim() : null);
        menu.setComponent(StringUtils.hasText(request.getComponent()) ? request.getComponent().trim() : null);
        menu.setIcon(StringUtils.hasText(request.getIcon()) ? request.getIcon().trim() : null);
        menu.setType(request.getType());
        menu.setSort(request.getSort() == null ? 0 : request.getSort());
        menu.setActions(JsonUtils.toJson(CollectionUtils.isEmpty(request.getActions()) ? List.of() : request.getActions()));
        menu.setStatus(request.getStatus() == null ? 1 : request.getStatus());
        menu.setDeleted(0);
        menu.setUpdatedBy(operatorResolver.currentOperatorName());
        sysMenuMapper.insert(menu);
        return MenuVO.from(menu);
    }

    @Override
    @Transactional
    public MenuVO update(Long id, MenuRequest request) {
        SysMenu menu = requireMenu(id);
        validateParent(request.getParentId(), id);
        requireMenuKeyUnique(request.getMenuKey(), id);
        menu.setParentId(normalizeParentId(request.getParentId()));
        menu.setMenuKey(request.getMenuKey().trim());
        menu.setName(request.getName().trim());
        menu.setPath(StringUtils.hasText(request.getPath()) ? request.getPath().trim() : null);
        menu.setComponent(StringUtils.hasText(request.getComponent()) ? request.getComponent().trim() : null);
        menu.setIcon(StringUtils.hasText(request.getIcon()) ? request.getIcon().trim() : null);
        menu.setType(request.getType());
        if (request.getSort() != null) {
            menu.setSort(request.getSort());
        }
        menu.setActions(JsonUtils.toJson(CollectionUtils.isEmpty(request.getActions()) ? List.of() : request.getActions()));
        if (request.getStatus() != null) {
            menu.setStatus(request.getStatus());
        }
        menu.setUpdatedBy(operatorResolver.currentOperatorName());
        sysMenuMapper.updateById(menu);
        return MenuVO.from(menu);
    }

    @Override
    public void updateStatus(Long id, Integer status) {
        SysMenu menu = requireMenu(id);
        menu.setStatus(status);
        menu.setUpdatedBy(operatorResolver.currentOperatorName());
        sysMenuMapper.updateById(menu);
    }

    @Override
    @Transactional
    public void delete(Long id) {
        requireMenu(id);
        Long childCount = sysMenuMapper.selectCount(
                new LambdaQueryWrapper<SysMenu>().eq(SysMenu::getParentId, id));
        if (childCount != null && childCount > 0) {
            throw new BusinessException("该菜单存在子菜单，请先删除子菜单");
        }
        sysMenuMapper.deleteById(id);
    }

    /** 构建菜单树, 父菜单在前、同级按 sort 排序 */
    private List<MenuVO> buildTree(List<SysMenu> menus) {
        if (CollectionUtils.isEmpty(menus)) {
            return List.of();
        }
        Map<Long, MenuVO> voMap = menus.stream()
                .collect(Collectors.toMap(SysMenu::getId, MenuVO::from, (a, b) -> a));
        List<MenuVO> roots = new ArrayList<>();
        for (SysMenu menu : menus) {
            MenuVO vo = voMap.get(menu.getId());
            if (isTopLevel(menu.getParentId())) {
                roots.add(vo);
            } else {
                MenuVO parent = voMap.get(menu.getParentId());
                if (parent != null) {
                    parent.getChildren().add(vo);
                } else {
                    // 父节点缺失时作为顶层展示, 避免数据异常导致菜单丢失
                    roots.add(vo);
                }
            }
        }
        roots.sort(Comparator.comparing(MenuVO::getSort, Comparator.nullsLast(Integer::compareTo))
                .thenComparing(MenuVO::getId));
        for (MenuVO root : roots) {
            sortChildren(root);
        }
        return roots;
    }

    private void sortChildren(MenuVO parent) {
        if (CollectionUtils.isEmpty(parent.getChildren())) {
            return;
        }
        parent.getChildren().sort(
                Comparator.comparing(MenuVO::getSort, Comparator.nullsLast(Integer::compareTo))
                        .thenComparing(MenuVO::getId));
        parent.getChildren().forEach(this::sortChildren);
    }

    /** 校验父菜单合法性并防止成环 */
    private void validateParent(Long parentId, Long currentId) {
        if (isTopLevel(parentId)) {
            return;
        }
        SysMenu parent = sysMenuMapper.selectById(parentId);
        if (parent == null) {
            throw new BusinessException("上级菜单不存在");
        }
        if (currentId != null && Objects.equals(parentId, currentId)) {
            throw new BusinessException("上级菜单不能选择自身");
        }
        // 防止将父菜单设置为自己的后代节点
        if (currentId != null) {
            Long cursor = parent.getParentId();
            while (cursor != null) {
                if (Objects.equals(cursor, currentId)) {
                    throw new BusinessException("上级菜单不能选择自身或其下级菜单");
                }
                SysMenu ancestor = sysMenuMapper.selectById(cursor);
                cursor = ancestor == null ? null : ancestor.getParentId();
            }
        }
    }

    /** menuKey 唯一性校验 */
    private void requireMenuKeyUnique(String menuKey, Long excludeId) {
        if (!StringUtils.hasText(menuKey)) {
            return;
        }
        LambdaQueryWrapper<SysMenu> wrapper =
                new LambdaQueryWrapper<SysMenu>().eq(SysMenu::getMenuKey, menuKey.trim());
        if (excludeId != null) {
            wrapper.ne(SysMenu::getId, excludeId);
        }
        Long count = sysMenuMapper.selectCount(wrapper);
        if (count != null && count > 0) {
            throw new BusinessException("菜单标识已存在");
        }
    }

    private SysMenu requireMenu(Long id) {
        SysMenu menu = sysMenuMapper.selectById(id);
        if (menu == null) {
            throw new BusinessException("菜单不存在");
        }
        return menu;
    }

    /** 顶级菜单的 parentId 归一化为 null */
    private Long normalizeParentId(Long parentId) {
        return isTopLevel(parentId) ? null : parentId;
    }

    private boolean isTopLevel(Long parentId) {
        return parentId == null || parentId == 0L;
    }
}
