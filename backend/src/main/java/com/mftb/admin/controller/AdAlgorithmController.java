package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.AdAlgorithmRequest;
import com.mftb.admin.dto.AdAlgorithmVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.service.AdAlgorithmService;
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
 * 推广算法库接口
 */
@RestController
@RequestMapping("/api/ad/algorithms")
@RequiredArgsConstructor
public class AdAlgorithmController {

    private final AdAlgorithmService algorithmService;

    /** 算法分页查询 */
    @GetMapping
    @RequirePermission(menu = "promotion-algorithm")
    public Result<PageResult<AdAlgorithmVO>> page(
            @RequestParam(defaultValue = "1") long page,
            @RequestParam(defaultValue = "10") long size,
            @RequestParam(required = false) Integer algoType,
            @RequestParam(required = false) String brand,
            @RequestParam(required = false) Integer channel,
            @RequestParam(required = false) Integer status,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String storeCode,
            @RequestParam(required = false) Boolean hasPricing) {
        return Result.success(algorithmService.page(page, size, algoType, brand, channel, status, keyword, storeCode, hasPricing));
    }

    /** 算法详情 */
    @GetMapping("/{id}")
    @RequirePermission(menu = "promotion-algorithm")
    public Result<AdAlgorithmVO> detail(@PathVariable Long id) {
        return Result.success(algorithmService.detail(id));
    }

    /** 新增算法 */
    @PostMapping
    @RequirePermission(menu = "promotion-algorithm", action = "create")
    public Result<AdAlgorithmVO> create(@Valid @RequestBody AdAlgorithmRequest request) {
        return Result.success("算法新增成功", algorithmService.create(request));
    }

    /** 编辑算法 */
    @PutMapping("/{id}")
    @RequirePermission(menu = "promotion-algorithm", action = "edit")
    public Result<AdAlgorithmVO> update(@PathVariable Long id, @Valid @RequestBody AdAlgorithmRequest request) {
        return Result.success("算法更新成功", algorithmService.update(id, request));
    }

    /** 启用/停用 */
    @PutMapping("/{id}/status")
    @RequirePermission(menu = "promotion-algorithm", action = "edit")
    public Result<Void> updateStatus(@PathVariable Long id, @RequestBody Map<String, Integer> body) {
        algorithmService.updateStatus(id, body.get("status"));
        return Result.success();
    }

    /** 删除算法 */
    @DeleteMapping("/{id}")
    @RequirePermission(menu = "promotion-algorithm", action = "delete")
    public Result<Void> delete(@PathVariable Long id) {
        algorithmService.delete(id);
        return Result.success();
    }

    /** 查询引用该算法的瀑布流配置列表 */
    @GetMapping("/{id}/waterfall-references")
    @RequirePermission(menu = "promotion-algorithm")
    public Result<List<Map<String, Object>>> waterfallReferences(@PathVariable Long id) {
        return Result.success(algorithmService.findWaterfallReferences(id));
    }
}
