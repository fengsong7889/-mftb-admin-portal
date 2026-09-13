package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.toolkit.StringUtils;
import com.mftb.admin.dto.AiModelDTO;
import com.mftb.admin.entity.AiModel;
import com.mftb.admin.mapper.AiModelMapper;
import com.mftb.admin.service.AiModelService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.List;

/**
 * AI 模型管理服务实现
 *
 * 2026-09 整改：
 * - 模型能力维度（vision/functionCalling/jsonMode/streaming/thinkingMode）独立列
 * - 限流与多模态字段
 * - 缓存命中价/币种
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AiModelServiceImpl implements AiModelService {

    private final AiModelMapper modelMapper;
    private final JdbcTemplate jdbcTemplate;

    @Override
    public List<AiModelDTO.ModelVO> list(String modelKey, String name, String type, Integer status, String modality) {
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

        // 管理页展示所有模型（含供应商未配置 API Key 的），方便管理员查看和维护
        // 实际可用性由供应商 API Key 配置状态决定，前端通过 apiKeyMasked 判断
        wrapper.orderByAsc(AiModel::getSortOrder, AiModel::getId);
        List<AiModel> models = modelMapper.selectList(wrapper);

        // 直接逐个获取供应商名称（统一走同一个 SQL，避免错位判断）
        return models.stream()
            .map(m -> {
                AiModelDTO.ModelVO vo = convertToVO(m);
                vo.setProviderName(getProviderNameById(m.getProviderId()));
                return vo;
            })
            .toList();
    }

    @Override
    public AiModelDTO.ModelVO getById(Long id) {
        AiModel model = modelMapper.selectById(id);
        if (model == null) {
            return null;
        }

        AiModelDTO.ModelVO vo = convertToVO(model);
        vo.setProviderName(getProviderNameById(model.getProviderId()));
        return vo;
    }

    @Override
    public boolean create(AiModelDTO.ModelSaveRequest request) {
        try {
            // 检查 model_key 是否已存在
            Long count = modelMapper.selectCount(
                new LambdaQueryWrapper<AiModel>()
                    .eq(AiModel::getModelKey, request.getModelKey())
            );
            if (count > 0) {
                return false;
            }

            AiModel model = new AiModel();
            BeanUtils.copyProperties(request, model);

            // 价格字段转换
            model.setInputPrice(toBigDecimal(request.getInputPrice()));
            model.setOutputPrice(toBigDecimal(request.getOutputPrice()));
            model.setCachedInputPrice(toBigDecimal(request.getCachedInputPrice()));

            modelMapper.insert(model);
            return true;
        } catch (Exception e) {
            log.error("新增模型失败", e);
            throw e;
        }
    }

    @Override
    public boolean update(Long id, AiModelDTO.ModelSaveRequest request) {
        AiModel existing = modelMapper.selectById(id);
        if (existing == null) {
            return false;
        }

        BeanUtils.copyProperties(request, existing);

        // 价格字段转换
        existing.setInputPrice(toBigDecimal(request.getInputPrice()));
        existing.setOutputPrice(toBigDecimal(request.getOutputPrice()));
        existing.setCachedInputPrice(toBigDecimal(request.getCachedInputPrice()));

        modelMapper.updateById(existing);
        return true;
    }

    @Override
    public boolean delete(Long id) {
        AiModel existing = modelMapper.selectById(id);
        if (existing == null) {
            return false;
        }

        modelMapper.deleteById(id);
        return true;
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
