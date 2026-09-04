package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.AdPricingTrafficRequest;
import com.mftb.admin.dto.AdPricingTrafficVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.service.AdPricingTrafficService;
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
import java.util.Map;

/**
 * 投流广告销售定价接口
 */
@RestController
@RequestMapping("/api/ad/pricing/traffic")
@RequiredArgsConstructor
public class AdPricingTrafficController {

    private final AdPricingTrafficService pricingService;

    /** 计价配置分页查询 */
    @GetMapping
    @RequirePermission(menu = "ad-sales")
    public Result<PageResult<AdPricingTrafficVO>> page(
            @RequestParam(defaultValue = "1") long page,
            @RequestParam(defaultValue = "10") long size,
            @RequestParam(required = false) Long algoId,
            @RequestParam(required = false) String brand,
            @RequestParam(required = false) Integer bizChannel,
            @RequestParam(required = false) Integer status) {
        return Result.success(pricingService.page(page, size, algoId, brand, bizChannel, status));
    }

    /** 计价配置详情（含预设档位 + 自定义阶梯单价） */
    @GetMapping("/{id}")
    @RequirePermission(menu = "ad-sales")
    public Result<AdPricingTrafficVO> detail(@PathVariable Long id) {
        return Result.success(pricingService.detail(id));
    }

    /** 按算法+业务频道查询启用中的计价配置（购买页加载定价用） */
    @GetMapping("/active")
    @RequirePermission(menu = "ad-sales")
    public Result<AdPricingTrafficVO> activeByAlgo(@RequestParam Long algoId,
                                                   @RequestParam(required = false) Integer bizChannel) {
        return Result.success(pricingService.activeByAlgo(algoId, bizChannel));
    }

    /** 按算法查询全部业务频道的计价配置 */
    @GetMapping("/list-by-algo")
    @RequirePermission(menu = "ad-sales")
    public Result<List<AdPricingTrafficVO>> listByAlgo(@RequestParam Long algoId) {
        return Result.success(pricingService.listByAlgo(algoId));
    }

    /** 新增计价配置（同一算法同一业务频道仅一条） */
    @PostMapping
    @RequirePermission(menu = "ad-sales", action = "edit")
    public Result<AdPricingTrafficVO> create(@Valid @RequestBody AdPricingTrafficRequest request) {
        return Result.success("计价配置已保存", pricingService.create(request));
    }

    /** 编辑计价配置 */
    @PutMapping("/{id}")
    @RequirePermission(menu = "ad-sales", action = "edit")
    public Result<AdPricingTrafficVO> update(@PathVariable Long id,
                                             @Valid @RequestBody AdPricingTrafficRequest request) {
        return Result.success("计价配置已更新", pricingService.update(id, request));
    }

    /** 启用/停用 */
    @PutMapping("/{id}/status")
    @RequirePermission(menu = "ad-sales", action = "edit")
    public Result<Void> updateStatus(@PathVariable Long id, @RequestBody Map<String, Integer> body) {
        pricingService.updateStatus(id, body.get("status"));
        return Result.success();
    }

    /** 删除计价配置 */
    @DeleteMapping("/{id}")
    @RequirePermission(menu = "ad-sales", action = "edit")
    public Result<Void> delete(@PathVariable Long id) {
        pricingService.delete(id);
        return Result.success();
    }
}
