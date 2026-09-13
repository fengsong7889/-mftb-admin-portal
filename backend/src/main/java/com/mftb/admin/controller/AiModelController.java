package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.AiModelDTO;
import com.mftb.admin.service.AiModelService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * AI 模型管理控制器
 *
 * 2026-09 整改：
 * - 模型能力维度（vision/functionCalling/jsonMode/streaming/thinkingMode）独立列
 * - 限流与多模态字段
 * - 缓存命中价/币种
 */
@Slf4j
@RestController
@RequestMapping("/api/ai/models")
@RequiredArgsConstructor
@Tag(name = "AI 智能中心 - 模型管理", description = "AI 模型 CRUD 接口")
public class AiModelController {

    /** 本菜单标识（sys_menu.menu_key），模型列表页 */
    private static final String MENU = "ai-model-list";

    private final AiModelService modelService;

    /**
     * 获取模型列表
     */
    @GetMapping
    @Operation(summary = "查询模型列表")
    @RequirePermission(menu = MENU)
    public Result<List<AiModelDTO.ModelVO>> list(
        @RequestParam(required = false) String modelKey,
        @RequestParam(required = false) String name,
        @RequestParam(required = false) String type,
        @RequestParam(required = false) Integer status,
        @RequestParam(required = false) String modality) {
        List<AiModelDTO.ModelVO> result = modelService.list(modelKey, name, type, status, modality);
        return Result.success(result);
    }

    /**
     * 获取单个模型详情
     */
    @GetMapping("/{id}")
    @Operation(summary = "获取模型详情")
    @RequirePermission(menu = MENU)
    public Result<AiModelDTO.ModelVO> getById(@PathVariable Long id) {
        AiModelDTO.ModelVO vo = modelService.getById(id);
        if (vo == null) {
            return Result.error("模型不存在");
        }
        return Result.success(vo);
    }

    /**
     * 新增模型
     */
    @PostMapping
    @Operation(summary = "新增模型")
    @RequirePermission(menu = MENU, action = "create")
    public Result<Boolean> create(@Valid @RequestBody AiModelDTO.ModelSaveRequest request) {
        try {
            boolean ok = modelService.create(request);
            if (!ok) {
                return Result.error("模型标识已存在");
            }
            return Result.success(true);
        } catch (Exception e) {
            log.error("新增模型失败", e);
            return Result.error("创建失败，请稍后重试");
        }
    }

    /**
     * 更新模型
     */
    @PutMapping("/{id}")
    @Operation(summary = "更新模型")
    @RequirePermission(menu = MENU, action = "edit")
    public Result<Boolean> update(@PathVariable Long id, @Valid @RequestBody AiModelDTO.ModelSaveRequest request) {
        boolean ok = modelService.update(id, request);
        if (!ok) {
            return Result.error("模型不存在");
        }
        return Result.success(true);
    }

    /**
     * 删除模型（逻辑删除）
     */
    @DeleteMapping("/{id}")
    @Operation(summary = "删除模型")
    @RequirePermission(menu = MENU, action = "delete")
    public Result<Boolean> delete(@PathVariable Long id) {
        boolean ok = modelService.delete(id);
        if (!ok) {
            return Result.error("模型不存在");
        }
        return Result.success(true);
    }
}
