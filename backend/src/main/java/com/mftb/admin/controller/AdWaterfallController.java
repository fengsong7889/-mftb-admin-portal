package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.AdWaterfallRequest;
import com.mftb.admin.dto.AdWaterfallVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.service.AdWaterfallService;
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

import java.util.Map;

/**
 * 瀑布流策略接口
 * 配置ID(主键)被 APP 引用: APP 按配置ID拉取坑位算法数据,
 * 未配置坑位读取自然流量兜底算法(naturalAlgoId)的数据
 */
@RestController
@RequestMapping("/api/ad/waterfall")
@RequiredArgsConstructor
public class AdWaterfallController {

    private final AdWaterfallService waterfallService;

    /** 策略分页查询 */
    @GetMapping
    @RequirePermission(menu = "promotion-slot-config")
    public Result<PageResult<AdWaterfallVO>> page(
            @RequestParam(defaultValue = "1") long page,
            @RequestParam(defaultValue = "10") long size,
            @RequestParam(required = false) Long id,
            @RequestParam(required = false) String strategyCode,
            @RequestParam(required = false) String strategyName,
            @RequestParam(required = false) String brand,
            @RequestParam(required = false) Integer status,
            @RequestParam(required = false) String algoId) {
        return Result.success(waterfallService.page(page, size, id, strategyCode, strategyName, brand, status, algoId));
    }

    /** 策略详情（含坑位明细 + 自然流量兜底算法，APP 按配置ID引用） */
    @GetMapping("/{id}")
    @RequirePermission(menu = "promotion-slot-config")
    public Result<AdWaterfallVO> detail(@PathVariable Long id) {
        return Result.success(waterfallService.detail(id));
    }

    /** 新增策略 */
    @PostMapping
    @RequirePermission(menu = "promotion-slot-config", action = "create")
    public Result<AdWaterfallVO> create(@Valid @RequestBody AdWaterfallRequest request) {
        return Result.success("瀑布流策略新增成功", waterfallService.create(request));
    }

    /** 编辑策略（坑位明细整体替换） */
    @PutMapping("/{id}")
    @RequirePermission(menu = "promotion-slot-config", action = "edit")
    public Result<AdWaterfallVO> update(@PathVariable Long id, @Valid @RequestBody AdWaterfallRequest request) {
        return Result.success("瀑布流策略更新成功", waterfallService.update(id, request));
    }

    /** 启用/停用 */
    @PutMapping("/{id}/status")
    @RequirePermission(menu = "promotion-slot-config", action = "edit")
    public Result<Void> updateStatus(@PathVariable Long id, @RequestBody Map<String, Integer> body) {
        waterfallService.updateStatus(id, body.get("status"));
        return Result.success();
    }

    /** 删除策略 */
    @DeleteMapping("/{id}")
    @RequirePermission(menu = "promotion-slot-config", action = "delete")
    public Result<Void> delete(@PathVariable Long id) {
        waterfallService.delete(id);
        return Result.success();
    }
}
