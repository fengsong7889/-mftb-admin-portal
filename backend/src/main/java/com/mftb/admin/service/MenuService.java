package com.mftb.admin.service;

import com.mftb.admin.dto.MenuRequest;
import com.mftb.admin.dto.MenuVO;

import java.util.List;

/**
 * 系统菜单配置服务
 */
public interface MenuService {

    /** 查询全部菜单 (平铺列表) */
    List<MenuVO> list();

    /** 查询菜单树 */
    List<MenuVO> tree();

    /** 根据ID查询菜单详情 */
    MenuVO detail(Long id);

    /** 新增菜单 */
    MenuVO create(MenuRequest request);

    /** 编辑菜单 */
    MenuVO update(Long id, MenuRequest request);

    /** 启用/停用 */
    void updateStatus(Long id, Integer status);

    /** 删除菜单 (存在子菜单时禁止删除) */
    void delete(Long id);
}
