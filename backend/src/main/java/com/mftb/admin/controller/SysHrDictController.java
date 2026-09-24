package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.entity.SysHrDict;
import com.mftb.admin.service.SysHrDictService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
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
import java.util.Map;

/**
 * HR 人事通用字典接口
 * <p>
 * 读操作要求 {@code employee-management} 菜单权限（员工/合同/异动等业务模块消费）；
 * 写操作要求 {@code rule-config:edit}（与购买公司字典一致，独立于业务模块的编辑权限）。
 */
@RestController
@RequestMapping("/api/hr-dict")
@RequiredArgsConstructor
@Tag(name = "集团人事 - HR 字典", description = "雇主法人 / 工作地点 / 人员类别 等 HR 通用字典")
public class SysHrDictController {

    private static final String READ_MENU = "employee-management";
    private static final String WRITE_MENU = "rule-config";

    private final SysHrDictService hrDictService;

    /** 指定类型的启用下拉（value=code, label=name, 附 nameEn/parentCode） */
    @GetMapping("/options")
    @RequirePermission(menu = READ_MENU)
    @Operation(summary = "HR 字典启用下拉")
    public Result<List<Map<String, Object>>> options(@RequestParam("type") String type) {
        return Result.success(hrDictService.listOptions(type));
    }

    /** 按类型查询（含停用, 供管理/回溯） */
    @GetMapping
    @RequirePermission(menu = READ_MENU)
    @Operation(summary = "HR 字典列表")
    public Result<List<SysHrDict>> list(
            @RequestParam(value = "type", required = false) String type,
            @RequestParam(value = "status", required = false) Integer status) {
        return Result.success(hrDictService.list(type, status));
    }

    /** 新增字典项 */
    @PostMapping
    @RequirePermission(menu = WRITE_MENU, action = "edit")
    @Operation(summary = "新增 HR 字典项")
    public Result<Long> create(@RequestBody SysHrDict dict) {
        return Result.success("字典項已新增", hrDictService.create(dict));
    }

    /** 更新字典项（不允许改 dictType / code 身份键） */
    @PutMapping("/{id}")
    @RequirePermission(menu = WRITE_MENU, action = "edit")
    @Operation(summary = "更新 HR 字典项")
    public Result<Void> update(@PathVariable Long id, @RequestBody SysHrDict dict) {
        hrDictService.update(id, dict);
        return Result.success();
    }

    /** 启用/停用 */
    @PutMapping("/{id}/status")
    @RequirePermission(menu = WRITE_MENU, action = "edit")
    @Operation(summary = "启用/停用 HR 字典项")
    public Result<Void> updateStatus(@PathVariable Long id, @RequestParam Integer status) {
        hrDictService.updateStatus(id, status);
        return Result.success();
    }

    /** 删除（逻辑删除） */
    @DeleteMapping("/{id}")
    @RequirePermission(menu = WRITE_MENU, action = "edit")
    @Operation(summary = "删除 HR 字典项")
    public Result<Void> delete(@PathVariable Long id) {
        hrDictService.delete(id);
        return Result.success();
    }
}
