package com.mftb.admin.controller;

import com.mftb.admin.common.Result;
import com.mftb.admin.dto.MenuRequest;
import com.mftb.admin.dto.MenuVO;
import com.mftb.admin.service.MenuService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 系统菜单配置接口
 */
@RestController
@RequestMapping("/api/menus")
@RequiredArgsConstructor
public class MenuController {

    private final MenuService menuService;

    /** 查询全部菜单 (平铺列表) */
    @GetMapping
    public Result<List<MenuVO>> list() {
        return Result.success(menuService.list());
    }

    /** 查询菜单树 */
    @GetMapping("/tree")
    public Result<List<MenuVO>> tree() {
        return Result.success(menuService.tree());
    }

    /** 查询菜单详情 */
    @GetMapping("/{id}")
    public Result<MenuVO> detail(@PathVariable Long id) {
        return Result.success(menuService.detail(id));
    }

    /** 新增菜单 */
    @PostMapping
    public Result<MenuVO> create(@Valid @RequestBody MenuRequest request) {
        return Result.success("菜单创建成功", menuService.create(request));
    }

    /** 编辑菜单 */
    @PutMapping("/{id}")
    public Result<MenuVO> update(@PathVariable Long id, @Valid @RequestBody MenuRequest request) {
        return Result.success("菜单信息已更新", menuService.update(id, request));
    }

    /** 启用/停用 */
    @PutMapping("/{id}/status")
    public Result<Void> updateStatus(@PathVariable Long id, @RequestParam Integer status) {
        menuService.updateStatus(id, status);
        return Result.success();
    }

    /** 删除菜单 */
    @DeleteMapping("/{id}")
    public Result<Void> delete(@PathVariable Long id) {
        menuService.delete(id);
        return Result.success();
    }
}
