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
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 自然流量评分配置管理服务实现
 */
@Service
@RequiredArgsConstructor
public class OrganicScoreServiceImpl implements OrganicScoreService {

    private static final DateTimeFormatter DISPLAY_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final Set<Integer> VALID_DIMENSIONS = Set.of(1, 2, 4);
    private static final Set<Integer> VALID_MODES = Set.of(1, 2, 3, 4, 5, 6);
    private static final Set<Integer> VALID_STATUS = Set.of(1, 2);

    /** 维度 → 编码前缀映射 */
    private static final String PREFIX_COM = "COM";
    private static final String PREFIX_STB = "STB";
    private static final String PREFIX_PLT = "PLT";

    /** 匹配规范编码的正则：PREFIX_数字（如 COM_01, STB_12, PLT_06） */
    private static final Pattern CODE_PATTERN = Pattern.compile("^([A-Z]+)_(\\d+)$");

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

        // 生成规范编码：根据维度取前缀，查询该维度已有最大序号自增
        String ruleCode = generateNextRuleCode(request.getDimension());

        OrganicScoreRule entity = new OrganicScoreRule();
        entity.setRuleCode(ruleCode);
        entity.setDimension(request.getDimension());
        entity.setName(request.getName());
        entity.setDescription(request.getDescription());
        entity.setMode(request.getMode());
        entity.setScore(request.getScore() != null ? request.getScore() : 0);
        entity.setStatDays(request.getStatDays());
        entity.setStatDaysTotal(request.getStatDaysTotal());
        entity.setStatDaysRecent(request.getStatDaysRecent());
        entity.setRangeScores(request.getRangeScores());
        entity.setTimeRangeScores(request.getTimeRangeScores());
        entity.setTiers(request.getTiers());
        entity.setConditionItems(request.getConditionItems());
        entity.setCalcCycle(request.getCalcCycle());
        entity.setCalcIntervalHours(request.getCalcIntervalHours());
        entity.setPeakTimeRanges(request.getPeakTimeRanges());
        entity.setDeductionPerOrder(request.getDeductionPerOrder());
        entity.setDecayCoefficient(request.getDecayCoefficient());
        entity.setBlockedMerchants(request.getBlockedMerchants());
        entity.setActivityItems(request.getActivityItems());
        entity.setPrerequisites(request.getPrerequisites());
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
        entity.setStatDaysTotal(request.getStatDaysTotal());
        entity.setStatDaysRecent(request.getStatDaysRecent());
        entity.setRangeScores(request.getRangeScores());
        entity.setTimeRangeScores(request.getTimeRangeScores());
        entity.setTiers(request.getTiers());
        entity.setConditionItems(request.getConditionItems());
        entity.setCalcCycle(request.getCalcCycle());
        entity.setCalcIntervalHours(request.getCalcIntervalHours());
        entity.setPeakTimeRanges(request.getPeakTimeRanges());
        entity.setDeductionPerOrder(request.getDeductionPerOrder());
        entity.setDecayCoefficient(request.getDecayCoefficient());
        entity.setBlockedMerchants(request.getBlockedMerchants());
        entity.setActivityItems(request.getActivityItems());
        entity.setPrerequisites(request.getPrerequisites());
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

    /* ──────── 支持规则编码（如 COM_07）或数字ID 的便捷方法 ──────── */

    @Override
    @Transactional
    public OrganicScoreRuleVO updateRuleByIdentifier(String identifier, OrganicScoreRuleRequest request) {
        return updateRule(resolveRuleId(identifier), request);
    }

    @Override
    @Transactional
    public void toggleRuleStatusByIdentifier(String identifier) {
        toggleRuleStatus(resolveRuleId(identifier));
    }

    @Override
    @Transactional
    public void deleteRuleByIdentifier(String identifier) {
        deleteRule(resolveRuleId(identifier));
    }

    @Override
    @Transactional
    public void updateRuleScoreByIdentifier(String identifier, Integer score) {
        updateRuleScore(resolveRuleId(identifier), score);
    }

    /**
     * 将路径参数解析为数字ID：
     * - 纯数字 → 直接作为 ID
     * - 非数字（如 COM_07） → 按 rule_code 查询对应 ID
     * 注意：@TableLogic 已自动过滤 deleted=1 的记录，无需显式添加 deleted 条件
     */
    private Long resolveRuleId(String identifier) {
        if (identifier == null || identifier.isBlank()) {
            throw new BusinessException("规则标识不能为空");
        }
        try {
            return Long.parseLong(identifier);
        } catch (NumberFormatException ignored) {
            // 非纯数字，按 rule_code 查找
        }
        OrganicScoreRule rule = ruleMapper.selectOne(
                new LambdaQueryWrapper<OrganicScoreRule>()
                        .eq(OrganicScoreRule::getRuleCode, identifier)
                        .last("LIMIT 1"));
        if (rule == null) {
            throw new BusinessException("评分规则不存在: " + identifier);
        }
        return rule.getId();
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

    /**
     * 根据维度生成下一个规范编码
     * <p>
     * 编码规则：
     * - 商业维度(1): COM_01 → COM_99 → COM_100
     * - 店铺维度(2): STB_01 → STB_02 → ...
     * - 平台维度(4): PLT_01 → PLT_02 → ...
     */
    private String generateNextRuleCode(Integer dimension) {
        String prefix = switch (dimension) {
            case 1 -> PREFIX_COM;
            case 2 -> PREFIX_STB;
            case 4 -> PREFIX_PLT;
            default -> throw new BusinessException("无效的维度值: " + dimension);
        };

        // 查询该维度下所有未删除的规则（@TableLogic 自动过滤 deleted）
        List<OrganicScoreRule> existingRules = ruleMapper.selectList(
                new LambdaQueryWrapper<OrganicScoreRule>()
                        .eq(OrganicScoreRule::getDimension, dimension));

        // 找出该前缀下最大的序号
        int maxSeq = 0;
        for (OrganicScoreRule rule : existingRules) {
            Matcher matcher = CODE_PATTERN.matcher(rule.getRuleCode());
            if (matcher.matches() && matcher.group(1).equals(prefix)) {
                int seq = Integer.parseInt(matcher.group(2));
                maxSeq = Math.max(maxSeq, seq);
            }
        }

        int nextSeq = maxSeq + 1;

        // 编码格式：前缀 + _ + 两位数字（01~99）或更多位数字（100+）
        return String.format("%s_%02d", prefix, nextSeq);
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
        vo.setPrerequisites(entity.getPrerequisites());
        vo.setStatDays(entity.getStatDays());
        vo.setStatDaysTotal(entity.getStatDaysTotal());
        vo.setStatDaysRecent(entity.getStatDaysRecent());
        vo.setRangeScores(entity.getRangeScores());
        vo.setTimeRangeScores(entity.getTimeRangeScores());
        vo.setTiers(entity.getTiers());
        vo.setConditionItems(entity.getConditionItems());
        vo.setCalcCycle(entity.getCalcCycle());
        vo.setCalcIntervalHours(entity.getCalcIntervalHours());
        vo.setPeakTimeRanges(entity.getPeakTimeRanges());
        vo.setDeductionPerOrder(entity.getDeductionPerOrder());
        vo.setDecayCoefficient(entity.getDecayCoefficient());
        vo.setBlockedMerchants(entity.getBlockedMerchants());
        vo.setActivityItems(entity.getActivityItems());
        vo.setStatus(entity.getStatus());
        vo.setBuiltin(entity.getBuiltin());
        vo.setSortOrder(entity.getSortOrder());
        vo.setUpdatedBy(entity.getUpdatedBy());
        vo.setUpdateTime(entity.getUpdatedAt() != null ? entity.getUpdatedAt().format(DISPLAY_FMT) : null);
        return vo;
    }
}
