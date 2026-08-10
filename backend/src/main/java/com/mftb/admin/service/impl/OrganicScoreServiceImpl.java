package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.OrganicScoreConfigVO;
import com.mftb.admin.dto.OrganicScoreDimensionRequest;
import com.mftb.admin.dto.OrganicScoreDimensionVO;
import com.mftb.admin.dto.OrganicScoreRuleRequest;
import com.mftb.admin.dto.OrganicScoreRuleVO;
import com.mftb.admin.entity.OrganicScoreDimension;
import com.mftb.admin.entity.OrganicScoreRule;
import com.mftb.admin.mapper.OrganicScoreDimensionMapper;
import com.mftb.admin.mapper.OrganicScoreRuleMapper;
import com.mftb.admin.service.OrganicScoreService;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Set;

/**
 * 自然流量评分配置管理服务实现
 */
@Service
@RequiredArgsConstructor
public class OrganicScoreServiceImpl implements OrganicScoreService {

    private static final DateTimeFormatter DISPLAY_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final Set<Integer> VALID_DIMENSIONS = Set.of(1, 2, 4);
    private static final Set<Integer> VALID_MODES = Set.of(1, 2, 3, 4, 5);
    private static final Set<Integer> VALID_STATUS = Set.of(1, 2);

    private final OrganicScoreDimensionMapper dimensionMapper;
    private final OrganicScoreRuleMapper ruleMapper;
    private final OperatorResolver operatorResolver;

    @Override
    public OrganicScoreConfigVO getConfig() {
        OrganicScoreConfigVO config = new OrganicScoreConfigVO();

        // 查询维度权重（按排序号升序）
        List<OrganicScoreDimension> dimensions = dimensionMapper.selectList(
                new LambdaQueryWrapper<OrganicScoreDimension>()
                        .orderByAsc(OrganicScoreDimension::getSortOrder));
        config.setDimensions(dimensions.stream().map(this::toDimensionVO).toList());

        // 查询全部评分规则（按维度 + 排序号升序）
        List<OrganicScoreRule> rules = ruleMapper.selectList(
                new LambdaQueryWrapper<OrganicScoreRule>()
                        .orderByAsc(OrganicScoreRule::getDimension)
                        .orderByAsc(OrganicScoreRule::getSortOrder));
        config.setRules(rules.stream().map(this::toRuleVO).toList());

        return config;
    }

    @Override
    @Transactional
    public void updateDimensionWeights(List<OrganicScoreDimensionRequest> requests) {
        if (requests == null || requests.isEmpty()) {
            throw new BusinessException("权重配置不能为空");
        }
        String operator = operatorResolver.currentOperatorName();
        int totalWeight = 0;

        for (OrganicScoreDimensionRequest req : requests) {
            if (!VALID_DIMENSIONS.contains(req.getDimension())) {
                throw new BusinessException("无效的维度值: " + req.getDimension());
            }
            if (req.getWeight() == null || req.getWeight() < 0 || req.getWeight() > 100) {
                throw new BusinessException("权重必须在 0~100 之间");
            }
            totalWeight += req.getWeight();

            // 查找已有记录
            OrganicScoreDimension entity = dimensionMapper.selectOne(
                    new LambdaQueryWrapper<OrganicScoreDimension>()
                            .eq(OrganicScoreDimension::getDimension, req.getDimension()));
            if (entity == null) {
                entity = new OrganicScoreDimension();
                entity.setDimension(req.getDimension());
                entity.setWeight(req.getWeight());
                entity.setSortOrder(req.getDimension());
                entity.setUpdatedBy(operator);
                dimensionMapper.insert(entity);
            } else {
                entity.setWeight(req.getWeight());
                entity.setUpdatedBy(operator);
                dimensionMapper.updateById(entity);
            }
        }

        if (totalWeight != 100) {
            throw new BusinessException("维度权重总和必须等于 100%，当前为 " + totalWeight + "%");
        }
    }

    @Override
    @Transactional
    public OrganicScoreRuleVO createRule(OrganicScoreRuleRequest request) {
        validateRuleRequest(request);
        String operator = operatorResolver.currentOperatorName();

        // 生成规则编码
        String prefix = switch (request.getDimension()) {
            case 1 -> "COM";
            case 4 -> "PLT";
            default -> "ST";
        };
        String ruleCode = prefix + "_CUSTOM_" + System.currentTimeMillis();

        OrganicScoreRule entity = new OrganicScoreRule();
        entity.setRuleCode(ruleCode);
        entity.setDimension(request.getDimension());
        entity.setName(request.getName());
        entity.setDescription(request.getDescription());
        entity.setMode(request.getMode());
        entity.setScore(request.getScore() != null ? request.getScore() : 0);
        entity.setStatDays(request.getStatDays());
        entity.setRangeScores(request.getRangeScores());
        entity.setTiers(request.getTiers());
        entity.setCalcCycle(request.getCalcCycle());
        entity.setStatus(request.getStatus());
        entity.setBuiltin(0);
        entity.setSortOrder(999);
        entity.setUpdatedBy(operator);
        ruleMapper.insert(entity);
        return toRuleVO(entity);
    }

    @Override
    @Transactional
    public OrganicScoreRuleVO updateRule(Long id, OrganicScoreRuleRequest request) {
        validateRuleRequest(request);
        OrganicScoreRule entity = ruleMapper.selectById(id);
        if (entity == null) {
            throw new BusinessException("评分规则不存在");
        }

        entity.setDimension(request.getDimension());
        entity.setName(request.getName());
        entity.setDescription(request.getDescription());
        entity.setMode(request.getMode());
        entity.setScore(request.getScore() != null ? request.getScore() : 0);
        entity.setStatDays(request.getStatDays());
        entity.setRangeScores(request.getRangeScores());
        entity.setTiers(request.getTiers());
        entity.setCalcCycle(request.getCalcCycle());
        entity.setStatus(request.getStatus());
        entity.setUpdatedBy(operatorResolver.currentOperatorName());
        ruleMapper.updateById(entity);
        return toRuleVO(entity);
    }

    @Override
    @Transactional
    public void toggleRuleStatus(Long id) {
        OrganicScoreRule entity = ruleMapper.selectById(id);
        if (entity == null) {
            throw new BusinessException("评分规则不存在");
        }
        entity.setStatus(entity.getStatus() == 1 ? 2 : 1);
        entity.setUpdatedBy(operatorResolver.currentOperatorName());
        ruleMapper.updateById(entity);
    }

    @Override
    @Transactional
    public void deleteRule(Long id) {
        OrganicScoreRule entity = ruleMapper.selectById(id);
        if (entity == null) {
            throw new BusinessException("评分规则不存在");
        }
        if (entity.getBuiltin() != null && entity.getBuiltin() == 1) {
            throw new BusinessException("系统内置规则不可删除");
        }
        ruleMapper.deleteById(id);
    }

    @Override
    @Transactional
    public void updateRuleScore(Long id, Integer score) {
        OrganicScoreRule entity = ruleMapper.selectById(id);
        if (entity == null) {
            throw new BusinessException("评分规则不存在");
        }
        if (score == null) {
            throw new BusinessException("分值不能为空");
        }
        entity.setScore(score);
        entity.setUpdatedBy(operatorResolver.currentOperatorName());
        ruleMapper.updateById(entity);
    }

    /** 校验规则请求参数 */
    private void validateRuleRequest(OrganicScoreRuleRequest request) {
        if (!VALID_DIMENSIONS.contains(request.getDimension())) {
            throw new BusinessException("无效的维度值: " + request.getDimension());
        }
        if (!VALID_MODES.contains(request.getMode())) {
            throw new BusinessException("无效的计分方式: " + request.getMode());
        }
        if (!VALID_STATUS.contains(request.getStatus())) {
            throw new BusinessException("无效的状态值: " + request.getStatus());
        }
    }

    /** 维度实体 → VO */
    private OrganicScoreDimensionVO toDimensionVO(OrganicScoreDimension entity) {
        OrganicScoreDimensionVO vo = new OrganicScoreDimensionVO();
        vo.setId(entity.getId());
        vo.setDimension(entity.getDimension());
        vo.setWeight(entity.getWeight());
        vo.setSortOrder(entity.getSortOrder());
        return vo;
    }

    /** 规则实体 → VO */
    private OrganicScoreRuleVO toRuleVO(OrganicScoreRule entity) {
        OrganicScoreRuleVO vo = new OrganicScoreRuleVO();
        vo.setId(entity.getId());
        vo.setRuleCode(entity.getRuleCode());
        vo.setDimension(entity.getDimension());
        vo.setName(entity.getName());
        vo.setDescription(entity.getDescription());
        vo.setMode(entity.getMode());
        vo.setScore(entity.getScore());
        vo.setStatDays(entity.getStatDays());
        vo.setRangeScores(entity.getRangeScores());
        vo.setTiers(entity.getTiers());
        vo.setCalcCycle(entity.getCalcCycle());
        vo.setStatus(entity.getStatus());
        vo.setBuiltin(entity.getBuiltin());
        vo.setSortOrder(entity.getSortOrder());
        vo.setUpdatedBy(entity.getUpdatedBy());
        vo.setUpdateTime(entity.getUpdatedAt() != null ? entity.getUpdatedAt().format(DISPLAY_FMT) : null);
        return vo;
    }
}
