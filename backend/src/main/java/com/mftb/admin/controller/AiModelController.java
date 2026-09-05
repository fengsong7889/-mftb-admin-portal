package com.mftb.admin.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.toolkit.StringUtils;
import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.AiModelDTO;
import com.mftb.admin.entity.AiModel;
import com.mftb.admin.mapper.AiModelMapper;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
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

    private final AiModelMapper modelMapper;
    private final JdbcTemplate jdbcTemplate;

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
        LambdaQueryWrapper<AiModel> wrapper = new LambdaQueryWrapper<>();

        if (modelKey != null && !modelKey.isEmpty()) {
            wrapper.eq(AiModel::getModelKey, modelKey);
        }
        if (name != null && !name.isEmpty()) {
            wrapper.like(AiModel::getName, name);
        }
        if (type != null && !type.isEmpty()) {
            wrapper.eq(AiModel::getType, type);
        }
        if (status != null) {
            wrapper.eq(AiModel::getStatus, status);
        }
        // 多模态过滤：用 LIKE 匹配（避免多模态字段排序问题）
        if (StringUtils.isNotBlank(modality)) {
            wrapper.apply("FIND_IN_SET({0}, modalities) > 0", modality);
        }

        wrapper.orderByAsc(AiModel::getSortOrder, AiModel::getId);
        List<AiModel> models = modelMapper.selectList(wrapper);

        // 直接逐个获取供应商名称（统一走同一个 SQL，避免错位判断）
        List<AiModelDTO.ModelVO> result = models.stream()
            .map(m -> {
                AiModelDTO.ModelVO vo = convertToVO(m);
                vo.setProviderName(getProviderNameById(m.getProviderId()));
                return vo;
            })
            .toList();

        return Result.success(result);
    }

    /**
     * 获取单个模型详情
     */
    @GetMapping("/{id}")
    @Operation(summary = "获取模型详情")
    @RequirePermission(menu = MENU)
    public Result<AiModelDTO.ModelVO> getById(@PathVariable Long id) {
        AiModel model = modelMapper.selectById(id);
        if (model == null) {
            return Result.error("模型不存在");
        }

        AiModelDTO.ModelVO vo = convertToVO(model);
        vo.setProviderName(getProviderNameById(model.getProviderId()));

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
            // 检查 model_key 是否已存在
            Long count = modelMapper.selectCount(
                new LambdaQueryWrapper<AiModel>()
                    .eq(AiModel::getModelKey, request.getModelKey())
            );
            if (count > 0) {
                return Result.error("模型标识已存在");
            }

            AiModel model = new AiModel();
            BeanUtils.copyProperties(request, model);

            // 价格字段转换
            model.setInputPrice(toBigDecimal(request.getInputPrice()));
            model.setOutputPrice(toBigDecimal(request.getOutputPrice()));
            model.setCachedInputPrice(toBigDecimal(request.getCachedInputPrice()));

            modelMapper.insert(model);
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
        AiModel existing = modelMapper.selectById(id);
        if (existing == null) {
            return Result.error("模型不存在");
        }

        BeanUtils.copyProperties(request, existing);

        // 价格字段转换
        existing.setInputPrice(toBigDecimal(request.getInputPrice()));
        existing.setOutputPrice(toBigDecimal(request.getOutputPrice()));
        existing.setCachedInputPrice(toBigDecimal(request.getCachedInputPrice()));

        modelMapper.updateById(existing);
        return Result.success(true);
    }

    /**
     * 删除模型（逻辑删除）
     */
    @DeleteMapping("/{id}")
    @Operation(summary = "删除模型")
    @RequirePermission(menu = MENU, action = "delete")
    public Result<Boolean> delete(@PathVariable Long id) {
        AiModel existing = modelMapper.selectById(id);
        if (existing == null) {
            return Result.error("模型不存在");
        }

        modelMapper.deleteById(id);
        return Result.success(true);
    }

    /**
     * 转换为 VO 对象
     */
    private AiModelDTO.ModelVO convertToVO(AiModel entity) {
        AiModelDTO.ModelVO vo = new AiModelDTO.ModelVO();
        BeanUtils.copyProperties(entity, vo);

        // 价格转换
        if (entity.getInputPrice() != null) {
            vo.setInputPrice(entity.getInputPrice().doubleValue());
        }
        if (entity.getOutputPrice() != null) {
            vo.setOutputPrice(entity.getOutputPrice().doubleValue());
        }
        if (entity.getCachedInputPrice() != null) {
            vo.setCachedInputPrice(entity.getCachedInputPrice().doubleValue());
        }

        // 格式化时间
        vo.setCreatedAt(entity.getCreatedAt() != null ?
            entity.getCreatedAt().toString() : null);
        vo.setUpdatedAt(entity.getUpdatedAt() != null ?
            entity.getUpdatedAt().toString() : null);

        return vo;
    }

    /**
     * Double → BigDecimal
     */
    private BigDecimal toBigDecimal(Double v) {
        return v == null ? null : BigDecimal.valueOf(v);
    }

    /**
     * 根据 ID 获取供应商名称
     */
    private String getProviderNameById(Long providerId) {
        if (providerId == null) {
            return null;
        }
        String sql = "SELECT name FROM ai_provider WHERE id = ? AND deleted = 0 LIMIT 1";
        List<String> result = jdbcTemplate.queryForList(sql, String.class, providerId);
        return result.isEmpty() ? null : result.get(0);
    }
}
