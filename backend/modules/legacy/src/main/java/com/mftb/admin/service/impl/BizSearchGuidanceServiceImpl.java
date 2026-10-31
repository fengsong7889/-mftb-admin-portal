package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.entity.BizSearchGuidance;
import com.mftb.admin.mapper.BizSearchGuidanceMapper;
import com.mftb.admin.service.BizSearchGuidanceService;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.List;
import java.util.Set;

/**
 * 搜索引导配置服务实现。
 * <p>后端为安全边界：对所有前端字段重新校验（枚举、长度、范围、日期区间），前端校验仅负责 UX。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class BizSearchGuidanceServiceImpl implements BizSearchGuidanceService {

    /** 合法枚举集合（方案 §11.2：类型/来源/场景/频道均为受控枚举，未知值拒绝） */
    private static final Set<Integer> WORD_TYPES = Set.of(1, 2, 3, 4);
    private static final Set<Integer> SOURCES = Set.of(1, 2, 3);
    private static final Set<Integer> SURFACES = Set.of(1, 2, 3);
    private static final Set<Integer> BIZ_CHANNELS = Set.of(1, 2, 3);

    private final BizSearchGuidanceMapper mapper;
    private final OperatorResolver operatorResolver;

    @Override
    public List<BizSearchGuidance> list(Integer wordType, String brand, Integer surface, Integer status) {
        LambdaQueryWrapper<BizSearchGuidance> wrapper = new LambdaQueryWrapper<>();
        if (wordType != null) wrapper.eq(BizSearchGuidance::getWordType, wordType);
        if (StringUtils.hasText(brand)) wrapper.eq(BizSearchGuidance::getBrand, brand);
        if (surface != null) wrapper.eq(BizSearchGuidance::getSurface, surface);
        if (status != null) wrapper.eq(BizSearchGuidance::getStatus, status);
        wrapper.orderByAsc(BizSearchGuidance::getPriority).orderByDesc(BizSearchGuidance::getId);
        return mapper.selectList(wrapper);
    }

    @Override
    public long create(BizSearchGuidance guidance) {
        validate(guidance);
        guidance.setId(null);
        if (!StringUtils.hasText(guidance.getConfigNo())) {
            // interim：时间戳取号保证唯一；正式编号规则（BizSeqService + 编号规则登记）随菜单/权限注册一并接入。
            guidance.setConfigNo("SG" + System.currentTimeMillis());
        }
        if (guidance.getPriority() == null) guidance.setPriority(1);
        if (guidance.getSource() == null) guidance.setSource(1);
        if (guidance.getSurface() == null) guidance.setSurface(1);
        if (guidance.getApprovalStatus() == null) guidance.setApprovalStatus(1);
        if (guidance.getStatus() == null) guidance.setStatus(1);
        String operator = operatorResolver.currentOperatorName();
        guidance.setCreatedBy(operator);
        guidance.setUpdatedBy(operator);
        mapper.insert(guidance);
        return guidance.getId();
    }

    @Override
    public void update(Long id, BizSearchGuidance guidance) {
        BizSearchGuidance existing = mapper.selectById(id);
        if (existing == null) throw new BusinessException("引导配置不存在");
        validate(guidance);
        guidance.setId(id);
        guidance.setConfigNo(existing.getConfigNo()); // 编号不可变
        guidance.setUpdatedBy(operatorResolver.currentOperatorName());
        mapper.updateById(guidance);
    }

    @Override
    public void updateStatus(Long id, Integer status) {
        if (status == null || (status != 1 && status != 2)) throw new BusinessException("非法状态值");
        BizSearchGuidance existing = mapper.selectById(id);
        if (existing == null) throw new BusinessException("引导配置不存在");
        existing.setStatus(status);
        existing.setUpdatedBy(operatorResolver.currentOperatorName());
        mapper.updateById(existing);
    }

    @Override
    public void delete(Long id) {
        BizSearchGuidance existing = mapper.selectById(id);
        if (existing == null) throw new BusinessException("引导配置不存在");
        mapper.deleteById(id);
    }

    /** 后端安全校验：必填、长度、枚举、范围、日期区间。 */
    private void validate(BizSearchGuidance g) {
        if (!StringUtils.hasText(g.getDisplayText())) throw new BusinessException("展示词不能为空");
        if (g.getDisplayText().length() > 64) throw new BusinessException("展示词最多 64 字");
        if (!StringUtils.hasText(g.getTargetQuery())) throw new BusinessException("提交搜索词不能为空");
        if (g.getTargetQuery().length() > 64) throw new BusinessException("提交搜索词最多 64 字");
        if (g.getWordType() == null || !WORD_TYPES.contains(g.getWordType())) throw new BusinessException("非法的引导词类型");
        if (g.getSource() != null && !SOURCES.contains(g.getSource())) throw new BusinessException("非法的来源类型");
        if (g.getSurface() != null && !SURFACES.contains(g.getSurface())) throw new BusinessException("非法的场景");
        if (g.getBizChannel() != null && !BIZ_CHANNELS.contains(g.getBizChannel())) throw new BusinessException("非法的业务频道");
        if (g.getPriority() != null && (g.getPriority() < 1 || g.getPriority() > 20)) throw new BusinessException("展示次序须在 1~20");
        if (g.getStartDate() != null && g.getEndDate() != null && g.getEndDate().isBefore(g.getStartDate())) {
            throw new BusinessException("结束日期不得早于开始日期");
        }
        // 候选热词(4)属系统采集，不允许标为商业计划来源(3)，避免把付费项混入自然热搜
        if (Integer.valueOf(4).equals(g.getWordType()) && Integer.valueOf(3).equals(g.getSource())) {
            throw new BusinessException("候选热词不得标为商业计划来源");
        }
    }
}
