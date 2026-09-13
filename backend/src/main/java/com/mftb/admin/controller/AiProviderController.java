package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.AiProviderDTO;
import com.mftb.admin.service.AiProviderService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * AI 供应商管理控制器
 */
@Slf4j
@RestController
@RequestMapping("/api/ai/providers")
@RequiredArgsConstructor
@Tag(name = "AI 智能中心", description = "AI 智能中心相关接口")
public class AiProviderController {

    /** 本菜单标识（sys_menu.menu_key），供应商管理页 */
    private static final String MENU = "ai-model-provider";

    private final AiProviderService providerService;

    /**
     * 获取供应商列表
     */
    @GetMapping
    @Operation(summary = "查询供应商列表")
    @RequirePermission(menu = MENU)
    public Result<List<AiProviderDTO.ProviderVO>> list(
        @RequestParam(required = false) String providerKey,
        @RequestParam(required = false) String name,
        @RequestParam(required = false) Integer status) {
        List<AiProviderDTO.ProviderVO> result = providerService.list(providerKey, name, status);
        return Result.success(result);
    }

    /**
     * 获取单个供应商详情
     */
    @GetMapping("/{id}")
    @Operation(summary = "获取供应商详情")
    @RequirePermission(menu = MENU)
    public Result<AiProviderDTO.ProviderVO> getById(@PathVariable Long id) {
        AiProviderDTO.ProviderVO vo = providerService.getById(id);
        if (vo == null) {
            return Result.error("供应商不存在");
        }
        return Result.success(vo);
    }

    /**
     * 新增供应商
     */
    @PostMapping
    @Operation(summary = "新增供应商")
    @RequirePermission(menu = MENU, action = "create")
    public Result<Boolean> create(@Valid @RequestBody AiProviderDTO.ProviderSaveRequest request) {
        try {
            boolean ok = providerService.create(request);
            if (!ok) {
                return Result.error("供应商标识已存在");
            }
            return Result.success(true);
        } catch (Exception e) {
            log.error("新增供应商失败", e);
            return Result.error("创建失败，请稍后重试");
        }
    }

    /**
     * 更新供应商
     */
    @PutMapping("/{id}")
    @Operation(summary = "更新供应商")
    @RequirePermission(menu = MENU, action = "edit")
    public Result<Boolean> update(@PathVariable Long id, @Valid @RequestBody AiProviderDTO.ProviderSaveRequest request) {
        boolean ok = providerService.update(id, request);
        if (!ok) {
            return Result.error("供应商不存在");
        }
        return Result.success(true);
    }

    /**
     * 删除供应商（逻辑删除）
     */
    @DeleteMapping("/{id}")
    @Operation(summary = "删除供应商")
    @RequirePermission(menu = MENU, action = "delete")
    public Result<Boolean> delete(@PathVariable Long id) {
        boolean ok = providerService.delete(id);
        if (!ok) {
            return Result.error("供应商不存在");
        }
        return Result.success(true);
    }
}
