package com.mftb.admin.controller;

import com.mftb.admin.common.Result;
import com.mftb.admin.dto.AdPricingHotRequest;
import com.mftb.admin.dto.AdPricingHotVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.service.AdPricingHotService;
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
 * 人气商家销售定价接口
 */
@RestController
@RequestMapping("/api/ad/pricing/hot")
@RequiredArgsConstructor
public class AdPricingHotController {

    private final AdPricingHotService pricingService;

    /** 计价配置分页查询 */
    @GetMapping
    public Result<PageResult<AdPricingHotVO>> page(
            @RequestParam(defaultValue = "1") long page,
            @RequestParam(defaultValue = "10") long size,
            @RequestParam(required = false) Long algoId,
            @RequestParam(required = false) String brand,
            @RequestParam(required = false) Integer status) {
        return Result.success(pricingService.page(page, size, algoId, brand, status));
    }

    /** 计价配置详情 */
    @GetMapping("/{id}")
    public Result<AdPricingHotVO> detail(@PathVariable Long id) {
        return Result.success(pricingService.detail(id));
    }

    /** 按算法查询启用中的计价配置 */
    @GetMapping("/active")
    public Result<AdPricingHotVO> activeByAlgo(@RequestParam Long algoId) {
        return Result.success(pricingService.activeByAlgo(algoId));
    }

    /** 新增计价配置 */
    @PostMapping
    public Result<AdPricingHotVO> create(@Valid @RequestBody AdPricingHotRequest request) {
        return Result.success("计价配置已保存", pricingService.create(request));
    }

    /** 编辑计价配置 */
    @PutMapping("/{id}")
    public Result<AdPricingHotVO> update(@PathVariable Long id, @Valid @RequestBody AdPricingHotRequest request) {
        return Result.success("计价配置已更新", pricingService.update(id, request));
    }

    /** 启用/停用 */
    @PutMapping("/{id}/status")
    public Result<Void> updateStatus(@PathVariable Long id, @RequestBody Map<String, Integer> body) {
        pricingService.updateStatus(id, body.get("status"));
        return Result.success();
    }

    /** 删除计价配置 */
    @DeleteMapping("/{id}")
    public Result<Void> delete(@PathVariable Long id) {
        pricingService.delete(id);
        return Result.success();
    }
}
