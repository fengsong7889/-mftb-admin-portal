package com.mftb.admin.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.toolkit.StringUtils;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.AiModelDTO;
import com.mftb.admin.entity.AiModel;
import com.mftb.admin.mapper.AiModelMapper;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
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
@RestController
@RequestMapping("/api/ai/models")
@RequiredArgsConstructor
@Tag(name = "AI 智能中心 - 模型管理", description = "AI 模型 CRUD 接口")
public class AiModelController {

    private final AiModelMapper modelMapper;
    private final JdbcTemplate jdbcTemplate;

    /**
     * 获取模型列表
     */
    @GetMapping
    @Operation(summary = "查询模型列表")
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
            return Result.error("创建失败：" + e.getMessage());
        }
    }

    /**
     * 更新模型
     */
    @PutMapping("/{id}")
    @Operation(summary = "更新模型")
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
    public Result<Boolean> delete(@PathVariable Long id) {
        AiModel existing = modelMapper.selectById(id);
        if (existing == null) {
            return Result.error("模型不存在");
        }

        modelMapper.deleteById(id);
        return Result.success(true);
    }

    /**
     * 临时：执行 schema 迁移（idempotent）
     * 用于 86/87 号 SQL 中的字段添加与约束变更
     * 只在第一次部署时需要，前端调用后即可删除
     */
    @PostMapping("/migrate")
    @Operation(summary = "[临时] 执行 ai_model 表 schema 迁移")
    public Result<Integer> migrate() {
        int count = 0;
        String[] alters = new String[] {
            "ALTER TABLE ai_model ADD COLUMN version VARCHAR(64) DEFAULT NULL COMMENT '模型版本号' AFTER name",
            "ALTER TABLE ai_model ADD COLUMN api_compat VARCHAR(20) DEFAULT 'openai' COMMENT 'API 兼容格式' AFTER description",
            "ALTER TABLE ai_model ADD COLUMN modalities VARCHAR(100) DEFAULT 'text' COMMENT '支持模态' AFTER api_compat",
            "ALTER TABLE ai_model ADD COLUMN vision_support TINYINT(1) DEFAULT 0 COMMENT '是否支持图像理解' AFTER modalities",
            "ALTER TABLE ai_model ADD COLUMN function_calling TINYINT(1) DEFAULT 0 COMMENT '是否支持工具调用' AFTER vision_support",
            "ALTER TABLE ai_model ADD COLUMN json_mode TINYINT(1) DEFAULT 0 COMMENT '是否支持 JSON 模式' AFTER function_calling",
            "ALTER TABLE ai_model ADD COLUMN streaming TINYINT(1) DEFAULT 1 COMMENT '是否支持流式响应' AFTER json_mode",
            "ALTER TABLE ai_model ADD COLUMN thinking_mode TINYINT(1) DEFAULT 0 COMMENT '是否支持思考模式' AFTER streaming",
            "ALTER TABLE ai_model ADD COLUMN cached_input_price DECIMAL(10,4) DEFAULT NULL COMMENT '缓存命中价' AFTER output_price",
            "ALTER TABLE ai_model ADD COLUMN currency VARCHAR(10) DEFAULT 'CNY' COMMENT '计费币种' AFTER cached_input_price",
            "ALTER TABLE ai_model ADD COLUMN concurrency_limit INT DEFAULT NULL COMMENT '并发限制' AFTER currency",
            "ALTER TABLE ai_model ADD COLUMN updated_by VARCHAR(50) DEFAULT NULL COMMENT '最后更新人' AFTER sort_order",
            // 87 号：联合唯一约束 (provider_id, model_key, version)，支持多版本共存
            "ALTER TABLE ai_model DROP INDEX uk_model_key",
            "ALTER TABLE ai_model ADD UNIQUE KEY uk_provider_key_version (provider_id, model_key, version)",
        };
        for (String sql : alters) {
            try {
                jdbcTemplate.execute(sql);
                count++;
            } catch (Exception e) {
                String msg = e.getMessage() == null ? "" : e.getMessage();
                boolean idempotent = msg.contains("Duplicate column")
                    || msg.contains("already exists")
                    || msg.contains("check that column/key exists")
                    || msg.contains("doesn't exist")
                    || msg.contains("Duplicate key name");
                if (!idempotent) {
                    return Result.error("迁移失败 [step=" + count + "]: " + msg);
                }
            }
        }
        return Result.success(count);
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
